"""Exporta patches ICMS/PIS/COFINS da Loja (loj2) só para ADD/FIX; recusa arquivo inconsistente."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.extract.classify import competencia_from_filename  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.extract.parse_impostos import composicao_from_apuracao, deducoes_from_apuracao  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

SRC = Path(r"c:\Users\trind\Downloads\loj2")
DEST = Path(__file__).with_name("_loja_icms_pis_patches.json")
COMPANY = "loja-maquinas"

# Snapshot do Postgres Êxito no momento do export (fonte para SKIP/FIX).
SERVER = {
    "2026-01": {"icms": 21986.21, "pis": 1791.65, "cof": 8252.44},
    "2026-02": {"icms": 39741.32, "pis": 2780.76, "cof": 12808.33},
    "2026-03": {"icms": 37815.92, "pis": 3029.17, "cof": 13952.56},
    "2026-04": {"icms": 42833.77, "pis": 0.0, "cof": 0.0},
    "2026-05": {"icms": 43593.33, "pis": 2929.38, "cof": 13492.88},
    "2026-06": {"icms": 34600.38, "pis": 3466.47, "cof": 15966.79},
    "2026-07": {"icms": None, "pis": None, "cof": None},
}


def _approx(a: float | None, b: float | None, tol: float = 0.02) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return abs(float(a) - float(b)) < tol


def main() -> int:
    items: list[dict] = []
    refused: list[str] = []
    skipped = 0
    for month_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        for path in sorted(month_dir.glob("*.xls")):
            low = path.name.lower()
            if "icms" not in low and "pis" not in low:
                continue
            data = path.read_bytes()
            result = classify_and_extract(path, data)
            if result.get("errors") or result.get("company_id") != COMPANY:
                print("BAD", path.name, result.get("errors"), result.get("company_id"))
                return 1
            tipo = result["tipo"]
            if tipo not in ("icms", "pis_cofins"):
                continue
            comp = result.get("competencia") or ""
            fn_comp = competencia_from_filename(path.name) or competencia_from_filename(month_dir.name)
            if fn_comp and comp and fn_comp != comp:
                msg = f"{path.name}: cabeçalho {comp} != filename/pasta {fn_comp}"
                refused.append(msg)
                print("REFUSE", msg)
                continue

            pack = result.get("pack_patch") or {}
            ap = pack.get("apuracao") or {}
            srv = SERVER.get(comp) or {}
            action = "SKIP"

            if tipo == "icms":
                val = float((ap.get("icms") or {}).get("aRecolher") or 0)
                s = srv.get("icms")
                if s is None:
                    action = "ADD"
                elif not _approx(val, float(s)):
                    action = "FIX"
            else:
                pis = float((ap.get("pis") or {}).get("aRecolher") or 0)
                cof = float((ap.get("cofins") or {}).get("aRecolher") or 0)
                if srv.get("pis") is None and srv.get("cof") is None:
                    action = "ADD"
                elif not _approx(pis, srv.get("pis")) or not _approx(cof, srv.get("cof")):
                    action = "FIX"

            if action == "SKIP":
                print("SKIP", month_dir.name, tipo, comp)
                skipped += 1
                continue

            # Recalcula composição/deduções só com o patch deste arquivo
            # (no apply fazemos merge e recompose no pack final).
            patch = dict(pack)
            if patch.get("apuracao"):
                patch["composicao"] = composicao_from_apuracao(patch["apuracao"])
                patch["deducoes"] = deducoes_from_apuracao(patch["apuracao"])

            items.append(
                {
                    "file_name": path.name,
                    "file_hash": sha256_bytes(data),
                    "tipo": tipo,
                    "competencia": comp,
                    "unidade": result.get("unidade") or "matriz",
                    "company_id": COMPANY,
                    "action": action,
                    "meta": result.get("meta") or {},
                    "pack_patch": patch,
                }
            )
            print(action, month_dir.name, tipo, comp)

    DEST.write_text(json.dumps({"items": items, "refused": refused}, ensure_ascii=False), encoding="utf-8")
    print("wrote", DEST, "items", len(items), "skipped", skipped, "refused", len(refused))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
