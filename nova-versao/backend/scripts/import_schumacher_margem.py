"""Importa demonstrativos de margens Schumacher (mês + cidade) no Postgres.

Merge no pack matriz; atualiza abas da empresa e viewers Schumacher.
Não chama seed_users.

Uso:
  python scripts/import_schumacher_margem.py [ARQUIVO ...]
  (sem args: importa os 3 fixtures schumacher-padrao)
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.companies import COMPANY_BY_ID  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.extract.parse_workbook_padrao import expand_workbook_parts  # noqa: E402
from app.extract.pipeline import _deep_merge, classify_and_extract  # noqa: E402
from app.models import Company, FiscalMonth, ImportRecord, UserCompany  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

COMPANY = "schumacher"
FIX_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "schumacher-padrao"
DEFAULTS = (
    FIX_DIR / "Demonstrativo de Margens de Venda(Mes).xls",
    FIX_DIR / "Demonstrativo de Margens de Venda(Mes)2025.xls",
    FIX_DIR / "Demonstrativo de Margens de Venda(Cidade).xls",
)
NEW_TABS = ("margens-mes", "margens-cidade")
ALLOWED_TIPOS = frozenset({"margem_mes", "margem_cidade"})


def _append_tabs(existing: list[str] | None, reg_tabs: tuple[str, ...]) -> list[str]:
    base = list(existing or list(reg_tabs))
    for t in NEW_TABS:
        if t not in base:
            idx = base.index("vendas-produto") if "vendas-produto" in base else len(base)
            base.insert(idx, t)
    return base


def _import_file(db, path: Path) -> tuple[int, int]:
    saved = 0
    refused = 0
    data = path.read_bytes()
    file_hash = sha256_bytes(data)
    result = classify_and_extract(path, data, db=db)
    tipo = result.get("tipo")
    if tipo not in ALLOWED_TIPOS:
        print("ERR tipo", path.name, tipo, result.get("errors"))
        return 0, 1
    items = expand_workbook_parts({**result, "file_hash": file_hash})
    for item in items:
        errors = item.get("errors") or []
        if errors or item.get("company_id") != COMPANY or not item.get("competencia"):
            print("BAD", path.name, item.get("competencia"), errors or ["empresa/competência"])
            refused += 1
            continue
        if item.get("skipped"):
            continue
        competencia = item["competencia"]
        unidade = item.get("unidade") or "matriz"
        row = (
            db.query(FiscalMonth)
            .filter(
                FiscalMonth.company_id == COMPANY,
                FiscalMonth.competencia == competencia,
                FiscalMonth.unidade == unidade,
            )
            .first()
        )
        if row is None:
            row = FiscalMonth(company_id=COMPANY, competencia=competencia, unidade=unidade, pack={})
            db.add(row)
            db.flush()
        row.pack = _deep_merge(row.pack or {}, item.get("pack_patch") or {})
        flag_modified(row, "pack")

        rec_hash = item.get("file_hash") or file_hash
        stale = (
            db.query(ImportRecord)
            .filter(
                ImportRecord.company_id == COMPANY,
                ImportRecord.competencia == competencia,
                ImportRecord.unidade == unidade,
                ImportRecord.tipo == tipo,
                ImportRecord.file_hash != rec_hash,
                ImportRecord.status == "ok",
            )
            .all()
        )
        for old in stale:
            old.status = "replaced"

        rec = db.query(ImportRecord).filter(ImportRecord.file_hash == rec_hash).first()
        if rec:
            rec.competencia = competencia
            rec.unidade = unidade
            rec.tipo = tipo
            rec.file_name = path.name
            rec.status = "ok"
            rec.meta = item.get("meta") or {}
            rec.source_file_hash = item.get("source_file_hash") or file_hash
            rec.pack_patch = item.get("pack_patch")
        else:
            db.add(
                ImportRecord(
                    company_id=COMPANY,
                    competencia=competencia,
                    unidade=unidade,
                    tipo=tipo,
                    file_hash=rec_hash,
                    file_name=path.name,
                    status="ok",
                    meta=item.get("meta") or {},
                    source_file_hash=item.get("source_file_hash") or file_hash,
                    pack_patch=item.get("pack_patch"),
                )
            )
        meta = item.get("meta") or {}
        print("OK", path.name, competencia, unidade, "meta", meta.get("total") or meta.get("competencia"))
        saved += 1
    return saved, refused


def main() -> int:
    args = [Path(a) for a in sys.argv[1:] if not a.startswith("-")]
    paths = args if args else list(DEFAULTS)
    missing = [p for p in paths if not p.is_file()]
    if missing:
        for p in missing:
            print("ERR arquivo ausente", p)
        return 1

    db = SessionLocal()
    total_saved = 0
    total_refused = 0
    try:
        company = db.query(Company).filter(Company.id == COMPANY).first()
        if not company:
            print("ERR empresa schumacher não está no banco. Rode scripts/seed.py antes.")
            return 2

        reg = COMPANY_BY_ID.get(COMPANY)
        company.tabs = _append_tabs(company.tabs, reg.tabs if reg else tuple())
        flag_modified(company, "tabs")

        for link in db.query(UserCompany).filter(UserCompany.company_id == COMPANY).all():
            link.tabs = _append_tabs(link.tabs, company.tabs)
            flag_modified(link, "tabs")

        for path in paths:
            s, r = _import_file(db, path)
            total_saved += s
            total_refused += r

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("DONE saved=", total_saved, "refused=", total_refused)
    return 0 if total_refused == 0 and total_saved else 2


if __name__ == "__main__":
    raise SystemExit(main())
