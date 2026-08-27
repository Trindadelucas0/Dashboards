from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.companies import COMPANIES, VIEWER_TABS  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Company, CompanyCnpj, User, UserCompany  # noqa: E402
from app.security import hash_password  # noqa: E402

COMPANY_DESCRIPTIONS = {
    "egaplast": "Artefatos e comércio de plásticos",
    "baifer": "Distribuidora de ferramentas",
    "loja-maquinas": "Loja das Máquinas e Ferramentas",
}


def upsert_companies(db) -> None:
    for reg in COMPANIES:
        row = db.query(Company).filter(Company.id == reg.id).first()
        if not row:
            row = Company(id=reg.id)
            db.add(row)
        row.label = reg.label
        row.theme = reg.theme
        row.cnpj = reg.cnpj
        row.tabs = list(reg.tabs)
        row.name_re = reg.name_re or ""
        row.description = COMPANY_DESCRIPTIONS.get(reg.id, reg.label)
        aliases: list[tuple[str, str, str]] = []
        seen: set[str] = set()
        for unit in reg.units:
            if not unit.cnpj or unit.cnpj in seen:
                continue
            seen.add(unit.cnpj)
            aliases.append((unit.cnpj, unit.key, unit.label))
        if reg.cnpj and reg.cnpj not in seen:
            aliases.append((reg.cnpj, "matriz", "Matriz"))
        for cnpj, unidade, label in aliases:
            exists = db.query(CompanyCnpj).filter(CompanyCnpj.cnpj == cnpj).first()
            if not exists:
                db.add(CompanyCnpj(company_id=reg.id, cnpj=cnpj, unidade=unidade, label=label))
            elif exists.company_id != reg.id:
                exists.company_id = reg.id
                exists.unidade = unidade
                exists.label = label


def seed_users(db) -> None:
    settings = get_settings()
    admin_pw = settings.admin_seed_password
    user_pw = settings.seed_user_password or admin_pw
    if not admin_pw:
        raise SystemExit("ADMIN_SEED_PASSWORD ausente no .env")

    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(username="admin", password_hash=hash_password(admin_pw), is_admin=True)
        db.add(admin)
        db.flush()
    else:
        admin.is_admin = True
        admin.password_hash = hash_password(admin_pw)

    for reg in COMPANIES:
        if not reg.username:
            continue
        user = db.query(User).filter(User.username == reg.username).first()
        if not user:
            user = User(username=reg.username, password_hash=hash_password(user_pw), is_admin=False)
            db.add(user)
            db.flush()
        else:
            user.password_hash = hash_password(user_pw)
        link = (
            db.query(UserCompany)
            .filter(UserCompany.user_id == user.id, UserCompany.company_id == reg.id)
            .first()
        )
        if not link:
            db.add(UserCompany(user_id=user.id, company_id=reg.id, tabs=list(VIEWER_TABS)))
        elif not link.tabs:
            link.tabs = list(VIEWER_TABS)


def main() -> None:
    """Só upsert de catálogo + usuários seed. Nunca apaga empresas nem dados fiscais."""
    db = SessionLocal()
    try:
        upsert_companies(db)
        db.flush()
        seed_users(db)
        db.commit()
        ids = ", ".join(c.id for c in COMPANIES)
        print(f"Seed concluído (upsert: {ids} + admin). Empresas da UI preservadas.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
