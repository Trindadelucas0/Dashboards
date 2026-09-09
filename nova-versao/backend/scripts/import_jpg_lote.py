"""Grava lote JPG (arquivos mensais já splitados + impostos) no Postgres.

Uso:
  python scripts/import_jpg_lote.py PASTA [--replace]
Sempre company_id=jpg; unidade vem do CNPJ / nome (nunca slot todas).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.parse_workbook_padrao import expand_workbook_parts  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.models import FiscalMonth, ImportRecord, NfeLine  # noqa: E402
from app.routers.imports import _deep_merge  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

COMPANY = "jpg"
REPLACE = "--replace" in sys.argv
REPARSE = "--reparse" in sys.argv


def _iter_paths(folder: Path) -> list[Path]:
    files: list[Path] = []
    for ext in ("*.xls", "*.xlsx"):
        files.extend(folder.glob(ext))
    return sorted(files)


def main() -> int:
    args = [a for a in sys.argv[1:] if a not in ("--replace", "--reparse")]
    if not args:
        print("Uso: import_jpg_lote.py PASTA_OU_ARQUIVO [...] [--replace] [--reparse]")
        return 2
    paths: list[Path] = []
    for a in args:
        item = Path(a)
        if folder := (item if item.is_dir() else None):
            paths.extend(_iter_paths(folder))
        elif item.is_file():
            paths.append(item)
        else:
            print("ERR ausente", item)
            return 1
    if not paths:
        print("ERR sem .xls/.xlsx")
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
            result = classify_and_extract(path, data, db=db)
            items = expand_workbook_parts({**result, "file_hash": file_hash})
            for item in items:
                errors = item.get("errors") or []
                if errors or not item.get("company_id") or not item.get("competencia"):
                    print("BAD", path.name, item.get("competencia"), errors or ["sem empresa/competência"])
                    refused += 1
                    continue
                if item["company_id"] != COMPANY:
                    print("BAD", path.name, "empresa", item["company_id"])
                    refused += 1
                    continue
                unidade = item.get("unidade") or "sede"
                if unidade == "todas":
                    print("SKIP consolidado", path.name)
                    skipped += 1
                    continue
                competencia = item["competencia"]
                tipo = item.get("tipo")
                slot_key = (COMPANY, competencia, unidade)

                existing = (
                    db.query(ImportRecord)
                    .filter(ImportRecord.file_hash == (item.get("file_hash") or file_hash))
                    .first()
                )
                if existing and not REPLACE and not REPARSE:
                    print("DUP", path.name, competencia, unidade)
                    skipped += 1
                    continue

                row = slots.get(slot_key)
                if row is None:
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
                            pack={},
                        )
                        db.add(row)
                        db.flush()
                    slots[slot_key] = row

                if REPLACE and slot_key not in cleared:
                    row.pack = {}
                    db.query(NfeLine).filter(
                        NfeLine.company_id == COMPANY,
                        NfeLine.competencia == competencia,
                        NfeLine.unidade == unidade,
                    ).delete(synchronize_session=False)
                    cleared.add(slot_key)

                row.pack = _deep_merge(row.pack or {}, item.get("pack_patch") or {})
                flag_modified(row, "pack")

                rec_hash = item.get("file_hash") or file_hash
                rec = db.query(ImportRecord).filter(ImportRecord.file_hash == rec_hash).first()
                if rec and REPLACE:
                    rec.status = "replaced"
                    rec.meta = item.get("meta") or {}
                elif not rec:
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
                        )
                    )

                for line in item.get("lines") or []:
                    try:
                        with db.begin_nested():
                            db.add(
                                NfeLine(
                                    company_id=COMPANY,
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

                print("OK", path.name, tipo, competencia, unidade)
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
