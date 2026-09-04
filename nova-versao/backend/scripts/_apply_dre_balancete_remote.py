"""Aplica patches DRE/Balancete no pack Baifer sem duplicar o que já existe."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import FiscalMonth, ImportRecord  # noqa: E402
from app.routers.imports import _deep_merge, _pack_has_tipo  # noqa: E402

PATCHES = Path(__file__).with_name("_dre_balancete_patches.json")


def main() -> int:
    items = json.loads(PATCHES.read_text(encoding="utf-8"))
    db = SessionLocal()
    merged = skipped = refused = 0
    try:
        for item in items:
            company_id = item["company_id"]
            competencia = item["competencia"]
            unidade = item.get("unidade") or "matriz"
            tipo = item["tipo"]
            row = (
                db.query(FiscalMonth)
                .filter(
                    FiscalMonth.company_id == company_id,
                    FiscalMonth.competencia == competencia,
                    FiscalMonth.unidade == unidade,
                )
                .first()
            )
            if row is None:
                print("REFUSED no month slot", competencia, tipo)
                refused += 1
                continue
            if _pack_has_tipo(row.pack, tipo):
                print("SKIP", competencia, tipo)
                skipped += 1
                continue
            row.pack = _deep_merge(row.pack or {}, item.get("pack_patch") or {})
            flag_modified(row, "pack")
            file_hash = item.get("file_hash")
            existing = (
                db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
                if file_hash
                else None
            )
            if not existing and file_hash:
                db.add(
                    ImportRecord(
                        company_id=company_id,
                        competencia=competencia,
                        unidade=unidade,
                        tipo=tipo,
                        file_hash=file_hash,
                        file_name=item.get("file_name") or "",
                        status="ok",
                        meta=item.get("meta") or {},
                    )
                )
            print("MERGED", competencia, tipo, item.get("file_name"))
            merged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("DONE merged=", merged, "skipped=", skipped, "refused=", refused)
    return 0 if refused == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
