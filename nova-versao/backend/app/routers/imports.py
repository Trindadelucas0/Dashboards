from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin, require_company
from app.companies import COMPANY_BY_ID
from app.extract.pipeline import classify_and_extract
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.workbook import safe_unlink
from app.models import Company, FiscalMonth, ImportRecord, NfeLine, User
from app.security import sha256_bytes

router = APIRouter(prefix="/api/imports", tags=["imports"])

_PREVIEWS: dict[str, dict] = {}


class CommitIn(BaseModel):
    previewId: str
    replace: bool = False
    companyId: str | None = None


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _pack_has_tipo(pack: dict | None, tipo: str) -> bool:
    pack = pack or {}
    if tipo == "dre":
        dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
        return bool(pack.get("hasDre") and (dre.get("linhas") or dre.get("hasValores")))
    if tipo == "balancete":
        bal = pack.get("balancete") if isinstance(pack.get("balancete"), dict) else {}
        return bool(pack.get("hasBalancete") or bal.get("contas"))
    ap = pack.get("apuracao") if isinstance(pack.get("apuracao"), dict) else {}
    if tipo == "apuracao_5005":
        return bool(pack.get("memoriaCalculo") or ap.get("icms"))
    if tipo in ("pis", "cofins", "pis_cofins"):
        return bool(ap.get("pis") or ap.get("cofins"))
    if tipo == "icms_st":
        return bool(ap.get("icmsSt"))
    if tipo == "ipi":
        return bool(ap.get("ipi"))
    if tipo == "irpj":
        return bool(ap.get("irpj"))
    if tipo == "csll":
        return bool(ap.get("csll"))
    if tipo == "difal":
        return bool(ap.get("difal"))
    if tipo == "icms":
        return bool(ap.get("icms"))
    return False


def _assign_pack(row: FiscalMonth, pack: dict) -> None:
    row.pack = pack
    flag_modified(row, "pack")


def _apply_session_company(extracted: dict, company_id: str | None, db: Session) -> None:
    if not company_id:
        return
    dest = COMPANY_BY_ID.get(company_id) or db.query(Company).filter(Company.id == company_id).first()
    if not dest:
        return
    label = getattr(dest, "label", None) or company_id
    mapped = extracted.get("company_id")
    if mapped and mapped != company_id:
        if company_id in COMPANY_BY_ID:
            extracted.setdefault("errors", []).append(
                f"Planilha é da empresa {extracted.get('company_label')} e não de {company_id}"
            )
            return
        extracted.setdefault("warnings", []).append(
            f"CNPJ da planilha aponta {extracted.get('company_label') or mapped}. Gravando em {label}."
        )
    if not mapped:
        extracted.setdefault("warnings", []).append(f"Empresa herdada do dashboard: {label}")
    extracted["company_id"] = company_id
    extracted["company_label"] = label


def _inherit_batch_competencia(items: list[dict]) -> None:
    comps = [it.get("competencia") for it in items if it.get("competencia") and it.get("ok") is not False]
    if not comps:
        comps = [it.get("competencia") for it in items if it.get("competencia")]
    if not comps:
        return
    # prefer most common competência
    chosen = max(set(comps), key=comps.count)
    for it in items:
        if it.get("competencia"):
            continue
        if it.get("tipo") in (
            "icms_st",
            "icms",
            "ipi",
            "pis",
            "cofins",
            "pis_cofins",
            "impostos",
            "irpj",
            "csll",
            "difal",
            "apuracao_5005",
            "dre",
            "balancete",
        ):
            it["competencia"] = chosen
            it.setdefault("warnings", []).append(f"Competência herdada do lote: {chosen}")


@router.post("/preview")
async def preview(
    files: list[UploadFile] = File(...),
    company_id: str | None = Form(default=None),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if company_id:
        require_company(company_id, user, db)
    items = []
    for up in files:
        name = up.filename or "arquivo.xls"
        low = name.lower()
        if not (low.endswith(".xls") or low.endswith(".xlsx")):
            items.append({"file": name, "errors": ["Extensão não permitida"], "ok": False})
            continue
        data = await up.read()
        suffix = Path(name).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            company_cnpj = ""
            if company_id:
                dest = COMPANY_BY_ID.get(company_id) or db.query(Company).filter(Company.id == company_id).first()
                if dest and getattr(dest, "cnpj", None):
                    company_cnpj = str(dest.cnpj)
            extracted = classify_and_extract(
                tmp_path, data, db=db, original_filename=name, company_cnpj=company_cnpj
            )
        except Exception as exc:  # noqa: BLE001
            extracted = {
                "file": name,
                "errors": [f"Não foi possível ler o arquivo: {exc}"],
                "warnings": [],
                "ok": False,
                "tipo": "",
                "company_id": None,
                "competencia": "",
                "unidade": "matriz",
                "pack_patch": None,
                "lines": [],
                "meta": {},
            }
        finally:
            safe_unlink(tmp_path)
        extracted["file_hash"] = sha256_bytes(data)
        extracted["file"] = name
        _apply_session_company(extracted, company_id, db)
        expanded = expand_workbook_parts(extracted)
        for part in expanded:
            # Hash por aba (expand_workbook_parts); não sobrescrever com hash do arquivo inteiro
            # — senão qualquer part gravada marca as demais como duplicateHash.
            if not part.get("file_hash"):
                part["file_hash"] = extracted.get("file_hash")
            part["source_file_hash"] = extracted.get("file_hash")
            _apply_session_company(part, company_id, db)
            existing = (
                db.query(ImportRecord).filter(ImportRecord.file_hash == part.get("file_hash")).first()
                if part.get("file_hash")
                else None
            )
            part["duplicateHash"] = bool(existing)
            slot = None
            if part.get("company_id") and part.get("competencia"):
                slot = (
                    db.query(FiscalMonth)
                    .filter(
                        FiscalMonth.company_id == part["company_id"],
                        FiscalMonth.competencia == part["competencia"],
                        FiscalMonth.unidade == (part.get("unidade") or "matriz"),
                    )
                    .first()
                )
            part["slotExists"] = slot is not None
            if part.get("skipped"):
                part["ok"] = True
            else:
                part["ok"] = not part.get("errors")
            items.append(part)

    _inherit_batch_competencia(items)
    for extracted in items:
        if extracted.get("skipped"):
            extracted["ok"] = True
            continue
        if extracted.get("errors"):
            extracted["ok"] = False
            continue
        if not extracted.get("company_id"):
            if extracted.get("tipo") == "workbook_padrao":
                extracted.setdefault("warnings", []).append("Empresa será definida ao gravar no dashboard aberto")
            else:
                extracted.setdefault("errors", []).append("Empresa não identificada")
                extracted["ok"] = False
            continue
        if not extracted.get("competencia"):
            if extracted.get("pack_patch") is None and extracted.get("status") in ("vazia", "ignorada"):
                extracted["ok"] = True
                continue
            extracted.setdefault("errors", []).append("Competência não identificada")
            extracted["ok"] = False
            continue
        if extracted.get("company_id") and extracted.get("competencia"):
            slot = (
                db.query(FiscalMonth)
                .filter(
                    FiscalMonth.company_id == extracted["company_id"],
                    FiscalMonth.competencia == extracted["competencia"],
                    FiscalMonth.unidade == (extracted.get("unidade") or "matriz"),
                )
                .first()
            )
            extracted["slotExists"] = slot is not None
        extracted["ok"] = not extracted.get("errors")

    preview_id = str(uuid4())
    _PREVIEWS[preview_id] = {"items": items, "user_id": user.id}
    return {"previewId": preview_id, "items": items}


def _get_or_create_month(
    db: Session,
    slot_rows: dict[tuple[str, str, str], FiscalMonth],
    company_id: str,
    competencia: str,
    unidade: str,
) -> FiscalMonth:
    """Um único FiscalMonth por slot no mesmo commit (vários arquivos do mesmo mês)."""
    slot_key = (company_id, competencia, unidade)
    row = slot_rows.get(slot_key)
    if row is not None:
        return row
    row = (
        db.query(FiscalMonth)
        .filter(
            FiscalMonth.company_id == company_id,
            FiscalMonth.competencia == competencia,
            FiscalMonth.unidade == unidade,
        )
        .first()
    )
    if row is None:
        row = FiscalMonth(
            company_id=company_id,
            competencia=competencia,
            unidade=unidade,
            pack={},
        )
        db.add(row)
        db.flush()
    slot_rows[slot_key] = row
    return row


@router.post("/commit")
def commit(body: CommitIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    preview = _PREVIEWS.get(body.previewId)
    if not preview or preview["user_id"] != user.id:
        raise HTTPException(400, "Preview expirado. Envie os arquivos de novo.")
    saved = []
    cleared_slots: set[tuple[str, str, str]] = set()
    slot_rows: dict[tuple[str, str, str], FiscalMonth] = {}
    pending_hashes: set[str] = set()
    try:
        for item in preview["items"]:
            if item.get("skipped") or not item.get("pack_patch"):
                saved.append(
                    {
                        "file": item.get("file"),
                        "status": "ignorado",
                        "warnings": item.get("warnings") or ["Aba vazia ou ignorada"],
                    }
                )
                continue
            if item.get("errors") or not item.get("ok"):
                saved.append(
                    {
                        "file": item.get("file"),
                        "status": "recusado",
                        "errors": item.get("errors") or ["Validação falhou"],
                    }
                )
                continue
            company_id = body.companyId or item.get("company_id")
            if not company_id:
                continue
            require_company(company_id, user, db)
            competencia = item.get("competencia")
            unidade = item.get("unidade") or "matriz"
            tipo = item.get("tipo")
            file_hash = item.get("file_hash")
            if not competencia:
                saved.append(
                    {
                        "file": item.get("file"),
                        "status": "recusado",
                        "errors": ["Competência não identificada"],
                    }
                )
                continue
            slot_key = (company_id, competencia, unidade)
            row = _get_or_create_month(db, slot_rows, company_id, competencia, unidade)
            if item.get("duplicateHash") and not body.replace:
                if _pack_has_tipo(row.pack, tipo):
                    saved.append({"file": item.get("file"), "status": "duplicata", "companyId": company_id})
                    continue
            if body.replace and slot_key not in cleared_slots:
                _assign_pack(row, {})
                db.query(NfeLine).filter(
                    NfeLine.company_id == company_id,
                    NfeLine.competencia == competencia,
                    NfeLine.unidade == unidade,
                ).delete(synchronize_session=False)
                cleared_slots.add(slot_key)
            patch = item.get("pack_patch") or {}
            _assign_pack(row, _deep_merge(row.pack or {}, patch))
            if file_hash:
                existing_imp = db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
                if existing_imp and not body.replace:
                    pass
                elif existing_imp and body.replace:
                    existing_imp.status = "replaced"
                    existing_imp.meta = item.get("meta") or {}
                elif file_hash not in pending_hashes:
                    db.add(
                        ImportRecord(
                            company_id=company_id,
                            competencia=competencia,
                            unidade=unidade,
                            tipo=tipo,
                            file_hash=file_hash,
                            file_name=item.get("file") or "",
                            status="ok",
                            meta=item.get("meta") or {},
                        )
                    )
                    pending_hashes.add(file_hash)
            for line in item.get("lines") or []:
                try:
                    with db.begin_nested():
                        db.add(
                            NfeLine(
                                company_id=company_id,
                                competencia=competencia,
                                unidade=unidade,
                                tipo=tipo,
                                nota=str(line.get("nota") or ""),
                                serie=str(line.get("serie") or ""),
                                cfop=str(line.get("cfop") or ""),
                                valor=line.get("valor") or 0,
                                nome=line.get("nome") or "",
                                doc=line.get("doc") or "",
                                uf=line.get("uf") or "",
                            )
                        )
                except IntegrityError:
                    continue
            saved.append(
                {
                    "file": item.get("file"),
                    "status": "saved",
                    "companyId": company_id,
                    "competencia": competencia,
                    "unidade": unidade,
                    "tipo": tipo,
                }
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    _PREVIEWS.pop(body.previewId, None)
    return {"saved": saved}
