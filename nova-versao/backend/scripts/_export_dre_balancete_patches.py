from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

SRC = Path(r"c:\Users\trind\Downloads\drive-download-20260826T161842Z-1-001")
DEST = Path(__file__).with_name("_dre_balancete_patches.json")


def main() -> int:
    items = []
    for month_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        for path in sorted(month_dir.glob("*.xls")):
            data = path.read_bytes()
            result = classify_and_extract(path, data)
            if result.get("errors") or result.get("company_id") != "baifer":
                print("BAD", path, result.get("errors"), result.get("company_id"))
                return 1
            items.append(
                {
                    "file_name": path.name,
                    "file_hash": sha256_bytes(data),
                    "tipo": result["tipo"],
                    "competencia": result["competencia"],
                    "unidade": result.get("unidade") or "matriz",
                    "company_id": "baifer",
                    "meta": result.get("meta") or {},
                    "pack_patch": result.get("pack_patch") or {},
                }
            )
            print("OK", month_dir.name, result["tipo"], result["competencia"])
    DEST.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    print("wrote", DEST, "items", len(items), "bytes", DEST.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
