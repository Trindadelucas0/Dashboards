"""Grava lote Baifer (pasta Drive) no Postgres — mesmo merge do /api/imports/commit."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.models import FiscalMonth, ImportRecord, NfeLine  # noqa: E402
from app.routers.imports import _deep_merge  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

FOLDER = Path(r"C:\Users\trind\Downloads\drive-download-20260826T131057Z-1-001")
COMPANY = "baifer"
REPLACE = "--replace" in sys.argv


def _competencia_from_name(name: str) -> str | None:
    low = name.lower()
    m = re.search(r"(\d{2})-(\d{4})", low)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    m = re.search(r"(\d{2})(\d{4})", low)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    return None


def main() -> int:
    if not FOLDER.is_dir():
        print("ERR pasta ausente", FOLDER)
        return 1
    paths = sorted(FOLDER.glob("*.xls"))
    if not paths:
        print("ERR sem .xls")
        return 1

    db = SessionLocal()
    cleared: set[tuple[str, str, str]] = set()
    slots: dict[tuple[str, str, str], FiscalMonth] = {}
    saved = 0
    skipped = 0
    refused = 0
    try:
        for path in paths:
            data = path.read_bytes()
            file_hash = sha256_bytes(data)
            existing = db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
            if existing and not REPLACE:
                print("DUP", path.name)
                skipped += 1
                continue

            result = classify_and_extract(path, data, db=db)
            errors = result.get("errors") or []
            if errors or not result.get("company_id") or not result.get("competencia"):
                print("BAD", path.name, errors or ["sem empresa/competência"])
                refused += 1
                continue
            if result["company_id"] != COMPANY:
                print("BAD", path.name, "empresa", result["company_id"])
                refused += 1
                continue

            company_id = result["company_id"]
            competencia = result["competencia"]
            unidade = result.get("unidade") or "matriz"
            tipo = result.get("tipo")
            slot_key = (company_id, competencia, unidade)

            row = slots.get(slot_key)
            if row is None:
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
                    row = FiscalMonth(
                        company_id=company_id,
                        competencia=competencia,
                        unidade=unidade,
                        pack={},
                    )
                    db.add(row)
                    db.flush()
                slots[slot_key] = row

            if REPLACE and slot_key not in cleared:
                row.pack = {}
                db.query(NfeLine).filter(
                    NfeLine.company_id == company_id,
                    NfeLine.competencia == competencia,
                    NfeLine.unidade == unidade,
                ).delete(synchronize_session=False)
                cleared.add(slot_key)

            row.pack = _deep_merge(row.pack or {}, result.get("pack_patch") or {})
            flag_modified(row, "pack")

            if existing and REPLACE:
                existing.status = "replaced"
                existing.meta = result.get("meta") or {}
            elif not existing:
                db.add(
                    ImportRecord(
                        company_id=company_id,
                        competencia=competencia,
                        unidade=unidade,
                        tipo=tipo,
                        file_hash=file_hash,
                        file_name=path.name,
                        status="ok",
                        meta=result.get("meta") or {},
                    )
                )

            for line in result.get("lines") or []:
                try:
                    with db.begin_nested():
                        db.add(
                            NfeLine(
                                company_id=company_id,
                                competencia=competencia,
                                unidade=unidade,
                                tipo=tipo,
                                nota=str(line.get("nota") or ""),
                                serie=str(line.get("serie") or ""),
                                cfop=str(line.get("cfop") or ""),
                                valor=line.get("valor") or 0,
                                nome=line.get("nome") or "",
                                doc=line.get("doc") or "",
                                uf=line.get("uf") or "",
                            )
                        )
                except IntegrityError:
                    continue

            print(
                "OK",
                path.name,
                tipo,
                competencia,
                "delta" if "delta" in (result.get("meta") or {}) else "tax",
            )
            saved += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("DONE saved=", saved, "dup=", skipped, "refused=", refused, "replace=", REPLACE)
    return 0 if refused == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
