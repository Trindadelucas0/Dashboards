"""Permissões: abas por empresa; só admin importa; admin cria/edita viewer."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.companies import VIEWER_TABS
from app.deps import require_tab, tabs_for_user, user_company_tabs, _normalize_viewer_tabs
from app.models import User
from app.routers import users as users_router


def test_tabs_for_user_strips_importar_for_viewer_without_link():
    admin = User(username="a", password_hash="x", is_admin=True)
    viewer = User(username="v", password_hash="x", is_admin=False)
    tabs = ["visao-geral", "importar", "dre"]
    assert tabs_for_user(tabs, admin) == tabs
    assert tabs_for_user(tabs, viewer) == ["visao-geral", "dre"]
    assert "importar" not in tabs_for_user(None, viewer)


def test_normalize_viewer_tabs_empty_means_all():
    assert _normalize_viewer_tabs(None) == list(VIEWER_TABS)
    assert _normalize_viewer_tabs([]) == list(VIEWER_TABS)
    assert _normalize_viewer_tabs(["dre", "importar", "dre", "compras"]) == ["compras", "dre"]


def test_tabs_for_user_intersects_company_link():
    viewer = User(id=2, username="v", password_hash="x", is_admin=False)
    db = MagicMock()
    link = SimpleNamespace(tabs=["compras", "dre"])
    db.query.return_value.filter.return_value.first.return_value = link

    company_tabs = ["visao-geral", "compras", "vendas", "dre", "importar"]
    out = tabs_for_user(company_tabs, viewer, company_id="baifer", db=db)
    assert out == ["compras", "dre"]
    assert "importar" not in out
    assert "vendas" not in out


def test_tabs_for_user_admin_keeps_importar():
    admin = User(id=1, username="admin", password_hash="x", is_admin=True)
    db = MagicMock()
    company_tabs = ["visao-geral", "importar", "dre"]
    assert tabs_for_user(company_tabs, admin, company_id="baifer", db=db) == company_tabs


def test_require_tab_denies_forbidden_tab():
    viewer = User(id=2, username="v", password_hash="x", is_admin=False)
    db = MagicMock()
    # allowed_company_ids path: UserCompany query returns link with company
    link_company = SimpleNamespace(company_id="baifer")
    link_tabs = SimpleNamespace(tabs=["dre"])

    def query_side_effect(model):
        q = MagicMock()
        if model.__name__ == "UserCompany":
            # First call in require_company -> allowed_company_ids
            # Second call in user_company_tabs
            q.filter.return_value.all.return_value = [link_company]
            q.filter.return_value.first.return_value = link_tabs
        return q

    db.query.side_effect = query_side_effect

    assert require_tab("baifer", "dre", viewer, db) == "dre"
    with pytest.raises(HTTPException) as exc:
        require_tab("baifer", "compras", viewer, db)
    assert exc.value.status_code == 403


def test_require_tab_denies_importar_for_viewer():
    viewer = User(id=2, username="v", password_hash="x", is_admin=False)
    db = MagicMock()
    link_company = SimpleNamespace(company_id="baifer")
    link_tabs = SimpleNamespace(tabs=list(VIEWER_TABS))

    def query_side_effect(model):
        q = MagicMock()
        q.filter.return_value.all.return_value = [link_company]
        q.filter.return_value.first.return_value = link_tabs
        return q

    db.query.side_effect = query_side_effect
    with pytest.raises(HTTPException) as exc:
        require_tab("baifer", "importar", viewer, db)
    assert exc.value.status_code == 403


def test_normalize_access_rejects_importar():
    with pytest.raises(HTTPException) as exc:
        users_router._normalize_tabs(["visao-geral", "importar"])
    assert exc.value.status_code == 400


def test_normalize_access_orders_canonical():
    assert users_router._normalize_tabs(["dre", "compras", "visao-geral"]) == [
        "visao-geral",
        "compras",
        "dre",
    ]


def test_user_company_tabs_legacy_empty():
    viewer = User(id=2, username="v", password_hash="x", is_admin=False)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(tabs=[])
    assert user_company_tabs(viewer, "baifer", db) == list(VIEWER_TABS)


def test_parse_access_requires_company(monkeypatch):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id="baifer")
    access = users_router._parse_access(
        [users_router.AccessIn(companyId="baifer", tabs=["dre", "impostos"])],
        db,
    )
    assert access == [("baifer", ["impostos", "dre"])]
