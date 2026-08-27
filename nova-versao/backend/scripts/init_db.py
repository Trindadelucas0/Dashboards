from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import get_settings  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app import models  # noqa: F401,E402


def ensure_database() -> None:
    settings = get_settings()
    admin = create_engine(settings.admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"),
            {"n": settings.db_name},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{settings.db_name}"'))
    admin.dispose()


def main() -> None:
    ensure_database()
    Base.metadata.create_all(bind=engine)
    import json

    from app.companies import VIEWER_TABS  # noqa: E402

    viewer_tabs = json.dumps(VIEWER_TABS)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_re VARCHAR(200) DEFAULT ''"))
        conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS description VARCHAR(255) DEFAULT ''"))
        conn.execute(text("ALTER TABLE user_companies ADD COLUMN IF NOT EXISTS tabs JSONB DEFAULT '[]'::jsonb"))
        # Legado sem abas: libera todas as abas de viewer para não cortar acesso.
        conn.execute(
            text(
                """
                UPDATE user_companies
                SET tabs = CAST(:tabs AS jsonb)
                WHERE tabs IS NULL
                   OR tabs = '[]'::jsonb
                   OR jsonb_typeof(tabs) <> 'array'
                   OR jsonb_array_length(tabs) = 0
                """
            ),
            {"tabs": viewer_tabs},
        )
    print("Banco e tabelas prontos.")


if __name__ == "__main__":
    main()
