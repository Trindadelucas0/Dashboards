from __future__ import annotations

from app import main


def test_startup_ensures_database_schema(monkeypatch):
    calls = []

    monkeypatch.setattr(
        main.Base.metadata,
        "create_all",
        lambda *, bind: calls.append(bind),
    )

    main.ensure_database_schema()

    assert calls == [main.engine]
