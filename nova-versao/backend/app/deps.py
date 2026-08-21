from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, UserCompany
from app.security import COOKIE_NAME, read_session_token


def current_user(
    nv_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if not nv_session:
        raise HTTPException(status_code=401, detail="Não autenticado")
    payload = read_session_token(nv_session)
    if not payload:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    user = db.query(User).filter(User.id == payload.get("uid")).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user


def allowed_company_ids(user: User, db: Session) -> list[str]:
    if user.is_admin:
        from app.models import Company

        return [c.id for c in db.query(Company).all()]
    rows = db.query(UserCompany).filter(UserCompany.user_id == user.id).all()
    return [r.company_id for r in rows]


def require_company(company_id: str, user: User, db: Session) -> str:
    allowed = allowed_company_ids(user, db)
    if company_id not in allowed:
        raise HTTPException(status_code=403, detail="Acesso negado a esta empresa")
    return company_id


def require_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Só o administrador pode cadastrar empresa")
    return user
