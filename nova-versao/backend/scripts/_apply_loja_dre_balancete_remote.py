"""Aplica patches DRE/Balancete da Loja sem sobrescrever o que já existe.

Autossuficiente: não depende de helpers recentes no imports.py do container.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import FiscalMonth, ImportRecord  # noqa: E402

PATCHES = Path(__file__).with_name("_loja_dre_balancete_patches.json")


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _pack_has_tipo(pack: dict | None, tipo: str) -> bool:
    pack = pack or {}
    if tipo == "dre":
        dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
        return bool(pack.get("hasDre") and (dre.get("linhas") or dre.get("hasValores")))
    if tipo == "balancete":
        bal = pack.get("balancete") if isinstance(pack.get("balancete"), dict) else {}
        return bool(pack.get("hasBalancete") or bal.get("contas"))
    return False


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
