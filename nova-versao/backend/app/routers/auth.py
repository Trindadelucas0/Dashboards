from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import allowed_company_ids, current_user
from app.models import User
from app.security import COOKIE_NAME, make_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _cookie_kwargs() -> dict:
    origin = (get_settings().frontend_origin or "").strip().lower()
    return {"secure": origin.startswith("https://")}


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user or not verify_password(body.password.strip(), user.password_hash):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    token = make_session_token(user.id, user.username)
    cookie_kw = _cookie_kwargs()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 12,
        **cookie_kw,
    )
    return {"ok": True, "username": user.username, "isAdmin": user.is_admin}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", **_cookie_kwargs())
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {
        "username": user.username,
        "isAdmin": user.is_admin,
        "companies": allowed_company_ids(user, db),
    }
