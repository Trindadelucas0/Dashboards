"""Merge IRPJ/CSLL trimestral EXITO na JPG Matriz Sede (sem substituir movimento).

Uso:
  python scripts/import_jpg_irpj_csll.py [ARQUIVO.xls ...]
Sem args: fixtures/jpg-padrao/irpj-csll-1t-2026.xls e irpj-csll-2t-2026.xls
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.models import FiscalMonth, ImportRecord  # noqa: E402
from app.routers.imports import _deep_merge  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

COMPANY = "jpg"
DEFAULTS = [
    ROOT.parent / "fixtures" / "jpg-padrao" / "irpj-csll-1t-2026.xls",
    ROOT.parent / "fixtures" / "jpg-padrao" / "irpj-csll-2t-2026.xls",
]


def main() -> int:
    args = [Path(a) for a in sys.argv[1:] if not a.startswith("-")]
    paths = args or [p for p in DEFAULTS if p.exists()]
    if not paths:
        print("ERR sem arquivos")
        return 1
    db = SessionLocal()
    saved = 0
    try:
        for path in paths:
            data = path.read_bytes()
            file_hash = sha256_bytes(data)
            result = classify_and_extract(path, data, db=db)
            errors = result.get("errors") or []
            if errors or result.get("company_id") != COMPANY or not result.get("competencia"):
                print("BAD", path.name, result.get("competencia"), errors or result.get("company_id"))
                continue
            unidade = result.get("unidade") or "sede"
            competencia = result["competencia"]
            patch = result.get("pack_patch") or {}
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
                row = FiscalMonth(
                    company_id=COMPANY,
                    competencia=competencia,
                    unidade=unidade,
                    pack=patch,
                )
                db.add(row)
                action = "INSERT"
            else:
                row.pack = _deep_merge(row.pack or {}, patch)
                flag_modified(row, "pack")
                action = "MERGE"
            db.flush()
            if not db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first():
                db.add(
                    ImportRecord(
                        company_id=COMPANY,
                        competencia=competencia,
                        unidade=unidade,
                        tipo=result.get("tipo") or "irpj_csll",
                        file_hash=file_hash,
                        file_name=path.name,
                        status="ok",
                        meta=result.get("meta") or {},
                    )
                )
            ap = (row.pack or {}).get("apuracao") or {}
            irpj = (ap.get("irpj") or {}).get("aRecolher")
            csll = (ap.get("csll") or {}).get("aRecolher")
            print(action, competencia, unidade, "IRPJ", irpj, "CSLL", csll)
            saved += 1
        db.commit()
        print("OK", saved)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
