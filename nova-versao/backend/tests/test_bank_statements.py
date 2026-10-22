from __future__ import annotations

import inspect
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from openpyxl import Workbook

from app.extract.parse_bank_statement import (
    BankStatementError,
    parse_bank_statement,
    parse_br_money,
)
from app.models import BankStatementImport, BankTransaction, User
from app.routers import bank_statements as router


def _workbook(tmp_path, rows, *, bank="BANCO TESTE", competencia="09/2026"):
    path = tmp_path / "conciliacao.xlsx"
    book = Workbook()
    sheet = book.active
    sheet.title = "Conciliação"
    sheet.append([f"Banco: {bank}"])
    sheet.append([f"Competência: {competencia}"])
    sheet.append([])
    sheet.append(
        [
            "Data",
            "Débito",
            "Crédito",
            "Valor",
            "Histórico",
            "Nº Nota",
            "Classificação Êxito",
            "Situação",
            "Verificação do cliente",
            "Observação",
        ]
    )
    for row in rows:
        sheet.append(row)
    book.save(path)
    return path


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("R$ 1.234,56", Decimal("1234.56")),
        ("-R$ 93,73", Decimal("-93.73")),
        ("(R$ 10,00)", Decimal("-10.00")),
        (174804.29, Decimal("174804.29")),
    ],
)
def test_parse_br_money(raw, expected):
    assert parse_br_money(raw) == expected


def test_parser_reads_only_authorized_columns_and_accepts_blank_classification(tmp_path):
    path = _workbook(
        tmp_path,
        [
            ["01/09/2026", "9", "1000", "R$ 75,08", "Liberação", "", "RECEBIMENTO", "IGNORAR", "IGNORAR", "SEGREDO"],
            ["02/09/2026", "1004", "9", "-R$ 93,73", "Pagamento", "42", "", "IGNORAR", "IGNORAR", "SEGREDO"],
        ],
    )

    result = parse_bank_statement(path)

    assert result["bank_name"] == "BANCO TESTE"
    assert result["bank_key"] == "banco-teste"
    assert result["competencia"] == "2026-09"
    assert result["row_count"] == 2
    assert result["unclassified_count"] == 1
    assert result["total_in"] == Decimal("75.08")
    assert result["total_out"] == Decimal("93.73")
    assert result["balance"] == Decimal("-18.65")
    assert set(result["transactions"][0]) == {
        "row_number",
        "transaction_date",
        "debit_account",
        "credit_account",
        "amount",
        "history",
        "note_number",
        "exito_classification",
    }
    assert "SEGREDO" not in repr(result)


def test_parser_blocks_date_outside_header_month(tmp_path):
    path = _workbook(
        tmp_path,
        [["01/10/2026", "9", "1000", "R$ 10,00", "Fora do mês", "", "RECEBIMENTO"]],
    )
    with pytest.raises(BankStatementError, match="fora da competência 2026-09"):
        parse_bank_statement(path)


def test_parser_blocks_invalid_amount_and_missing_headers(tmp_path):
    invalid = _workbook(
        tmp_path,
        [["01/09/2026", "9", "1000", "valor ilegível", "Histórico", "", "RECEBIMENTO"]],
    )
    with pytest.raises(BankStatementError, match="Valor inválido"):
        parse_bank_statement(invalid)

    missing = _workbook(
        tmp_path,
        [["01/09/2026", "9", "1000", "10,00", "Histórico", "", "RECEBIMENTO"]],
        bank="",
    )
    with pytest.raises(BankStatementError, match="Banco não identificado"):
        parse_bank_statement(missing)


def _preview(user_id=1, file_hash="new-hash"):
    return {
        "user_id": user_id,
        "created_at": router.datetime.utcnow(),
        "company_id": "lojao",
        "unidade": "matriz",
        "file_name": "conciliacao.xlsx",
        "file_hash": file_hash,
        "parsed": {
            "bank_key": "banco-teste",
            "bank_name": "BANCO TESTE",
            "competencia": "2026-09",
            "row_count": 1,
            "unclassified_count": 0,
            "total_in": Decimal("10.00"),
            "total_out": Decimal("0.00"),
            "balance": Decimal("10.00"),
            "classifications": [{"label": "RECEBIMENTO", "count": 1, "total": Decimal("10.00"), "net": Decimal("10.00")}],
            "transactions": [
                {
                    "row_number": 5,
                    "transaction_date": router.date(2026, 9, 1),
                    "debit_account": "9",
                    "credit_account": "1000",
                    "amount": Decimal("10.00"),
                    "history": "Teste",
                    "note_number": "",
                    "exito_classification": "RECEBIMENTO",
                }
            ],
        },
    }


def test_commit_refuses_identical_active_file(monkeypatch):
    user = User(id=1, username="admin", password_hash="x", is_admin=True)
    existing = SimpleNamespace(file_hash="same-hash", status="active", active_key="slot")
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = existing
    router._PREVIEWS["duplicate"] = _preview(file_hash="same-hash")
    monkeypatch.setattr(router, "require_company", lambda *_args: "lojao")
    monkeypatch.setattr(router, "_require_unit", lambda *_args: "matriz")

    with pytest.raises(HTTPException) as exc:
        router.commit_bank_statement(router.CommitIn(previewId="duplicate", replace=True), user, db)

    assert exc.value.status_code == 409
    assert "já está ativo" in exc.value.detail
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_commit_replaces_previous_version_in_one_transaction(monkeypatch):
    user = User(id=1, username="admin", password_hash="x", is_admin=True)
    existing = SimpleNamespace(file_hash="old-hash", status="active", active_key="slot")
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = existing
    router._PREVIEWS["replace"] = _preview()
    monkeypatch.setattr(router, "require_company", lambda *_args: "lojao")
    monkeypatch.setattr(router, "_require_unit", lambda *_args: "matriz")

    result = router.commit_bank_statement(router.CommitIn(previewId="replace", replace=True), user, db)

    assert result["saved"] is True
    assert result["replaced"] is True
    assert existing.status == "replaced"
    assert existing.active_key is None
    assert isinstance(db.add.call_args.args[0], BankStatementImport)
    added_transactions = db.add_all.call_args.args[0]
    assert len(added_transactions) == 1
    assert isinstance(added_transactions[0], BankTransaction)
    db.commit.assert_called_once()


def test_preview_dependency_requires_admin_and_read_routes_enforce_tab():
    dependency = inspect.signature(router.preview_bank_statement).parameters["user"].default
    assert dependency.dependency is router.require_admin
    source_names = set(router.bank_statement_summary.__code__.co_names)
    transaction_names = set(router.bank_statement_transactions.__code__.co_names)
    assert "require_tab" in source_names
    assert "require_tab" in transaction_names


def test_transactions_applies_filters_and_paginates(monkeypatch):
    user = User(id=2, username="viewer", password_hash="x", is_admin=False)
    record = SimpleNamespace(id=77)
    row = SimpleNamespace(
        id=9,
        transaction_date=router.date(2026, 9, 15),
        debit_account="9",
        credit_account="1000",
        amount=Decimal("-25.50"),
        history="Pagamento fornecedor",
        note_number="123",
        exito_classification="FORNECEDORES",
        row_number=12,
    )
    statement_query = MagicMock()
    statement_query.filter.return_value = statement_query
    statement_query.first.return_value = record
    transaction_query = MagicMock()
    transaction_query.filter.return_value = transaction_query
    transaction_query.count.return_value = 45
    transaction_query.order_by.return_value = transaction_query
    transaction_query.offset.return_value = transaction_query
    transaction_query.limit.return_value = transaction_query
    transaction_query.all.return_value = [row]
    db = MagicMock()
    db.query.side_effect = lambda model, *_columns: (
        statement_query if model is BankStatementImport else transaction_query
    )
    monkeypatch.setattr(router, "require_tab", lambda *_args: "recebimentos")
    monkeypatch.setattr(router, "_require_unit", lambda *_args: "matriz")

    result = router.bank_statement_transactions(
        company_id="lojao",
        bank_key="banco-teste",
        competencia="2026-09",
        unidade="matriz",
        page=3,
        page_size=20,
        search="fornecedor",
        classification="FORNECEDORES",
        date_from=router.date(2026, 9, 1),
        date_to=router.date(2026, 9, 30),
        user=user,
        db=db,
    )

    assert result["page"] == 3
    assert result["pages"] == 3
    assert result["total"] == 45
    assert result["items"][0]["classification"] == "FORNECEDORES"
    transaction_query.offset.assert_called_once_with(40)
    transaction_query.limit.assert_called_once_with(20)
    assert transaction_query.filter.call_count >= 5


def test_read_route_blocks_other_company_before_query(monkeypatch):
    user = User(id=2, username="viewer", password_hash="x", is_admin=False)
    db = MagicMock()

    def deny(*_args):
        raise HTTPException(403, "Acesso negado a esta empresa")

    monkeypatch.setattr(router, "require_tab", deny)
    with pytest.raises(HTTPException) as exc:
        router.bank_statement_options("outra-empresa", "matriz", user, db)
    assert exc.value.status_code == 403
    db.query.assert_not_called()


def test_unit_validation_blocks_consolidated_and_unknown_unit():
    db = MagicMock()
    with pytest.raises(HTTPException, match="unidade específica"):
        router._require_unit("lojao", "todas", db)

    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(HTTPException, match="não pertence à empresa"):
        router._require_unit("lojao", "filial-inexistente", db)
