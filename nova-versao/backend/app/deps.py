from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.companies import VIEWER_TABS
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
        raise HTTPException(status_code=403, detail="Só o administrador pode fazer isso")
    return user


def _normalize_viewer_tabs(raw: list | None) -> list[str]:
    """Filtra abas válidas de viewer; lista vazia/nula = legado (todas)."""
    allowed = set(VIEWER_TABS)
    if not raw:
        return list(VIEWER_TABS)
    seen: set[str] = set()
    for tab in raw:
        t = str(tab or "").strip()
        if t not in allowed:
            continue
        seen.add(t)
    return [t for t in VIEWER_TABS if t in seen] or list(VIEWER_TABS)


def user_company_tabs(user: User, company_id: str, db: Session) -> list[str] | None:
    """Abas do vínculo user↔empresa. None = admin (sem restrição de vínculo)."""
    if user.is_admin:
        return None
    link = (
        db.query(UserCompany)
        .filter(UserCompany.user_id == user.id, UserCompany.company_id == company_id)
        .first()
    )
    if not link:
        return []
    return _normalize_viewer_tabs(link.tabs)


def tabs_for_user(tabs: list | None, user: User, company_id: str | None = None, db: Session | None = None) -> list:
    """Cruza abas da empresa com o vínculo do usuário. Viewer nunca vê importar."""
    base = list(tabs or [])
    if user.is_admin:
        return base
    without_import = [t for t in base if t != "importar"]
    if company_id is None or db is None:
        return without_import
    allowed = user_company_tabs(user, company_id, db)
    if allowed is None:
        return without_import
    allowed_set = set(allowed)
    return [t for t in without_import if t in allowed_set]


def require_tab(company_id: str, tab: str, user: User, db: Session) -> str:
    require_company(company_id, user, db)
    if user.is_admin:
        return tab
    if tab == "importar":
        raise HTTPException(status_code=403, detail="Acesso negado a esta aba")
    allowed = user_company_tabs(user, company_id, db) or []
    if tab not in allowed:
        raise HTTPException(status_code=403, detail="Acesso negado a esta aba")
    return tab
