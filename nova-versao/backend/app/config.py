from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_ignore_empty=True,
    )

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "dashboards_nova"
    db_user: str = "postgres"
    db_password: str = ""
    session_secret: str = "change-me"
    admin_seed_password: str = ""
    seed_user_password: str = ""
    api_port: int = 8001
    frontend_origin: str = "http://localhost:3000"
    planilhas_dir: str = "../PLANILHAS"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def admin_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/postgres"
        )

    @property
    def planilhas_path(self) -> Path:
        p = Path(self.planilhas_dir)
        if not p.is_absolute():
            p = (ROOT / p).resolve()
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
