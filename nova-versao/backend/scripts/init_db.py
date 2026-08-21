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
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_re VARCHAR(200) DEFAULT ''"))
        conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS description VARCHAR(255) DEFAULT ''"))
    print("Banco e tabelas prontos.")


if __name__ == "__main__":
    main()
