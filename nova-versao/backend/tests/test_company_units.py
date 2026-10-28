from __future__ import annotations

import inspect
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.models import CompanyCnpj, User
from app.routers import companies as router


def test_structured_units_keep_custom_names():
    body = router.CompanyCreateIn(
        label="Empresa ABC",
        cnpj="00.000.000/0001-00",
        units=[
            {"label": "Empresa ABC Goiânia", "cnpj": "00.000.000/0002-00"},
            {"label": "Empresa ABC Brasília", "cnpj": "00.000.000/0003-00"},
        ],
    )

    assert router._extra_units_from_create(body, "00000000000100") == [
        ("00000000000200", "Empresa ABC Goiânia"),
        ("00000000000300", "Empresa ABC Brasília"),
    ]


@pytest.mark.parametrize(
    "units,detail",
    [
        ([{"label": "Unidade A", "cnpj": "00.000.000/0001-00"}], "CNPJ diferente"),
        (
            [
                {"label": "Unidade A", "cnpj": "00.000.000/0002-00"},
                {"label": "unidade a", "cnpj": "00.000.000/0003-00"},
            ],
            "nome diferente",
        ),
    ],
)
def test_structured_units_reject_duplicates(units, detail):
    body = router.CompanyCreateIn(label="Empresa ABC", cnpj="00.000.000/0001-00", units=units)

    with pytest.raises(HTTPException) as exc:
        router._extra_units_from_create(body, "00000000000100")

    assert exc.value.status_code == 400
    assert detail in exc.value.detail


def test_catalog_exposes_cnpj_and_uses_company_name_for_main_unit():
    company = SimpleNamespace(
        id="empresa-abc",
        label="Empresa ABC",
        cnpj="00000000000100",
        cnpjs=[
            SimpleNamespace(unidade="matriz", label="Matriz", cnpj="00000000000100"),
            SimpleNamespace(unidade="filial-1", label="Empresa ABC Goiânia", cnpj="00000000000200"),
        ],
    )

    assert router.catalog_units_payload(company.id, company) == [
        {"key": "todas", "label": "Todas as unidades", "cnpj": None},
        {"key": "matriz", "label": "Empresa ABC", "cnpj": "00000000000100"},
        {"key": "filial-1", "label": "Empresa ABC Goiânia", "cnpj": "00000000000200"},
    ]


def test_update_unit_labels_requires_admin_dependency():
    dependency = inspect.signature(router.update_company_unit_labels).parameters["user"].default
    assert dependency.dependency is router.require_admin


def test_all_unit_management_routes_require_admin():
    for handler in (router.add_company_unit, router.update_company_unit, router.delete_company_unit):
        dependency = inspect.signature(handler).parameters["user"].default
        assert dependency.dependency is router.require_admin


def test_update_unit_label_preserves_key_and_cnpj():
    company = SimpleNamespace(id="empresa-abc", label="Empresa ABC", cnpj="00000000000100")
    main = CompanyCnpj(company_id=company.id, cnpj=company.cnpj, unidade="matriz", label="Matriz")
    branch = CompanyCnpj(company_id=company.id, cnpj="00000000000200", unidade="filial-1", label="Filial 1")
    company.cnpjs = [main, branch]

    company_query = MagicMock()
    company_query.filter.return_value = company_query
    company_query.with_for_update.return_value = company_query
    company_query.first.return_value = company
    aliases_query = MagicMock()
    aliases_query.filter.return_value = aliases_query
    aliases_query.with_for_update.return_value = aliases_query
    aliases_query.all.return_value = [main, branch]
    db = MagicMock()
    db.query.side_effect = [company_query, aliases_query]
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    body = router.CompanyUnitsUpdateIn(units=[{"key": "filial-1", "label": "Empresa ABC Goiânia"}])

    result = router.update_company_unit_labels(company.id, body, admin, db)

    assert branch.label == "Empresa ABC Goiânia"
    assert branch.unidade == "filial-1"
    assert branch.cnpj == "00000000000200"
    assert result["units"][2]["label"] == "Empresa ABC Goiânia"
    db.commit.assert_called_once()


def test_add_unit_creates_stable_key_and_keeps_cnpj():
    company = SimpleNamespace(id="empresa-abc", label="Empresa ABC", cnpj="00000000000100")
    main = CompanyCnpj(id=1, company_id=company.id, cnpj=company.cnpj, unidade="matriz", label=company.label)
    company_query = MagicMock()
    company_query.filter.return_value = company_query
    company_query.with_for_update.return_value = company_query
    company_query.first.return_value = company
    aliases_query = MagicMock()
    aliases_query.filter.return_value = aliases_query
    aliases_query.all.return_value = [main]
    empty_company_query = MagicMock()
    empty_company_query.filter.return_value = empty_company_query
    empty_company_query.first.return_value = None
    empty_alias_query = MagicMock()
    empty_alias_query.filter.return_value = empty_alias_query
    empty_alias_query.first.return_value = None
    db = MagicMock()
    db.query.side_effect = [company_query, aliases_query, empty_company_query, empty_alias_query]
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    body = router.CompanyUnitCreateIn(label="Empresa ABC Goiânia", cnpj="00.000.000/0002-00")

    result = router.add_company_unit(company.id, body, admin, db)

    created = db.add.call_args.args[0]
    assert created.unidade == "filial-1"
    assert created.cnpj == "00000000000200"
    assert result["unit"]["label"] == "Empresa ABC Goiânia"
    db.commit.assert_called_once()


def test_cnpj_change_is_blocked_when_unit_has_imported_data():
    company = SimpleNamespace(id="empresa-abc", label="Empresa ABC", cnpj="00000000000100")
    branch = CompanyCnpj(id=2, company_id=company.id, cnpj="00000000000200", unidade="filial-1", label="Filial 1")
    company_query = MagicMock()
    company_query.filter.return_value = company_query
    company_query.with_for_update.return_value = company_query
    company_query.first.return_value = company
    alias_query = MagicMock()
    alias_query.filter.return_value = alias_query
    alias_query.with_for_update.return_value = alias_query
    alias_query.first.return_value = branch
    aliases_query = MagicMock()
    aliases_query.filter.return_value = aliases_query
    aliases_query.all.return_value = [branch]
    data_query = MagicMock()
    data_query.filter.return_value = data_query
    data_query.first.return_value = (1,)
    db = MagicMock()
    db.query.side_effect = [company_query, alias_query, aliases_query, data_query]
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    body = router.CompanyUnitUpdateIn(label="Empresa ABC Goiânia", cnpj="00.000.000/0009-00")

    with pytest.raises(HTTPException) as exc:
        router.update_company_unit(company.id, branch.unidade, body, admin, db)

    assert exc.value.status_code == 409
    assert "dados importados" in exc.value.detail
    assert branch.cnpj == "00000000000200"
    db.commit.assert_not_called()

