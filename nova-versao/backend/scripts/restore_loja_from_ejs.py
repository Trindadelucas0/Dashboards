"""Restaura packs da Loja das Máquinas a partir de src/views/loja-maquinas.ejs.

Uso:
  python scripts/restore_loja_from_ejs.py
  python scripts/restore_loja_from_ejs.py --ejs /path/to/loja-maquinas.ejs
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

from app.companies import ALL_TABS, COMPANY_BY_ID  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Company, CompanyCnpj, FiscalMonth  # noqa: E402

COMPANY_ID = "loja-maquinas"
DEFAULT_EJS = REPO / "src" / "views" / "loja-maquinas.ejs"


def extract_fiscal_por_mes(ejs_path: Path) -> dict:
    text = ejs_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"const FISCAL_POR_MES = (\{.*?\});\s*\n", text, re.S)
    if not m:
        raise SystemExit(f"FISCAL_POR_MES não encontrado em {ejs_path}")
    return json.loads(m.group(1))


def _num(v, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def map_pack(raw: dict) -> dict:
    """Normaliza pack do EJS para o contrato do nova-versao."""
    pack = deepcopy(raw or {})
    compras = _num(pack.get("totalCompras"))
    vendas = _num(pack.get("cfopSaidasTotal") or pack.get("receitaBruta"))
    receita = _num(pack.get("receitaBruta")) or vendas

    cfop_ent = pack.get("cfopDados") or pack.get("cfopEntradas") or []
    pack["cfopDados"] = cfop_ent
    pack.pop("cfopEntradas", None)

    fornecedores = pack.get("fornecedores")
    if not fornecedores:
        # agrega fornecedores embutidos nos CFOPs de entrada
        by: dict[str, dict] = {}
        for c in cfop_ent:
            for f in c.get("fornecedores") or []:
                key = f"{f.get('cnpj')}|{f.get('nome')}|{f.get('uf')}"
                row = by.setdefault(
                    key,
                    {
                        "nome": f.get("nome") or "—",
                        "cnpj": f.get("cnpj") or "",
                        "uf": f.get("uf") or "—",
                        "qtd": 0,
                        "total": 0.0,
                    },
                )
                row["qtd"] = int(row["qtd"]) + int(f.get("qtd") or 0)
                row["total"] = round(float(row["total"]) + _num(f.get("total")), 2)
        fornecedores = sorted(by.values(), key=lambda x: x["total"], reverse=True)
    pack["fornecedores"] = fornecedores

    clientes = pack.get("clientes") or pack.get("clientesTop") or pack.get("clientesTop10") or []
    pack["clientes"] = clientes
    pack["clientesTop10"] = (pack.get("clientesTop10") or clientes)[:10]
    top_sum = round(sum(_num(c.get("total")) for c in pack["clientesTop10"]), 2)
    pack["demaisClientes"] = round(vendas - top_sum, 2)

    pack["totalCompras"] = compras
    pack["cfopSaidasTotal"] = vendas
    pack["receitaBruta"] = receita
    pack["cfopSaidas"] = pack.get("cfopSaidas") or []
    pack["nfsEntradas"] = int(pack.get("nfsEntradas") or sum(int(c.get("qtd") or 0) for c in cfop_ent))
    pack["nfsSaidas"] = int(pack.get("nfsSaidas") or sum(int(c.get("qtd") or 0) for c in pack["cfopSaidas"]))

    if not isinstance(pack.get("apuracao"), dict):
        ap: dict = {}
        if pack.get("icmsRecolher") is not None or pack.get("icmsDebito") is not None:
            ap["icms"] = {
                "aRecolher": _num(pack.get("icmsRecolher")),
                "apurado": _num(pack.get("icmsDebito")),
            }
        if pack.get("pisRecolher") is not None:
            ap["pis"] = {"aRecolher": _num(pack.get("pisRecolher")), "apurado": _num(pack.get("pisRecolher"))}
        if pack.get("cofinsRecolher") is not None:
            ap["cofins"] = {
                "aRecolher": _num(pack.get("cofinsRecolher")),
                "apurado": _num(pack.get("cofinsRecolher")),
            }
        if ap:
            pack["apuracao"] = ap

    if pack.get("composicao") is None and isinstance(pack.get("apuracao"), dict):
        comp = []
        for key, label in (("icms", "ICMS"), ("pis", "PIS"), ("cofins", "COFINS"), ("ipi", "IPI"), ("icmsSt", "ICMS ST")):
            item = pack["apuracao"].get(key) or {}
            if isinstance(item, dict) and item.get("aRecolher") is not None:
                val = _num(item.get("aRecolher"))
                if abs(val) > 0.009:
                    comp.append({"label": label, "valor": round(val, 2)})
        pack["composicao"] = comp

    if pack.get("deducoes") is None and pack.get("composicao"):
        pack["deducoes"] = round(sum(_num(c.get("valor")) for c in pack["composicao"]), 2)
    if pack.get("dedPct") is None and pack.get("deducoes") is not None and receita:
        pack["dedPct"] = round(100 * _num(pack["deducoes"]) / receita, 2)

    pack["hasMovimentacao"] = True
    if pack.get("hasDre") is None:
        pack["hasDre"] = bool(pack.get("dre"))
    return pack


def ensure_company(db) -> None:
    reg = COMPANY_BY_ID[COMPANY_ID]
    row = db.query(Company).filter(Company.id == COMPANY_ID).first()
    if not row:
        row = Company(id=COMPANY_ID)
        db.add(row)
    row.label = reg.label
    row.theme = reg.theme
    row.cnpj = reg.cnpj
    row.tabs = list(reg.tabs or ALL_TABS)
    row.name_re = reg.name_re or ""
    row.description = "Loja das Máquinas e Ferramentas"
    alias = db.query(CompanyCnpj).filter(CompanyCnpj.cnpj == reg.cnpj).first()
    if not alias:
        db.add(CompanyCnpj(company_id=COMPANY_ID, cnpj=reg.cnpj, unidade="matriz", label="Matriz"))
    elif alias.company_id != COMPANY_ID:
        alias.company_id = COMPANY_ID
        alias.unidade = "matriz"
        alias.label = "Matriz"


def upsert_months(db, fiscal: dict) -> list[tuple[str, float, float]]:
    out: list[tuple[str, float, float]] = []
    for comp in sorted(fiscal.keys()):
        if not re.fullmatch(r"\d{4}-\d{2}", comp):
            continue
        pack = map_pack(fiscal[comp])
        row = (
            db.query(FiscalMonth)
            .filter(
                FiscalMonth.company_id == COMPANY_ID,
                FiscalMonth.competencia == comp,
                FiscalMonth.unidade == "matriz",
            )
            .first()
        )
        if not row:
            row = FiscalMonth(company_id=COMPANY_ID, competencia=comp, unidade="matriz", pack={})
            db.add(row)
        row.pack = pack
        row.updated_at = datetime.utcnow()
        out.append((comp, float(pack.get("totalCompras") or 0), float(pack.get("cfopSaidasTotal") or 0)))
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ejs", type=Path, default=DEFAULT_EJS)
    args = parser.parse_args()
    if not args.ejs.exists():
        raise SystemExit(f"EJS não encontrado: {args.ejs}")

    fiscal = extract_fiscal_por_mes(args.ejs)
    db = SessionLocal()
    try:
        ensure_company(db)
        db.flush()
        rows = upsert_months(db, fiscal)
        db.commit()
        print(f"Loja restaurada: {len(rows)} meses em {COMPANY_ID}")
        for comp, compras, vendas in rows:
            print(f"  {comp}  compras={compras:,.2f}  vendas={vendas:,.2f}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
