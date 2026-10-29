from __future__ import annotations

import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.companies import COMPANY_BY_ID
from app.db import get_db
from app.deps import current_user, require_admin, require_company, require_tab
from app.extract.parse_bank_statement import BankStatementError, parse_bank_statement
from app.extract.workbook import safe_unlink
from app.models import BankStatementImport, BankTransaction, Company, CompanyCnpj, User
from app.security import sha256_bytes

router = APIRouter(tags=["bank-statements"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PREVIEW_TTL = timedelta(minutes=30)
UNCLASSIFIED_FILTER = "__blank__"
_PREVIEWS: dict[str, dict] = {}


class CommitIn(BaseModel):
    previewId: str
    replace: bool = False


def _active_key(company_id: str, unidade: str, bank_key: str, competencia: str) -> str:
    return f"{company_id}|{unidade}|{bank_key}|{competencia}"


def _require_unit(company_id: str, unidade: str, db: Session) -> str:
    normalized = (unidade or "matriz").strip()
    if normalized == "todas":
        raise HTTPException(400, "Selecione uma unidade específica para a conciliação bancária.")
    registered = COMPANY_BY_ID.get(company_id)
    if registered and normalized in {unit.key for unit in registered.units}:
        return normalized
    exists = (
        db.query(CompanyCnpj.id)
        .filter(CompanyCnpj.company_id == company_id, CompanyCnpj.unidade == normalized)
        .first()
    )
    # Empresas antigas podem ter somente o CNPJ principal em `companies`.
    # O catálogo expõe esse registro como unidade `matriz`, então a conciliação
    # precisa reconhecer a mesma unidade mesmo sem o alias em `company_cnpjs`.
    if not exists and normalized == "matriz":
        exists = db.query(Company.id).filter(Company.id == company_id).first()
    if not exists:
        raise HTTPException(400, "A unidade informada não pertence à empresa.")
    return normalized


def _purge_expired_previews() -> None:
    now = datetime.utcnow()
    for preview_id, preview in list(_PREVIEWS.items()):
        if now - preview["created_at"] > PREVIEW_TTL:
            _PREVIEWS.pop(preview_id, None)


def _active_statement_query(
    db: Session,
    company_id: str,
    unidade: str,
    bank_key: str,
    competencia: str,
):
    return db.query(BankStatementImport).filter(
        BankStatementImport.company_id == company_id,
        BankStatementImport.unidade == unidade,
        BankStatementImport.bank_key == bank_key,
        BankStatementImport.competencia == competencia,
        BankStatementImport.status == "active",
    )


def _serialize_classifications(items: list[dict]) -> list[dict]:
    return [
        {
            "label": str(item["label"]),
            "count": int(item["count"]),
            "total": float(item["total"]),
            "net": float(item["net"]),
        }
        for item in items
    ]


def _preview_payload(parsed: dict) -> dict:
    return {
        "bankKey": parsed["bank_key"],
        "bankName": parsed["bank_name"],
        "competencia": parsed["competencia"],
        "rowCount": parsed["row_count"],
        "unclassifiedCount": parsed["unclassified_count"],
        "totalIn": float(parsed["total_in"]),
        "totalOut": float(parsed["total_out"]),
        "balance": float(parsed["balance"]),
        "classifications": _serialize_classifications(parsed["classifications"]),
    }


def _valid_preview(preview_id: str, user: User) -> dict:
    _purge_expired_previews()
    preview = _PREVIEWS.get(preview_id)
    if not preview or preview["user_id"] != user.id:
        raise HTTPException(400, "Prévia expirada. Envie o arquivo novamente.")
    if datetime.utcnow() - preview["created_at"] > PREVIEW_TTL:
        _PREVIEWS.pop(preview_id, None)
        raise HTTPException(400, "Prévia expirada. Envie o arquivo novamente.")
    return preview


@router.post("/api/bank-statements/preview")
async def preview_bank_statement(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    unidade: str = Form(default="matriz"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    require_company(company_id, user, db)
    unidade = _require_unit(company_id, unidade, db)
    filename = Path(file.filename or "conciliacao.xlsx").name
    if Path(filename).suffix.lower() != ".xlsx":
        raise HTTPException(400, "Formato inválido. Envie uma planilha .xlsx.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(400, "O arquivo está vazio.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "A planilha excede o limite de 10 MB.")
    if not data.startswith(b"PK"):
        raise HTTPException(400, "O conteúdo não corresponde a uma planilha .xlsx válida.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        parsed = parse_bank_statement(tmp_path, data)
    except BankStatementError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "Não foi possível ler a planilha bancária.") from exc
    finally:
        safe_unlink(tmp_path)

    file_hash = sha256_bytes(data)
    existing = _active_statement_query(
        db,
        company_id,
        unidade,
        parsed["bank_key"],
        parsed["competencia"],
    ).first()
    duplicate = bool(existing and existing.file_hash == file_hash)
    preview_id = str(uuid4())
    _PREVIEWS[preview_id] = {
        "user_id": user.id,
        "created_at": datetime.utcnow(),
        "company_id": company_id,
        "unidade": unidade,
        "file_name": filename,
        "file_hash": file_hash,
        "parsed": parsed,
    }
    return {
        "previewId": preview_id,
        "exists": existing is not None,
        "duplicate": duplicate,
        **_preview_payload(parsed),
    }


@router.post("/api/bank-statements/commit")
def commit_bank_statement(
    body: CommitIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    preview = _valid_preview(body.previewId, user)
    company_id = preview["company_id"]
    unidade = preview["unidade"]
    require_company(company_id, user, db)
    _require_unit(company_id, unidade, db)
    parsed = preview["parsed"]
    active_key = _active_key(company_id, unidade, parsed["bank_key"], parsed["competencia"])
    try:
        existing = (
            _active_statement_query(db, company_id, unidade, parsed["bank_key"], parsed["competencia"])
            .with_for_update()
            .first()
        )
        if existing and existing.file_hash == preview["file_hash"]:
            raise HTTPException(409, "Este arquivo já está ativo para o banco e a competência.")
        if existing and not body.replace:
            raise HTTPException(
                409,
                "Este banco e competência já possuem uma importação. Confirme a substituição para continuar.",
            )
        if existing:
            existing.status = "replaced"
            existing.active_key = None

        record = BankStatementImport(
            company_id=company_id,
            unidade=unidade,
            competencia=parsed["competencia"],
            bank_key=parsed["bank_key"],
            bank_name=parsed["bank_name"],
            active_key=active_key,
            file_hash=preview["file_hash"],
            file_name=preview["file_name"],
            status="active",
            row_count=parsed["row_count"],
            unclassified_count=parsed["unclassified_count"],
            total_in=parsed["total_in"],
            total_out=parsed["total_out"],
            balance=parsed["balance"],
            created_by=user.id,
        )
        db.add(record)
        db.flush()
        db.add_all(
            [
                BankTransaction(import_id=record.id, **transaction)
                for transaction in parsed["transactions"]
            ]
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Outra importação já ativou este banco e competência.") from exc
    except Exception:
        db.rollback()
        raise
    _PREVIEWS.pop(body.previewId, None)
    return {
        "saved": True,
        "replaced": existing is not None,
        "importId": record.id,
        **_preview_payload(parsed),
    }


@router.get("/api/companies/{company_id}/bank-statements/options")
def bank_statement_options(
    company_id: str,
    unidade: str = "matriz",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_tab(company_id, "recebimentos", user, db)
    unidade = _require_unit(company_id, unidade, db)
    rows = (
        db.query(BankStatementImport)
        .filter(
            BankStatementImport.company_id == company_id,
            BankStatementImport.unidade == unidade,
            BankStatementImport.status == "active",
        )
        .order_by(BankStatementImport.bank_name, BankStatementImport.competencia.desc())
        .all()
    )
    banks: dict[str, dict] = {}
    for row in rows:
        bank = banks.setdefault(
            row.bank_key,
            {"bankKey": row.bank_key, "bankName": row.bank_name, "competencias": []},
        )
        bank["competencias"].append(
            {
                "value": row.competencia,
                "label": _month_label(row.competencia),
                "importedAt": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return {"banks": list(banks.values())}


@router.get("/api/companies/{company_id}/bank-statements/summary")
def bank_statement_summary(
    company_id: str,
    bank_key: str = Query(alias="bankKey", min_length=1, max_length=180),
    competencia: str = Query(pattern=r"^\d{4}-\d{2}$"),
    unidade: str = "matriz",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_tab(company_id, "recebimentos", user, db)
    unidade = _require_unit(company_id, unidade, db)
    record = _active_statement_query(db, company_id, unidade, bank_key, competencia).first()
    if not record:
        raise HTTPException(404, "Não há conciliação ativa para este banco e competência.")
    grouped = (
        db.query(
            BankTransaction.exito_classification,
            func.count(BankTransaction.id),
            func.sum(func.abs(BankTransaction.amount)),
            func.sum(BankTransaction.amount),
        )
        .filter(BankTransaction.import_id == record.id)
        .group_by(BankTransaction.exito_classification)
        .all()
    )
    classifications = [
        {
            "label": label or "Sem classificação",
            "value": label or UNCLASSIFIED_FILTER,
            "count": int(count or 0),
            "total": float(total or 0),
            "net": float(net or 0),
        }
        for label, count, total, net in grouped
    ]
    classifications.sort(key=lambda item: (-item["count"], item["label"]))
    return {
        "importId": record.id,
        "bankKey": record.bank_key,
        "bankName": record.bank_name,
        "competencia": record.competencia,
        "fileName": record.file_name,
        "importedAt": record.created_at.isoformat() if record.created_at else None,
        "rowCount": record.row_count,
        "unclassifiedCount": record.unclassified_count,
        "totalIn": float(record.total_in or 0),
        "totalOut": float(record.total_out or 0),
        "balance": float(record.balance or 0),
        "classifications": classifications,
    }


@router.get("/api/companies/{company_id}/bank-statements/transactions")
def bank_statement_transactions(
    company_id: str,
    bank_key: str = Query(alias="bankKey", min_length=1, max_length=180),
    competencia: str = Query(pattern=r"^\d{4}-\d{2}$"),
    unidade: str = "matriz",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    search: str = Query(default="", max_length=120),
    classification: str = Query(default="", max_length=160),
    date_from: date | None = Query(default=None, alias="dateFrom"),
    date_to: date | None = Query(default=None, alias="dateTo"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_tab(company_id, "recebimentos", user, db)
    unidade = _require_unit(company_id, unidade, db)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(400, "A data inicial não pode ser posterior à data final.")
    record = _active_statement_query(db, company_id, unidade, bank_key, competencia).first()
    if not record:
        raise HTTPException(404, "Não há conciliação ativa para este banco e competência.")

    query = db.query(BankTransaction).filter(BankTransaction.import_id == record.id)
    term = search.strip()
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                BankTransaction.history.ilike(like),
                BankTransaction.note_number.ilike(like),
            )
        )
    if classification == UNCLASSIFIED_FILTER:
        query = query.filter(BankTransaction.exito_classification == "")
    elif classification:
        query = query.filter(BankTransaction.exito_classification == classification)
    if date_from:
        query = query.filter(BankTransaction.transaction_date >= date_from)
    if date_to:
        query = query.filter(BankTransaction.transaction_date <= date_to)

    total = query.count()
    pages = max(1, (total + page_size - 1) // page_size)
    safe_page = min(page, pages)
    rows = (
        query.order_by(BankTransaction.transaction_date, BankTransaction.row_number)
        .offset((safe_page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "page": safe_page,
        "pageSize": page_size,
        "pages": pages,
        "total": total,
        "items": [
            {
                "id": row.id,
                "date": row.transaction_date.isoformat(),
                "debit": row.debit_account,
                "credit": row.credit_account,
                "amount": float(row.amount),
                "history": row.history,
                "noteNumber": row.note_number,
                "classification": row.exito_classification or "Sem classificação",
            }
            for row in rows
        ],
    }


def _month_label(competencia: str) -> str:
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    try:
        year, month = competencia.split("-")
        return f"{months[int(month) - 1]}/{year}"
    except (ValueError, IndexError):
        return competencia
