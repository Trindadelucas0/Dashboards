"""Reconstrução do pack ao excluir uma planilha, sem ciclo com o router."""

from __future__ import annotations

import copy

from app.extract.aggregate import preserve_simples_receita

ENTRADAS_KEYS = (
    "totalCompras",
    "nfsEntradas",
    "cfopDados",
    "fornecedores",
    "porUf",
    "entradasMeta",
)
SAIDAS_KEYS = (
    "cfopSaidasTotal",
    "nfsSaidas",
    "cfopSaidas",
    "cfopSaidasDetalhe",
    "clientes",
    "clientesTop10",
    "vendasPorDoc",
    "demaisClientes",
    "porUfSaidas",
    "saidasMeta",
)
DRE_KEYS = (
    "hasDre",
    "dre",
    "receitaBruta",
    "lucBruto",
    "lucLiq",
    "margMb",
    "margMl",
    "cmv",
)
BALANCETE_KEYS = ("hasBalancete", "balancete")

APURACAO_KEYS_BY_TIPO: dict[str, tuple[str, ...]] = {
    "icms": ("icms",),
    "ipi": ("ipi",),
    "pis": ("pis",),
    "cofins": ("cofins",),
    "pis_cofins": ("pis", "cofins"),
    "icms_st": ("icmsSt",),
    "irpj": ("irpj",),
    "csll": ("csll",),
    "irpj_csll": ("irpj", "csll"),
    "difal": ("difal",),
}

CONFLICT_DETAIL = (
    "Não dá para separar esta planilha de outra do mesmo tipo neste mês; "
    "use Substituir mês ao reimportar o pacote certo."
)


def deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base or {})
    for key, val in (patch or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _top_keys(patches: list) -> set[str]:
    keys: set[str] = set()
    for patch in patches or []:
        if isinstance(patch, dict):
            keys.update(patch.keys())
    return keys


def rebuild_pack(current: dict, deleted_patches: list, remaining_patches: list) -> dict:
    """Mantém chaves de topo que nenhum patch conhecido mexe e remonta o resto.

    `remaining_patches` já vem na ordem do caller (created_at, id).
    """
    current = current or {}
    known = list(deleted_patches or []) + list(remaining_patches or [])
    touched = _top_keys(known)
    base = {key: copy.deepcopy(val) for key, val in current.items() if key not in touched}
    out = base
    for patch in remaining_patches or []:
        out = deep_merge(out, patch or {})
    return preserve_simples_receita(out)


def slot_revert_mode(deleting: list[dict], remaining: list[dict]) -> str:
    """rebuild | legacy_only | legacy_strip | conflict.

    Rebuild só quando todo registro apagado ou que permanece tem pack_patch.
    Legado sem patch: único arquivo zera o slot; tipo repetido é conflito.
    """
    rows = list(deleting or []) + list(remaining or [])
    if rows and all(row.get("pack_patch") is not None for row in rows):
        return "rebuild"
    if not remaining:
        return "legacy_only"
    deleted_tipos = {row.get("tipo") for row in deleting if row.get("tipo")}
    remaining_tipos = {row.get("tipo") for row in remaining if row.get("tipo")}
    if deleted_tipos & remaining_tipos:
        return "conflict"
    return "legacy_strip"


def apply_legacy_key_removal(pack: dict, deleted_tipos: set[str], remaining_tipos: set[str]) -> dict:
    """Tira do pack só as chaves do tipo excluído. Entradas não mexe em saídas."""
    out = copy.deepcopy(pack or {})
    deleted_tipos = set(deleted_tipos or [])
    remaining_tipos = set(remaining_tipos or [])

    if "entradas" in deleted_tipos:
        for key in ENTRADAS_KEYS:
            out.pop(key, None)
    if "saidas" in deleted_tipos:
        for key in SAIDAS_KEYS:
            out.pop(key, None)
    if "dre" in deleted_tipos:
        for key in DRE_KEYS:
            out.pop(key, None)
    if "balancete" in deleted_tipos:
        for key in BALANCETE_KEYS:
            out.pop(key, None)

    ap = out.get("apuracao")
    ap_work = dict(ap) if isinstance(ap, dict) else None
    ap_touched = False
    for tipo in deleted_tipos:
        if tipo == "apuracao_5005":
            out.pop("memoriaCalculo", None)
        if ap_work is None:
            continue
        for sub in APURACAO_KEYS_BY_TIPO.get(tipo, ()):
            if sub in ap_work:
                ap_work.pop(sub, None)
                ap_touched = True
    if ap_touched:
        if ap_work:
            out["apuracao"] = ap_work
        else:
            out.pop("apuracao", None)

    if "saidas" in deleted_tipos and "dre" not in deleted_tipos:
        dre = out.get("dre") if isinstance(out.get("dre"), dict) else None
        if not out.get("hasDre") and not dre:
            out.pop("receitaBruta", None)

    still_mov = bool(remaining_tipos & {"entradas", "saidas"})
    if not still_mov and (deleted_tipos & {"entradas", "saidas"}):
        out.pop("hasMovimentacao", None)
    return out


def pack_has_useful_data(pack: dict | None) -> bool:
    if not pack:
        return False
    for value in pack.values():
        if value is None or value == "" or value is False:
            continue
        if isinstance(value, (dict, list, tuple)) and len(value) == 0:
            continue
        return True
    return False
