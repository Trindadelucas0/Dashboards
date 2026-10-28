from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
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


class CompanyDeletion(Base):
    """Tombstone mínimo para impedir que o seed recrie uma empresa excluída."""

    __tablename__ = "company_deletions"

    company_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    deleted_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


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
    source_file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pack_patch: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
    import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id"), nullable=True)


class BankStatementImport(Base):
    __tablename__ = "bank_statement_imports"
    __table_args__ = (
        UniqueConstraint("active_key", name="uq_bank_statement_active_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    unidade: Mapped[str] = mapped_column(String(40), default="matriz", nullable=False)
    competencia: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    bank_key: Mapped[str] = mapped_column(String(180), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(200), nullable=False)
    active_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    unclassified_count: Mapped[int] = mapped_column(Integer, default=0)
    total_in: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    total_out: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    balance: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transactions: Mapped[list["BankTransaction"]] = relationship(
        back_populates="statement_import",
        cascade="all, delete-orphan",
    )


class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    __table_args__ = (
        UniqueConstraint("import_id", "row_number", name="uq_bank_transaction_import_row"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("bank_statement_imports.id"), nullable=False, index=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    debit_account: Mapped[str] = mapped_column(String(80), default="")
    credit_account: Mapped[str] = mapped_column(String(80), default="")
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    history: Mapped[str] = mapped_column(Text, default="")
    note_number: Mapped[str] = mapped_column(String(80), default="")
    exito_classification: Mapped[str] = mapped_column(String(160), default="", index=True)

    statement_import: Mapped[BankStatementImport] = relationship(back_populates="transactions")
