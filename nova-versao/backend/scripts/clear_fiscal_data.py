"""
Script MANUAL e destrutivo — limpa só movimento/import/meses fiscais.
NÃO apaga empresas nem usuários.
NÃO roda no boot do Docker.

Uso explícito:
  python scripts/clear_fiscal_data.py --i-know-what-im-doing
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal  # noqa: E402
from app.models import FiscalMonth, ImportRecord, NfeLine  # noqa: E402


def clear_fiscal(db) -> dict[str, int]:
    counts = {
        "nfe_lines": db.query(NfeLine).count(),
        "imports": db.query(ImportRecord).count(),
        "fiscal_months": db.query(FiscalMonth).count(),
    }
    db.query(NfeLine).delete()
    db.query(ImportRecord).delete()
    db.query(FiscalMonth).delete()
    return counts


def main() -> None:
    if "--i-know-what-im-doing" not in sys.argv:
        raise SystemExit(
            "Recusado: este script apaga NFe/imports/meses fiscais.\n"
            "Rode só manualmente com --i-know-what-im-doing\n"
            "Empresas e usuários NÃO são apagados por este script."
        )
    db = SessionLocal()
    try:
        before = {
            "nfe_lines": db.query(NfeLine).count(),
            "imports": db.query(ImportRecord).count(),
            "fiscal_months": db.query(FiscalMonth).count(),
        }
        fiscal = clear_fiscal(db)
        db.commit()
        after = {
            "nfe_lines": db.query(NfeLine).count(),
            "imports": db.query(ImportRecord).count(),
            "fiscal_months": db.query(FiscalMonth).count(),
        }
        print("Antes:", before)
        print("Fiscal apagado:", fiscal)
        print("Depois:", after)
        print("Empresas/usuários: preservados.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
