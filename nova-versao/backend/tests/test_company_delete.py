from __future__ import annotations

import inspect
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.models import CompanyDeletion, User
from app.routers import companies as router
from scripts import seed as seed_script


def _db_for_delete(company):
    db = MagicMock()
    query = db.query.return_value
    query.filter.return_value = query
    query.with_for_update.return_value = query
    query.first.return_value = company
    query.all.return_value = [(31,), (32,)]
    query.delete.return_value = 1
    return db, query


def test_delete_company_requires_admin_dependency():
    dependency = inspect.signature(router.delete_company).parameters["user"].default
    assert dependency.dependency is router.require_admin


def test_viewer_is_denied_by_admin_dependency():
    viewer = User(id=8, username="viewer", password_hash="x", is_admin=False)
    with pytest.raises(HTTPException) as exc:
        router.require_admin(viewer)
    assert exc.value.status_code == 403


def test_delete_company_removes_data_and_creates_tombstone():
    company = SimpleNamespace(id="baifer")
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    db, query = _db_for_delete(company)

    result = router.delete_company("baifer", admin, db)

    assert result == {"deleted": True, "companyId": "baifer"}
    tombstone = db.add.call_args.args[0]
    assert isinstance(tombstone, CompanyDeletion)
    assert tombstone.company_id == "baifer"
    assert tombstone.deleted_by_user_id == 7
    db.delete.assert_called_once_with(company)
    db.commit.assert_called_once()
    db.rollback.assert_not_called()
    assert query.delete.call_count >= 7


def test_delete_company_returns_404_when_already_deleted():
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    db, _query = _db_for_delete(None)

    with pytest.raises(HTTPException) as exc:
        router.delete_company("baifer", admin, db)

    assert exc.value.status_code == 404
    db.commit.assert_not_called()


def test_delete_company_rolls_back_and_hides_internal_error():
    company = SimpleNamespace(id="baifer")
    admin = User(id=7, username="admin", password_hash="x", is_admin=True)
    db, query = _db_for_delete(company)
    query.delete.side_effect = RuntimeError("database detail")

    with pytest.raises(HTTPException) as exc:
        router.delete_company("baifer", admin, db)

    assert exc.value.status_code == 500
    assert "database detail" not in exc.value.detail
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_seed_does_not_recreate_deleted_company():
    db = MagicMock()
    db.query.return_value.all.return_value = [("baifer",), ("schumacher",)]

    active_ids = {reg.id for reg in seed_script.seed_company_regs(db)}

    assert "baifer" not in active_ids
    assert "schumacher" not in active_ids
    assert "unica" in active_ids

