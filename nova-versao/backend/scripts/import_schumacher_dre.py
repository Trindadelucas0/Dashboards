"""Grava a DRE comparativo da Indústria Schumacher (jan–ago/2026) no Postgres.

Exige a empresa já seedada (scripts/seed.py). Reexecutar faz merge no pack
dos slots company_id=schumacher, unidade=matriz (preserva livro e vendaProduto).

Uso:
  python scripts/import_schumacher_dre.py [ARQUIVO.xlsx]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.parse_workbook_padrao import expand_workbook_parts  # noqa: E402
from app.extract.pipeline import _deep_merge, classify_and_extract  # noqa: E402
from app.models import Company, FiscalMonth, ImportRecord  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

COMPANY = "schumacher"
UNIDADE = "matriz"
DEFAULT = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "schumacher-padrao"
    / "DRE_SCHUMACHER_2026.xlsx"
)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    path = Path(args[0]) if args else DEFAULT
    if not path.is_file():
        print("ERR arquivo ausente", path)
        return 1

    db = SessionLocal()
    saved = 0
    refused = 0
    try:
        company = db.query(Company).filter(Company.id == COMPANY).first()
        if not company:
            print("ERR empresa schumacher não está no banco. Rode scripts/seed.py antes.")
            return 2

        data = path.read_bytes()
        file_hash = sha256_bytes(data)
        result = classify_and_extract(path, data, db=db)
        if result.get("tipo") != "dre_schumacher":
            print("ERR tipo", result.get("tipo"), result.get("errors"))
            return 2
        items = expand_workbook_parts({**result, "file_hash": file_hash})
        for item in items:
            errors = item.get("errors") or []
            if errors or item.get("company_id") != COMPANY or not item.get("competencia"):
                print("BAD", item.get("competencia"), errors or ["empresa/competência"])
                refused += 1
                continue
            if item.get("skipped"):
                continue
            competencia = item["competencia"]
            row = (
                db.query(FiscalMonth)
                .filter(
                    FiscalMonth.company_id == COMPANY,
                    FiscalMonth.competencia == competencia,
                    FiscalMonth.unidade == UNIDADE,
                )
                .first()
            )
            if row is None:
                row = FiscalMonth(
                    company_id=COMPANY,
                    competencia=competencia,
                    unidade=UNIDADE,
                    pack={},
                )
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
                    ImportRecord.unidade == UNIDADE,
                    ImportRecord.tipo == "dre",
                    ImportRecord.file_hash != rec_hash,
                    ImportRecord.status == "ok",
                )
                .all()
            )
            for old in stale:
                old.status = "replaced"

            rec = db.query(ImportRecord).filter(ImportRecord.file_hash == rec_hash).first()
            if rec:
                if rec.company_id != COMPANY:
                    print("BAD hash já usado por outra empresa", competencia)
                    refused += 1
                    continue
                rec.competencia = competencia
                rec.unidade = UNIDADE
                rec.tipo = "dre"
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
                        unidade=UNIDADE,
                        tipo="dre",
                        file_hash=rec_hash,
                        file_name=path.name,
                        status="ok",
                        meta=item.get("meta") or {},
                        source_file_hash=item.get("source_file_hash") or file_hash,
                        pack_patch=item.get("pack_patch"),
                    )
                )
            dre = (item.get("pack_patch") or {}).get("dre") or {}
            print("OK", competencia, "lucLiq", dre.get("lucLiq"))
            saved += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("DONE saved=", saved, "refused=", refused)
    return 0 if refused == 0 and saved else 2


if __name__ == "__main__":
    raise SystemExit(main())
