from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    theme: Mapped[str] = mapped_column(String(20), default="green")
    cnpj: Mapped[str] = mapped_column(String(14), default="")
    tabs: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    name_re: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(String(255), default="")

    months: Mapped[list["FiscalMonth"]] = relationship(back_populates="company")
    cnpjs: Mapped[list["CompanyCnpj"]] = relationship(back_populates="company")


class CompanyCnpj(Base):
    __tablename__ = "company_cnpjs"
    __table_args__ = (UniqueConstraint("cnpj", name="uq_company_cnpj"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    unidade: Mapped[str] = mapped_column(String(40), default="matriz")
    label: Mapped[str] = mapped_column(String(80), default="Matriz")

    company: Mapped[Company] = relationship(back_populates="cnpjs")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    links: Mapped[list["UserCompany"]] = relationship(back_populates="user")


class UserCompany(Base):
    __tablename__ = "user_companies"
    __table_args__ = (UniqueConstraint("user_id", "company_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    tabs: Mapped[list] = mapped_column(JSONB, default=list)

    user: Mapped[User] = relationship(back_populates="links")
    company: Mapped[Company] = relationship()


class FiscalMonth(Base):
    __tablename__ = "fiscal_months"
    __table_args__ = (
        UniqueConstraint("company_id", "competencia", "unidade", name="uq_month_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    competencia: Mapped[str] = mapped_column(String(7), nullable=False)
    unidade: Mapped[str] = mapped_column(String(40), default="matriz")
    pack: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped[Company] = relationship(back_populates="months")


class ImportRecord(Base):
    __tablename__ = "imports"
    __table_args__ = (UniqueConstraint("file_hash", name="uq_file_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    competencia: Mapped[str] = mapped_column(String(7), nullable=False)
    unidade: Mapped[str] = mapped_column(String(40), default="matriz")
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="ok")
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class NfeLine(Base):
    __tablename__ = "nfe_lines"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "competencia",
            "unidade",
            "tipo",
            "nota",
            "serie",
            "cfop",
            "valor",
            name="uq_nfe_line",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    competencia: Mapped[str] = mapped_column(String(7), nullable=False)
    unidade: Mapped[str] = mapped_column(String(40), default="matriz")
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    nota: Mapped[str] = mapped_column(String(40), default="")
    serie: Mapped[str] = mapped_column(String(20), default="")
    cfop: Mapped[str] = mapped_column(String(12), default="")
    valor: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    nome: Mapped[str] = mapped_column(Text, default="")
    doc: Mapped[str] = mapped_column(String(20), default="")
    uf: Mapped[str] = mapped_column(String(4), default="")
