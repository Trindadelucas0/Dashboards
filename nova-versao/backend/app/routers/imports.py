from __future__ import annotations

import copy
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin, require_company
from app.companies import COMPANY_BY_ID
from app.extract.aggregate import preserve_simples_receita
from app.extract.pipeline import classify_and_extract
from app.extract.parse_workbook_padrao import expand_workbook_parts
from app.extract.workbook import safe_unlink
from app.imports_revert import (
    CONFLICT_DETAIL,
    apply_legacy_key_removal,
    deep_merge,
    pack_has_useful_data,
    rebuild_pack,
    slot_revert_mode,
)
from app.models import Company, FiscalMonth, ImportRecord, NfeLine, User
from app.security import sha256_bytes

router = APIRouter(prefix="/api/imports", tags=["imports"])

_PREVIEWS: dict[str, dict] = {}


class CommitIn(BaseModel):
    previewId: str
    replace: bool = False
    companyId: str | None = None


def _deep_merge(base: dict, patch: dict) -> dict:
    return deep_merge(base, patch)


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
    if tipo == "irpj_csll":
        return bool(ap.get("irpj") or ap.get("csll"))
    if tipo == "difal":
        return bool(ap.get("difal"))
    if tipo == "icms":
        return bool(ap.get("icms"))
    if tipo == "venda_produto":
        vp = pack.get("vendaProduto")
        return isinstance(vp, dict) and bool(vp.get("resumo") or vp.get("produtos"))
    return False


def _assign_pack(row: FiscalMonth, pack: dict) -> None:
    row.pack = preserve_simples_receita(pack)
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
            "irpj_csll",
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
            if extracted.get("tipo") in ("workbook_padrao", "dre_vertical", "dre", "impostos_mensal"):
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


def _bind_import_record(
    db: Session,
    pending_by_hash: dict[str, ImportRecord],
    item: dict,
    *,
    company_id: str,
    competencia: str,
    unidade: str,
    tipo: str,
    file_hash: str | None,
    patch: dict,
) -> ImportRecord | None:
    """Grava ou atualiza o ImportRecord do item e devolve o id usado nas NFs."""
    if not file_hash:
        return None
    source_hash = item.get("source_file_hash") or file_hash
    stored_patch = copy.deepcopy(patch)
    existing = pending_by_hash.get(file_hash)
    if existing is None:
        existing = db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
    if existing:
        existing.status = "ok"
        existing.meta = item.get("meta") or {}
        existing.pack_patch = stored_patch
        existing.source_file_hash = source_hash
        existing.file_name = item.get("file") or existing.file_name
        existing.company_id = company_id
        existing.competencia = competencia
        existing.unidade = unidade
        existing.tipo = tipo or existing.tipo
        flag_modified(existing, "pack_patch")
        flag_modified(existing, "meta")
        pending_by_hash[file_hash] = existing
        db.flush()
        return existing
    record = ImportRecord(
        company_id=company_id,
        competencia=competencia,
        unidade=unidade,
        tipo=tipo,
        file_hash=file_hash,
        file_name=item.get("file") or "",
        status="ok",
        meta=item.get("meta") or {},
        source_file_hash=source_hash,
        pack_patch=stored_patch,
    )
    db.add(record)
    db.flush()
    pending_by_hash[file_hash] = record
    return record


@router.post("/commit")
def commit(body: CommitIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    preview = _PREVIEWS.get(body.previewId)
    if not preview or preview["user_id"] != user.id:
        raise HTTPException(400, "Preview expirado. Envie os arquivos de novo.")
    saved = []
    cleared_slots: set[tuple[str, str, str]] = set()
    slot_rows: dict[tuple[str, str, str], FiscalMonth] = {}
    pending_by_hash: dict[str, ImportRecord] = {}
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
                db.query(ImportRecord).filter(
                    ImportRecord.company_id == company_id,
                    ImportRecord.competencia == competencia,
                    ImportRecord.unidade == unidade,
                    ImportRecord.status == "ok",
                ).update({ImportRecord.status: "replaced"}, synchronize_session="fetch")
                cleared_slots.add(slot_key)
            patch = item.get("pack_patch") or {}
            _assign_pack(row, _deep_merge(row.pack or {}, patch))
            record = _bind_import_record(
                db,
                pending_by_hash,
                item,
                company_id=company_id,
                competencia=competencia,
                unidade=unidade,
                tipo=tipo,
                file_hash=file_hash,
                patch=patch,
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
                                import_id=record.id if record else None,
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


def _import_views(rows: list[ImportRecord]) -> list[dict]:
    return [{"tipo": row.tipo, "pack_patch": row.pack_patch} for row in rows]


def _display_file_name(rows: list[ImportRecord]) -> str:
    bases: list[str] = []
    for row in rows:
        name = (row.file_name or "").strip()
        if " · " in name:
            name = name.split(" · ", 1)[0].strip()
        if name:
            bases.append(name)
    unique = list(dict.fromkeys(bases))
    if len(unique) == 1:
        return unique[0]
    return unique[0] if unique else "Planilha"


def _group_payload(rows: list[ImportRecord]) -> dict:
    ordered = sorted(rows, key=lambda row: row.id)
    head = ordered[0]
    slot_tipos: dict[tuple[str, str], list[str]] = {}
    for row in sorted(ordered, key=lambda item: (item.competencia, item.unidade or "", item.id)):
        key = (row.competencia, row.unidade or "matriz")
        bucket = slot_tipos.setdefault(key, [])
        if row.tipo and row.tipo not in bucket:
            bucket.append(row.tipo)
    created = min((row.created_at for row in ordered if row.created_at), default=None)
    return {
        "id": head.id,
        "fileName": _display_file_name(ordered),
        "createdAt": created.isoformat() if created else None,
        "reversible": all(row.pack_patch is not None for row in ordered),
        "slots": [
            {"competencia": comp, "unidade": unidade, "tipos": tipos}
            for (comp, unidade), tipos in slot_tipos.items()
        ],
    }


def _drop_month_if_empty(db: Session, row: FiscalMonth | None, company_id: str, competencia: str, unidade: str) -> None:
    if row is None:
        return
    left = (
        db.query(NfeLine)
        .filter(
            NfeLine.company_id == company_id,
            NfeLine.competencia == competencia,
            NfeLine.unidade == unidade,
        )
        .count()
    )
    if left == 0 and not pack_has_useful_data(row.pack or {}):
        db.delete(row)


def _apply_slot_revert(
    db: Session,
    slot_key: tuple[str, str, str],
    deleting: list[ImportRecord],
    remaining: list[ImportRecord],
    mode: str,
    deleted_ids: list[int],
) -> None:
    company_id, competencia, unidade = slot_key
    row = (
        db.query(FiscalMonth)
        .filter(
            FiscalMonth.company_id == company_id,
            FiscalMonth.competencia == competencia,
            FiscalMonth.unidade == unidade,
        )
        .first()
    )
    if mode == "rebuild" and row is not None:
        remaining_sorted = sorted(remaining, key=lambda item: (item.created_at or datetime.min, item.id))
        pack = rebuild_pack(
            row.pack or {},
            [item.pack_patch or {} for item in deleting],
            [item.pack_patch or {} for item in remaining_sorted],
        )
        _assign_pack(row, pack)
    elif mode == "legacy_only":
        if row is not None:
            _assign_pack(row, {})
        db.query(NfeLine).filter(
            NfeLine.company_id == company_id,
            NfeLine.competencia == competencia,
            NfeLine.unidade == unidade,
        ).delete(synchronize_session=False)
    elif mode == "legacy_strip":
        deleted_tipos = {item.tipo for item in deleting if item.tipo}
        remaining_tipos = {item.tipo for item in remaining if item.tipo}
        if row is not None:
            _assign_pack(row, apply_legacy_key_removal(row.pack or {}, deleted_tipos, remaining_tipos))
        if deleted_tipos:
            db.query(NfeLine).filter(
                NfeLine.company_id == company_id,
                NfeLine.competencia == competencia,
                NfeLine.unidade == unidade,
                NfeLine.tipo.in_(list(deleted_tipos)),
                or_(NfeLine.import_id.is_(None), NfeLine.import_id.in_(deleted_ids)),
            ).delete(synchronize_session=False)
    _drop_month_if_empty(db, row, company_id, competencia, unidade)


@router.get("")
def list_imports(companyId: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    require_company(companyId, user, db)
    rows = (
        db.query(ImportRecord)
        .filter(ImportRecord.company_id == companyId, ImportRecord.status == "ok")
        .order_by(ImportRecord.created_at.desc(), ImportRecord.id.desc())
        .all()
    )
    groups: dict[tuple, list[ImportRecord]] = {}
    for row in rows:
        if row.source_file_hash:
            key = ("hash", row.company_id, row.source_file_hash)
        else:
            key = ("id", row.id)
        groups.setdefault(key, []).append(row)
    items = [_group_payload(group) for group in groups.values()]
    items.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return {"items": items}


@router.delete("/{import_id}")
def delete_import(import_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.query(ImportRecord).filter(ImportRecord.id == import_id).first()
    if not record or record.status != "ok":
        raise HTTPException(status_code=404, detail="Planilha não encontrada.")
    require_company(record.company_id, user, db)
    if record.source_file_hash:
        group = (
            db.query(ImportRecord)
            .filter(
                ImportRecord.company_id == record.company_id,
                ImportRecord.source_file_hash == record.source_file_hash,
                ImportRecord.status == "ok",
            )
            .all()
        )
    else:
        group = [record]
    if not group:
        raise HTTPException(status_code=404, detail="Planilha não encontrada.")

    by_slot: dict[tuple[str, str, str], list[ImportRecord]] = {}
    for row in group:
        slot_key = (row.company_id, row.competencia, row.unidade or "matriz")
        by_slot.setdefault(slot_key, []).append(row)

    plans: list[tuple[tuple[str, str, str], list[ImportRecord], list[ImportRecord], str]] = []
    for slot_key, deleting in by_slot.items():
        company_id, competencia, unidade = slot_key
        deleting_ids = [row.id for row in deleting]
        remaining = (
            db.query(ImportRecord)
            .filter(
                ImportRecord.company_id == company_id,
                ImportRecord.competencia == competencia,
                ImportRecord.unidade == unidade,
                ImportRecord.status == "ok",
                ImportRecord.id.notin_(deleting_ids),
            )
            .all()
        )
        mode = slot_revert_mode(_import_views(deleting), _import_views(remaining))
        if mode == "conflict":
            raise HTTPException(status_code=409, detail=CONFLICT_DETAIL)
        plans.append((slot_key, deleting, remaining, mode))

    deleted_ids = [row.id for row in group]
    try:
        db.query(NfeLine).filter(NfeLine.import_id.in_(deleted_ids)).delete(synchronize_session=False)
        for slot_key, deleting, remaining, mode in plans:
            _apply_slot_revert(db, slot_key, deleting, remaining, mode, deleted_ids)
        db.query(ImportRecord).filter(ImportRecord.id.in_(deleted_ids)).delete(synchronize_session=False)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    return {
        "deleted": True,
        "slots": [
            {"competencia": comp, "unidade": unidade}
            for (_company, comp, unidade) in by_slot
        ],
    }
