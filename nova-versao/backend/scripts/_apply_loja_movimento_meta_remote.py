"""Aplica entradasMeta/saidasMeta da Loja sem sobrescrever DRE/impostos.

SKIP se o meta do tipo já existir. Autossuficiente para o container da API.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import FiscalMonth, ImportRecord, NfeLine  # noqa: E402

PATCHES = Path(__file__).with_name("_loja_movimento_meta_patches.json")


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _has_meta(pack: dict | None, tipo: str) -> bool:
    pack = pack or {}
    if tipo == "entradas":
        meta = pack.get("entradasMeta")
        return isinstance(meta, dict) and (meta.get("soma") is not None or meta.get("totalGeralExcel") is not None)
    if tipo == "saidas":
        meta = pack.get("saidasMeta")
        return isinstance(meta, dict) and (meta.get("soma") is not None or meta.get("totalGeralExcel") is not None)
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
            if _has_meta(row.pack, tipo):
                print("SKIP", competencia, tipo)
                skipped += 1
                continue

            # Preserva receitaBruta da DRE: o slim patch não manda receitaBruta.
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

            # NfeLine: só adiciona se ainda não houver linhas desse tipo no mês
            existing_lines = (
                db.query(NfeLine.id)
                .filter(
                    NfeLine.company_id == company_id,
                    NfeLine.competencia == competencia,
                    NfeLine.unidade == unidade,
                    NfeLine.tipo == tipo,
                )
                .limit(1)
                .first()
            )
            lines_added = 0
            if not existing_lines:
                for line in item.get("lines") or []:
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
                        lines_added += 1
                    except IntegrityError:
                        continue

            meta = (item.get("pack_patch") or {}).get(
                "entradasMeta" if tipo == "entradas" else "saidasMeta"
            ) or {}
            print(
                "MERGED",
                competencia,
                tipo,
                "soma",
                meta.get("soma"),
                "delta",
                meta.get("delta"),
                "nfe+",
                lines_added,
            )
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
