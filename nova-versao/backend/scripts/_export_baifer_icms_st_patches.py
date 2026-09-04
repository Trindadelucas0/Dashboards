"""Exporta patches ICMS ST Baifer (Apuração icms st / Demonst. SUBTRI) jan–jul/2026."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.extract.classify import competencia_from_filename  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

SRC = Path(r"c:\Users\trind\Downloads\drive-download-20260826T180812Z-1-001")
DEST = Path(__file__).with_name("_baifer_icms_st_patches.json")
COMPANY = "baifer"


def main() -> int:
    items: list[dict] = []
    for month_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        paths = [p for p in month_dir.iterdir() if "icms st" in p.name.lower()]
        if not paths:
            print("MISSING ST", month_dir.name)
            return 1
        path = paths[0]
        data = path.read_bytes()
        result = classify_and_extract(path, data)
        if result.get("errors") or result.get("tipo") != "icms_st":
            print("BAD", path.name, result.get("tipo"), result.get("errors"))
            return 1
        comp = result.get("competencia") or ""
        fn_comp = competencia_from_filename(path.name) or competencia_from_filename(month_dir.name)
        if fn_comp and comp and fn_comp != comp:
            print("BAD competencia", path.name, comp, "vs", fn_comp)
            return 1
        if not comp:
            comp = fn_comp
        pack = result.get("pack_patch") or {}
        a_rec = float((((pack.get("apuracao") or {}).get("icmsSt") or {}).get("aRecolher")) or 0)
        items.append(
            {
                "file_name": path.name,
                "file_hash": sha256_bytes(data),
                "tipo": "icms_st",
                "competencia": comp,
                "unidade": result.get("unidade") or "matriz",
                "company_id": COMPANY,
                "meta": result.get("meta") or {},
                "pack_patch": pack,
                "aRecolher": a_rec,
            }
        )
        print("OK", month_dir.name, comp, a_rec, (pack.get("porUfSt") or {}))
    DEST.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", DEST, "items", len(items))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
