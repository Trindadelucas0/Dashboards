from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, engine
from app import models  # noqa: F401 -- registra todas as tabelas no metadata
from app.routers import auth, bank_statements, companies, imports, users

settings = get_settings()


def ensure_database_schema() -> None:
    """Cria tabelas ausentes antes de a API aceitar requisições.

    O projeto ainda usa ``create_all`` como migração idempotente. Executá-lo
    também no startup impede que um deploy com modelos novos publique rotas
    antes de o schema correspondente existir.
    """
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_database_schema()
    yield


app = FastAPI(title="Dashboards Nova Versão", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:3004",
        "http://127.0.0.1:3005",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bank_statements.router)
app.include_router(companies.router)
app.include_router(imports.router)
app.include_router(users.router)


@app.get("/api/health")
def health():
    return {"ok": True}
