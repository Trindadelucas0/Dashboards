from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.companies import VIEWER_TABS
from app.db import get_db
from app.deps import require_admin
from app.models import Company, User, UserCompany
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

MIN_PASSWORD_LEN = 4
VIEWER_TAB_SET = frozenset(VIEWER_TABS)


class AccessIn(BaseModel):
    companyId: str = Field(min_length=1, max_length=40)
    tabs: list[str] = Field(min_length=1)


class UserCreateIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=MIN_PASSWORD_LEN, max_length=200)
    access: list[AccessIn] = Field(min_length=1)


class UserPatchIn(BaseModel):
    password: str | None = Field(default=None, min_length=MIN_PASSWORD_LEN, max_length=200)
    access: list[AccessIn] | None = None


def _normalize_tabs(raw: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        tab = str(item or "").strip()
        if not tab:
            continue
        if tab == "importar" or tab not in VIEWER_TAB_SET:
            raise HTTPException(400, f"Aba inválida: {tab}")
        if tab in seen:
            continue
        seen.add(tab)
        out.append(tab)
    if not out:
        raise HTTPException(400, "Selecione pelo menos uma aba por empresa")
    # Preserva ordem canônica de VIEWER_TABS
    order = {t: i for i, t in enumerate(VIEWER_TABS)}
    out.sort(key=lambda t: order.get(t, 99))
    return out


def _parse_access(items: list[AccessIn], db: Session) -> list[tuple[str, list[str]]]:
    access: list[tuple[str, list[str]]] = []
    seen: set[str] = set()
    for item in items:
        cid = (item.companyId or "").strip()
        if not cid:
            continue
        if cid in seen:
            raise HTTPException(400, f"Empresa duplicada no acesso: {cid}")
        if not db.query(Company).filter(Company.id == cid).first():
            raise HTTPException(400, f"Empresa não encontrada: {cid}")
        tabs = _normalize_tabs(item.tabs)
        seen.add(cid)
        access.append((cid, tabs))
    if not access:
        raise HTTPException(400, "Selecione pelo menos uma empresa")
    return access


def _access_out(user_id: int, db: Session) -> list[dict]:
    links = db.query(UserCompany).filter(UserCompany.user_id == user_id).all()
    out = []
    for link in links:
        tabs = list(link.tabs or [])
        if not tabs:
            tabs = list(VIEWER_TABS)
        else:
            tabs = [t for t in VIEWER_TABS if t in tabs]
        out.append({"companyId": link.company_id, "tabs": tabs})
    return out


def _user_out(user: User, db: Session) -> dict:
    access = _access_out(user.id, db)
    return {
        "id": user.id,
        "username": user.username,
        "isAdmin": user.is_admin,
        "companyIds": [a["companyId"] for a in access],
        "access": access,
    }


def _replace_access(user: User, access: list[tuple[str, list[str]]], db: Session) -> None:
    db.query(UserCompany).filter(UserCompany.user_id == user.id).delete(synchronize_session=False)
    for cid, tabs in access:
        db.add(UserCompany(user_id=user.id, company_id=cid, tabs=tabs))


@router.get("")
def list_users(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(User).order_by(User.username).all()
    return [_user_out(row, db) for row in rows]


@router.get("/{user_id}")
def get_user(user_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.query(User).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(404, "Usuário não encontrado")
    return _user_out(row, db)


@router.post("")
def create_user(body: UserCreateIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = body.username.strip()
    if not username:
        raise HTTPException(400, "Usuário obrigatório")
    if len(body.password.strip()) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"Senha deve ter pelo menos {MIN_PASSWORD_LEN} caracteres")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, "Já existe um usuário com este nome")

    access = _parse_access(body.access, db)
    created = User(
        username=username,
        password_hash=hash_password(body.password.strip()),
        is_admin=False,
    )
    db.add(created)
    db.flush()
    _replace_access(created, access, db)
    db.commit()
    db.refresh(created)
    return _user_out(created, db)


@router.patch("/{user_id}")
def patch_user(
    user_id: int,
    body: UserPatchIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(User).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(404, "Usuário não encontrado")

    if body.password is not None:
        pw = body.password.strip()
        if len(pw) < MIN_PASSWORD_LEN:
            raise HTTPException(400, f"Senha deve ter pelo menos {MIN_PASSWORD_LEN} caracteres")
        row.password_hash = hash_password(pw)

    if body.access is not None:
        if row.is_admin:
            # Admin não usa vínculos de empresa; ignora access.
            pass
        else:
            access = _parse_access(body.access, db)
            _replace_access(row, access, db)

    if body.password is None and body.access is None:
        raise HTTPException(400, "Nada para atualizar")

    db.commit()
    db.refresh(row)
    return _user_out(row, db)
