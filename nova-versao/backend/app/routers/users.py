from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Company, User, UserCompany
from app.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

MIN_PASSWORD_LEN = 4


class UserCreateIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=MIN_PASSWORD_LEN, max_length=200)
    companyIds: list[str] = Field(min_length=1)


def _user_out(user: User, company_ids: list[str]) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "isAdmin": user.is_admin,
        "companyIds": company_ids,
    }


@router.get("")
def list_users(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(User).order_by(User.username).all()
    out = []
    for row in rows:
        links = db.query(UserCompany).filter(UserCompany.user_id == row.id).all()
        out.append(_user_out(row, [link.company_id for link in links]))
    return out


@router.post("")
def create_user(body: UserCreateIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = body.username.strip()
    if not username:
        raise HTTPException(400, "Usuário obrigatório")
    if len(body.password.strip()) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"Senha deve ter pelo menos {MIN_PASSWORD_LEN} caracteres")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, "Já existe um usuário com este nome")

    company_ids: list[str] = []
    for raw in body.companyIds:
        cid = (raw or "").strip()
        if not cid or cid in company_ids:
            continue
        if not db.query(Company).filter(Company.id == cid).first():
            raise HTTPException(400, f"Empresa não encontrada: {cid}")
        company_ids.append(cid)
    if not company_ids:
        raise HTTPException(400, "Selecione pelo menos uma empresa")

    created = User(
        username=username,
        password_hash=hash_password(body.password.strip()),
        is_admin=False,
    )
    db.add(created)
    db.flush()
    for cid in company_ids:
        db.add(UserCompany(user_id=created.id, company_id=cid))
    db.commit()
    db.refresh(created)
    return _user_out(created, company_ids)
