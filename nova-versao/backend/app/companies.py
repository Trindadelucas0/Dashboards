from __future__ import annotations

from dataclasses import dataclass, field


ALL_TABS = [
    "visao-geral",
    "compras",
    "finalidade",
    "vendas",
    "impostos",
    "memoria",
    "recebimentos",
    "balancete",
    "dre",
    "indicadores",
    "importar",
]


@dataclass(frozen=True)
class Unit:
    key: str
    label: str
    cnpj: str
    name_re: str = ""


@dataclass(frozen=True)
class CompanyReg:
    id: str
    label: str
    theme: str = "green"
    tabs: tuple[str, ...] = tuple(ALL_TABS)
    units: tuple[Unit, ...] = field(default_factory=tuple)
    name_re: str = ""
    cnpj: str = ""
    username: str = ""


COMPANIES: tuple[CompanyReg, ...] = (
    CompanyReg(
        id="egaplast",
        label="Egaplast",
        cnpj="03185564000134",
        name_re=r"EGAPLAST",
        username="egaplast",
        units=(
            Unit("matriz", "Matriz", "03185564000134", r"EGAPLAST"),
            Unit("filial", "Filial", "03185564000134", r"EGAPLAST"),
        ),
    ),
    CompanyReg(
        id="baifer",
        label="Baifer",
        cnpj="52005382000140",
        name_re=r"BAIFER",
        username="baifer",
        theme="blue",
        units=(Unit("matriz", "Matriz", "52005382000140", r"BAIFER"),),
    ),
)

COMPANY_BY_ID = {c.id: c for c in COMPANIES}
KEEP_COMPANY_IDS = frozenset(COMPANY_BY_ID)
KEEP_USERNAMES = frozenset({"admin", "egaplast", "baifer"})


def only_digits(value: str | None) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def slugify(label: str) -> str:
    import re
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", label or "")
    ascii_txt = nfkd.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_txt).strip("-").lower()
    return (slug or "empresa")[:40]


def find_by_cnpj(cnpj: str) -> tuple[CompanyReg | None, Unit | None]:
    digits = only_digits(cnpj)
    if not digits:
        return None, None
    for company in COMPANIES:
        for unit in company.units:
            if unit.cnpj == digits:
                return company, unit
        if company.cnpj and company.cnpj == digits:
            unit = company.units[0] if company.units else None
            return company, unit
    return None, None


def find_by_name(razao: str) -> CompanyReg | None:
    import re

    text = razao or ""
    for company in COMPANIES:
        if company.name_re and re.search(company.name_re, text, re.I):
            return company
    return None


def resolve_from_db(db, cnpj: str, razao: str) -> tuple[CompanyReg | None, str]:
    """Resolve empresa cadastrada no Postgres (além do registro estático)."""
    from app.models import Company, CompanyCnpj

    digits = only_digits(cnpj)
    if digits:
        alias = db.query(CompanyCnpj).filter(CompanyCnpj.cnpj == digits).first()
        if alias:
            row = db.query(Company).filter(Company.id == alias.company_id).first()
            if row:
                return _reg_from_row(row), alias.unidade or "matriz"
        row = db.query(Company).filter(Company.cnpj == digits).first()
        if row:
            return _reg_from_row(row), "matriz"
    text = (razao or "").strip()
    if text:
        rows = db.query(Company).filter(Company.name_re != "").all()
        import re

        for row in rows:
            try:
                if row.name_re and re.search(row.name_re, text, re.I):
                    return _reg_from_row(row), "matriz"
            except re.error:
                if row.name_re.lower() in text.lower():
                    return _reg_from_row(row), "matriz"
            if row.label and row.label.lower() in text.lower():
                return _reg_from_row(row), "matriz"
    return None, ""


def _reg_from_row(row) -> CompanyReg:
    tabs = tuple(row.tabs) if row.tabs else tuple(ALL_TABS)
    units = tuple(
        Unit(a.unidade, a.label, a.cnpj)
        for a in getattr(row, "cnpjs", []) or []
    )
    if not units and row.cnpj:
        units = (Unit("matriz", "Matriz", row.cnpj, row.name_re or ""),)
    return CompanyReg(
        id=row.id,
        label=row.label,
        theme=row.theme or "green",
        tabs=tabs,
        units=units,
        name_re=row.name_re or "",
        cnpj=row.cnpj or "",
    )
