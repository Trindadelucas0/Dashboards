"""Permissões: só admin importa; admin cria viewer ligado a empresa."""

from __future__ import annotations

from app.deps import tabs_for_user
from app.models import User


def test_tabs_for_user_strips_importar_for_viewer():
    admin = User(username="a", password_hash="x", is_admin=True)
    viewer = User(username="v", password_hash="x", is_admin=False)
    tabs = ["visao-geral", "importar", "dre"]
    assert tabs_for_user(tabs, admin) == tabs
    assert tabs_for_user(tabs, viewer) == ["visao-geral", "dre"]
    assert "importar" not in tabs_for_user(None, viewer)
