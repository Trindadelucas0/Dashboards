"""Aplica patches ICMS/PIS Loja no Postgres: ADD/FIX (não SKIP); recompõe composição.

Autossuficiente para o container da API.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.parse_impostos import composicao_from_apuracao, deducoes_from_apuracao  # noqa: E402
from app.models import FiscalMonth, ImportRecord  # noqa: E402

PATCHES = Path(__file__).with_name("_loja_icms_pis_patches.json")


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def main() -> int:
    payload = json.loads(PATCHES.read_text(encoding="utf-8"))
    items = payload.get("items") if isinstance(payload, dict) else payload
    refused_notes = (payload.get("refused") if isinstance(payload, dict) else None) or []
    for note in refused_notes:
        print("NOTE refused at export:", note)

    db = SessionLocal()
    merged = refused = 0
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

            before = row.pack or {}
            before_icms = ((before.get("apuracao") or {}).get("icms") or {}).get("aRecolher")
            before_pis = ((before.get("apuracao") or {}).get("pis") or {}).get("aRecolher")
            before_cof = ((before.get("apuracao") or {}).get("cofins") or {}).get("aRecolher")

            pack = _deep_merge(before, item.get("pack_patch") or {})
            if pack.get("apuracao"):
                pack["composicao"] = composicao_from_apuracao(pack["apuracao"])
                pack["deducoes"] = deducoes_from_apuracao(pack["apuracao"])
                rb = float(pack.get("receitaBruta") or pack.get("cfopSaidasTotal") or 0)
                if pack.get("deducoes") is not None and rb:
                    pack["dedPct"] = round(100 * float(pack["deducoes"]) / rb, 2)

            row.pack = pack
            flag_modified(row, "pack")

            file_hash = item.get("file_hash")
            existing = (
                db.query(ImportRecord).filter(ImportRecord.file_hash == file_hash).first()
                if file_hash
                else None
            )
            if existing:
                existing.status = "ok"
                existing.meta = {
                    **(item.get("meta") or {}),
                    "action": item.get("action"),
                    "beforeIcms": before_icms,
                    "beforePis": before_pis,
                    "beforeCof": before_cof,
                }
                existing.tipo = tipo
                existing.competencia = competencia
                existing.file_name = item.get("file_name") or existing.file_name
            elif file_hash:
                db.add(
                    ImportRecord(
                        company_id=company_id,
                        competencia=competencia,
                        unidade=unidade,
                        tipo=tipo,
                        file_hash=file_hash,
                        file_name=item.get("file_name") or "",
                        status="ok",
                        meta={
                            **(item.get("meta") or {}),
                            "action": item.get("action"),
                            "beforeIcms": before_icms,
                            "beforePis": before_pis,
                            "beforeCof": before_cof,
                        },
                    )
                )

            after_icms = ((pack.get("apuracao") or {}).get("icms") or {}).get("aRecolher")
            after_pis = ((pack.get("apuracao") or {}).get("pis") or {}).get("aRecolher")
            after_cof = ((pack.get("apuracao") or {}).get("cofins") or {}).get("aRecolher")
            print(
                "MERGED",
                item.get("action"),
                competencia,
                tipo,
                "icms",
                before_icms,
                "->",
                after_icms,
                "pis",
                before_pis,
                "->",
                after_pis,
                "cof",
                before_cof,
                "->",
                after_cof,
            )
            merged += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("DONE merged=", merged, "refused=", refused)
    return 0 if refused == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
