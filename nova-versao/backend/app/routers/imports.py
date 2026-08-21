from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, require_company
from app.companies import COMPANY_BY_ID
from app.extract.pipeline import classify_and_extract
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
        if it.get("tipo") in ("icms_st", "ipi", "pis", "cofins", "impostos", "irpj"):
            it["competencia"] = chosen
            it.setdefault("warnings", []).append(f"Competência herdada do lote: {chosen}")


@router.post("/preview")
async def preview(
    files: list[UploadFile] = File(...),
    company_id: str | None = Form(default=None),
    user: User = Depends(current_user),
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
            extracted = classify_and_extract(tmp_path, data, db=db)
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
        existing = (
            db.query(ImportRecord).filter(ImportRecord.file_hash == extracted["file_hash"]).first()
            if extracted.get("file_hash")
            else None
        )
        slot = None
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
        extracted["duplicateHash"] = bool(existing)
        extracted["slotExists"] = slot is not None
        extracted["ok"] = not extracted.get("errors")
        items.append(extracted)

    _inherit_batch_competencia(items)
    for extracted in items:
        if extracted.get("errors"):
            extracted["ok"] = False
            continue
        if not extracted.get("company_id"):
            extracted.setdefault("errors", []).append("Empresa não identificada")
            extracted["ok"] = False
            continue
        if not extracted.get("competencia"):
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
def commit(body: CommitIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    preview = _PREVIEWS.get(body.previewId)
    if not preview or preview["user_id"] != user.id:
        raise HTTPException(400, "Preview expirado. Envie os arquivos de novo.")
    saved = []
    cleared_slots: set[tuple[str, str, str]] = set()
    slot_rows: dict[tuple[str, str, str], FiscalMonth] = {}
    try:
        for item in preview["items"]:
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
            if item.get("duplicateHash") and not body.replace:
                saved.append({"file": item.get("file"), "status": "duplicata", "companyId": company_id})
                continue
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
            if body.replace and slot_key not in cleared_slots:
                row.pack = {}
                db.query(NfeLine).filter(
                    NfeLine.company_id == company_id,
                    NfeLine.competencia == competencia,
                    NfeLine.unidade == unidade,
                ).delete(synchronize_session=False)
                cleared_slots.add(slot_key)
            patch = item.get("pack_patch") or {}
            row.pack = _deep_merge(row.pack or {}, patch)
            if file_hash:
                existing_imp = db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
                if existing_imp and not body.replace:
                    pass
                elif existing_imp and body.replace:
                    existing_imp.status = "replaced"
                    existing_imp.meta = item.get("meta") or {}
                else:
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
