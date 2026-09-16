"""Copia a coluna A RECOLHER do RESUMO (aRecolherPlanilha) para aRecolher oficial.

Dry-run:  python scripts/_fix_pis_cofins_arecolher_remote.py
Aplicar:  APPLY=1 python scripts/_fix_pis_cofins_arecolher_remote.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.parse_impostos import composicao_from_apuracao, deducoes_from_apuracao  # noqa: E402
from app.models import FiscalMonth  # noqa: E402

PRINT_PIS_DEBITO = 27980.61
PRINT_BASE = 1695794.58
PRINT_PIS_SALDO = 81795.53


def _num(val) -> float | None:
    if val is None:
        return None
    try:
        return round(float(val), 2)
    except (TypeError, ValueError):
        return None


def _matches_print(pack: dict) -> bool:
    livro = pack.get("memoriaPisCofins") or {}
    resumo = (livro.get("resumo") or {}).get("pis") or {}
    if _num(resumo.get("saldoCredor")) == PRINT_PIS_SALDO:
        return True
    if _num(resumo.get("debito")) == PRINT_PIS_DEBITO:
        return True
    for line in (livro.get("debito") or {}).get("linhas") or []:
        if str(line.get("tributo") or "").upper() != "PIS":
            continue
        if _num(line.get("valorImposto")) == PRINT_PIS_DEBITO:
            return True
        if _num(line.get("baseCalculo")) == PRINT_BASE or _num(line.get("bcAjustada")) == PRINT_BASE:
            return True
    return False


def _fix_tributo(pack: dict, tributo: str) -> tuple[bool, float | None, float | None]:
    livro = pack.setdefault("memoriaPisCofins", {})
    resumo_all = livro.setdefault("resumo", {})
    row = resumo_all.get(tributo)
    if not isinstance(row, dict):
        return False, None, None
    planilha = _num(row.get("aRecolherPlanilha"))
    if planilha is None:
        return False, _num(row.get("aRecolher")), None
    before = _num(((pack.get("apuracao") or {}).get(tributo) or {}).get("aRecolher"))
    if before is None:
        before = _num(row.get("aRecolher"))
    if before is not None and abs(before - planilha) < 0.02 and row.get("fonte") == "resumo":
        return False, before, planilha
    row["aRecolher"] = planilha
    row["fonte"] = "resumo"
    ap = pack.setdefault("apuracao", {})
    tax = dict(ap.get(tributo) or {})
    tax["aRecolher"] = planilha
    ap[tributo] = tax
    return True, before, planilha


def main() -> int:
    apply = os.environ.get("APPLY", "").strip() in ("1", "true", "yes")
    db = SessionLocal()
    changed = skipped = print_hits = 0
    try:
        rows = db.query(FiscalMonth).all()
        for row in rows:
            pack = dict(row.pack or {})
            livro = pack.get("memoriaPisCofins")
            if not isinstance(livro, dict) or not (livro.get("resumo") or {}):
                skipped += 1
                continue
            hit = _matches_print(pack)
            did = False
            notes = []
            for tributo in ("pis", "cofins"):
                ok, before, after = _fix_tributo(pack, tributo)
                if ok:
                    did = True
                    notes.append(f"{tributo} {before} -> {after}")
            if hit:
                print_hits += 1
                print(
                    "PRINT-MATCH",
                    row.company_id,
                    row.competencia,
                    row.unidade,
                    notes or "already-oficial",
                )
            if not did:
                skipped += 1
                continue
            pack["memoriaPisCofins"]["formula"] = (
                "aRecolher = coluna RESUMO (débito − crédito − saldo credor)"
            )
            if pack.get("apuracao"):
                pack["composicao"] = composicao_from_apuracao(pack["apuracao"])
                pack["deducoes"] = deducoes_from_apuracao(pack["apuracao"])
                rb = float(pack.get("receitaBruta") or pack.get("cfopSaidasTotal") or 0)
                if pack.get("deducoes") is not None and rb:
                    pack["dedPct"] = round(100 * float(pack["deducoes"]) / rb, 2)
            print(
                ("APPLY" if apply else "DRY"),
                row.company_id,
                row.competencia,
                row.unidade,
                ";",
                " | ".join(notes),
            )
            if apply:
                row.pack = pack
                flag_modified(row, "pack")
            changed += 1
        if apply:
            db.commit()
        else:
            db.rollback()
        print("changed", changed, "skipped", skipped, "print_hits", print_hits, "apply", apply)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
