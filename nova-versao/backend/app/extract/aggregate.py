from __future__ import annotations

from collections import defaultdict

from app.companies import only_digits
from app.extract.parse_movimento import ExtractedMovimento, Line


def round2(n: float) -> float:
    return round(float(n or 0) * 100) / 100


def format_cnpj(digits: str) -> str:
    d = only_digits(digits)
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return d or "—"


def tipo_doc(doc: str) -> str:
    """11 dígitos = CPF, 14 = CNPJ, qualquer outro = outros."""
    d = only_digits(doc or "")
    if len(d) == 11:
        return "cpf"
    if len(d) == 14:
        return "cnpj"
    return "outros"


def vendas_por_doc(ranking: list, soma: float) -> dict:
    buckets = {k: {"total": 0.0, "qtd": 0, "pct": None} for k in ("cpf", "cnpj", "outros")}
    for p in ranking or []:
        t = p.get("tipoDoc") or tipo_doc(p.get("cnpj") or p.get("doc") or "")
        if t not in buckets:
            t = "outros"
        buckets[t]["total"] += float(p.get("total") or 0)
        buckets[t]["qtd"] += int(p.get("qtd") or 0)
    for b in buckets.values():
        b["total"] = round2(b["total"])
        b["pct"] = round2(100 * b["total"] / soma) if soma else None
    return buckets


def unique_nfs(lines: list[Line]) -> int:
    seen: set[str] = set()
    for line in lines:
        nota = (line.nota or "").strip()
        if not nota:
            continue
        seen.add(f"{nota}|{(line.serie or '').strip()}")
    return len(seen)


def aggregate(lines: list[Line], party_field: str) -> dict:
    by_cfop: dict[str, dict] = {}
    by_party: dict[str, dict] = {}
    by_uf: dict[str, float] = defaultdict(float)
    soma = 0.0

    for line in lines:
        valor = float(line.valor or 0)
        soma += valor
        cfop = line.cfop or "—"
        uf = (line.uf or "—").strip() or "—"
        party_key = f"{only_digits(line.doc) or line.nome}|{uf}"
        nf_key = f"{line.nota}|{line.serie}"

        bucket = by_cfop.setdefault(cfop, {"total": 0.0, "nfs": set(), "parties": {}})
        bucket["total"] += valor
        bucket["nfs"].add(nf_key)
        p = bucket["parties"].setdefault(
            party_key,
            {
                "nome": line.nome,
                "cnpj": format_cnpj(line.doc),
                "tipoDoc": tipo_doc(line.doc),
                "uf": uf,
                "total": 0.0,
                "nfs": set(),
            },
        )
        p["total"] += valor
        p["nfs"].add(nf_key)

        gp = by_party.setdefault(
            party_key,
            {
                "nome": line.nome,
                "cnpj": format_cnpj(line.doc),
                "tipoDoc": tipo_doc(line.doc),
                "uf": uf,
                "total": 0.0,
                "nfs": set(),
            },
        )
        gp["total"] += valor
        gp["nfs"].add(nf_key)
        by_uf[uf] = round2(by_uf[uf] + valor)

    cfop_list = []
    for cfop, c in by_cfop.items():
        parties = [
            {
                "nome": p["nome"],
                "cnpj": p["cnpj"],
                "tipoDoc": p.get("tipoDoc") or tipo_doc(p.get("cnpj") or ""),
                "uf": p["uf"],
                "qtd": len(p["nfs"]),
                "total": round2(p["total"]),
            }
            for p in c["parties"].values()
        ]
        parties.sort(key=lambda x: x["total"], reverse=True)
        item = {"cfop": cfop, "qtd": len(c["nfs"]), "total": round2(c["total"]), party_field: parties}
        cfop_list.append(item)
    cfop_list.sort(key=lambda x: x["total"], reverse=True)

    ranking = [
        {
            "nome": p["nome"],
            "cnpj": p["cnpj"],
            "tipoDoc": p.get("tipoDoc") or tipo_doc(p.get("cnpj") or ""),
            "uf": p["uf"],
            "qtd": len(p["nfs"]),
            "total": round2(p["total"]),
        }
        for p in by_party.values()
    ]
    ranking.sort(key=lambda x: x["total"], reverse=True)

    return {
        "cfopList": cfop_list,
        "ranking": ranking,
        "byUf": dict(by_uf),
        "soma": round2(soma),
        "nfs": unique_nfs(lines),
    }


def empty_pack() -> dict:
    return {
        "hasMovimentacao": False,
        "hasDre": False,
        "totalCompras": 0,
        "cfopSaidasTotal": 0,
        "nfsEntradas": 0,
        "nfsSaidas": 0,
        "receitaBruta": 0,
        "cfopDados": [],
        "cfopSaidas": [],
        "fornecedores": [],
        "clientes": [],
        "clientesTop10": [],
        "porUf": {},
        "dre": None,
        "impostos": None,
        "apuracao": None,
    }


def merge_entradas(pack: dict, mov: ExtractedMovimento) -> dict:
    agg = aggregate(mov.lines, "fornecedores")
    pack = dict(pack or {})
    pack["hasMovimentacao"] = True
    pack["totalCompras"] = agg["soma"]
    pack["nfsEntradas"] = agg["nfs"]
    pack["cfopDados"] = agg["cfopList"]
    pack["fornecedores"] = agg["ranking"]
    pack["porUf"] = agg["byUf"]
    pack["entradasMeta"] = {
        "totalGeralExcel": mov.total_geral,
        "soma": agg["soma"],
        "delta": round2(agg["soma"] - float(mov.total_geral or 0)),
        "company": mov.company,
        "cnpj": mov.cnpj,
        "period": mov.period,
        "parser": mov.parser,
    }
    return pack


def merge_saidas(pack: dict, mov: ExtractedMovimento) -> dict:
    agg = aggregate(mov.lines, "clientes")
    pack = dict(pack or {})
    pack["hasMovimentacao"] = True
    pack["cfopSaidasTotal"] = agg["soma"]
    pack["receitaBruta"] = agg["soma"]
    pack["nfsSaidas"] = agg["nfs"]
    pack["cfopSaidas"] = [{"cfop": c["cfop"], "qtd": c["qtd"], "total": c["total"]} for c in agg["cfopList"]]
    pack["cfopSaidasDetalhe"] = agg["cfopList"]
    pack["clientes"] = agg["ranking"]
    pack["clientesTop10"] = agg["ranking"][:10]
    pack["vendasPorDoc"] = vendas_por_doc(agg["ranking"], agg["soma"])
    top_sum = sum(float(x["total"]) for x in pack["clientesTop10"])
    pack["demaisClientes"] = round2(agg["soma"] - top_sum)
    pack["porUfSaidas"] = agg["byUf"]
    pack["saidasMeta"] = {
        "totalGeralExcel": mov.total_geral,
        "soma": agg["soma"],
        "delta": round2(agg["soma"] - float(mov.total_geral or 0)),
        "company": mov.company,
        "cnpj": mov.cnpj,
        "period": mov.period,
        "parser": mov.parser,
    }
    return pack


def validate_movimento(mov: ExtractedMovimento, agg_soma: float) -> list[str]:
    errors: list[str] = []
    if not mov.lines:
        errors.append("Nenhuma linha de detalhe encontrada")
    if mov.total_geral is None:
        errors.append("Total Geral não encontrado")
    else:
        delta = round2(agg_soma - float(mov.total_geral))
        if abs(delta) >= 0.02:
            errors.append(f"Δ Total Geral = {delta} (limite 0,02)")
    return errors
