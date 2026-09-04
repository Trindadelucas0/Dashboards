"""Exporta patches Entradas/Saídas da Loja (loj2) com entradasMeta/saidasMeta + lines."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.extract.pipeline import classify_and_extract  # noqa: E402
from app.security import sha256_bytes  # noqa: E402

SRC = Path(r"c:\Users\trind\Downloads\loj2")
DEST = Path(__file__).with_name("_loja_movimento_meta_patches.json")
COMPANY = "loja-maquinas"


def main() -> int:
    items: list[dict] = []
    for month_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        for path in sorted(month_dir.glob("*.xls")):
            low = path.name.lower()
            if "entrada" not in low and "said" not in low and "saíd" not in low:
                continue
            data = path.read_bytes()
            result = classify_and_extract(path, data)
            if result.get("errors") or result.get("company_id") != COMPANY:
                print("BAD", path.name, result.get("errors"), result.get("company_id"))
                return 1
            tipo = result.get("tipo")
            if tipo not in ("entradas", "saidas"):
                print("SKIP tipo", path.name, tipo)
                continue
            meta_key = "entradasMeta" if tipo == "entradas" else "saidasMeta"
            pack = result.get("pack_patch") or {}
            meta = pack.get(meta_key) or {}
            # Patch mínimo: só o meta de conferência (+ flags de movimento já existentes).
            # Não manda receitaBruta/cfopSaidasTotal para não sobrescrever DRE.
            slim = {meta_key: meta, "hasMovimentacao": True}
            if tipo == "entradas":
                if pack.get("totalCompras") is not None:
                    slim["totalCompras"] = pack["totalCompras"]
                if pack.get("nfsEntradas") is not None:
                    slim["nfsEntradas"] = pack["nfsEntradas"]
            else:
                if pack.get("nfsSaidas") is not None:
                    slim["nfsSaidas"] = pack["nfsSaidas"]
                if pack.get("cfopSaidasTotal") is not None:
                    slim["cfopSaidasTotal"] = pack["cfopSaidasTotal"]

            items.append(
                {
                    "file_name": path.name,
                    "file_hash": sha256_bytes(data),
                    "tipo": tipo,
                    "competencia": result["competencia"],
                    "unidade": result.get("unidade") or "matriz",
                    "company_id": COMPANY,
                    "meta": result.get("meta") or {},
                    "pack_patch": slim,
                    "lines": result.get("lines") or [],
                }
            )
            print(
                "OK",
                month_dir.name,
                tipo,
                result["competencia"],
                "soma",
                meta.get("soma"),
                "delta",
                meta.get("delta"),
                "lines",
                len(result.get("lines") or []),
            )
    DEST.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    print("wrote", DEST, "items", len(items), "bytes", DEST.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
