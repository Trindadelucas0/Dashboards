from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.companies import KEEP_COMPANY_IDS, KEEP_USERNAMES  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Company, CompanyCnpj, FiscalMonth, ImportRecord, NfeLine, User, UserCompany  # noqa: E402


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


def purge_other_companies(db) -> dict[str, int]:
    removed_companies = 0
    removed_users = 0

    db.query(UserCompany).filter(~UserCompany.company_id.in_(KEEP_COMPANY_IDS)).delete(synchronize_session=False)
    db.query(CompanyCnpj).filter(~CompanyCnpj.company_id.in_(KEEP_COMPANY_IDS)).delete(synchronize_session=False)
    db.query(NfeLine).filter(~NfeLine.company_id.in_(KEEP_COMPANY_IDS)).delete(synchronize_session=False)
    db.query(ImportRecord).filter(~ImportRecord.company_id.in_(KEEP_COMPANY_IDS)).delete(synchronize_session=False)
    db.query(FiscalMonth).filter(~FiscalMonth.company_id.in_(KEEP_COMPANY_IDS)).delete(synchronize_session=False)

    for row in db.query(Company).all():
        if row.id not in KEEP_COMPANY_IDS:
            db.delete(row)
            removed_companies += 1

    for user in db.query(User).all():
        if user.username in KEEP_USERNAMES:
            continue
        db.query(UserCompany).filter(UserCompany.user_id == user.id).delete(synchronize_session=False)
        db.delete(user)
        removed_users += 1

    return {"companies": removed_companies, "users": removed_users}


def main() -> None:
    db = SessionLocal()
    try:
        before = {
            "nfe_lines": db.query(NfeLine).count(),
            "imports": db.query(ImportRecord).count(),
            "fiscal_months": db.query(FiscalMonth).count(),
            "companies": db.query(Company).count(),
            "users": db.query(User).count(),
        }
        fiscal = clear_fiscal(db)
        purged = purge_other_companies(db)
        db.commit()
        after = {
            "nfe_lines": db.query(NfeLine).count(),
            "imports": db.query(ImportRecord).count(),
            "fiscal_months": db.query(FiscalMonth).count(),
            "companies": db.query(Company).count(),
            "users": db.query(User).count(),
        }
        print("Antes:", before)
        print("Fiscal apagado:", fiscal)
        print("Empresas/usuários removidos:", purged)
        print("Depois:", after)
    finally:
        db.close()


if __name__ == "__main__":
    main()
