from app.imports_revert import (
    apply_legacy_key_removal,
    deep_merge,
    rebuild_pack,
    slot_revert_mode,
)
from app.routers.imports import _replacement_types_by_slot


def test_two_patches_delete_one_leaves_the_other():
    entradas = {"totalCompras": 10, "nfsEntradas": 2, "fornecedores": [{"nome": "A"}]}
    saidas = {"cfopSaidasTotal": 30, "nfsSaidas": 4, "clientes": [{"nome": "B"}]}
    current = deep_merge(deep_merge({}, entradas), saidas)
    out = rebuild_pack(current, [entradas], [saidas])
    assert out == saidas
    assert "totalCompras" not in out


def test_seed_memoria_simples_stays():
    current = {
        "memoriaSimples": {"baseMemoria": 478335.06},
        "receitaBruta": 557733.52,
        "cfopSaidasTotal": 557733.52,
    }
    deleted = [{"cfopSaidasTotal": 557733.52, "receitaBruta": 557733.52}]
    out = rebuild_pack(current, deleted, [])
    assert out["memoriaSimples"]["baseMemoria"] == 478335.06
    assert "cfopSaidasTotal" not in out


def test_preserve_simples_receita_keeps_pgdas_base():
    current = {
        "memoriaSimples": {"baseMemoria": 100.0},
        "receitaBruta": 100.0,
        "totalCompras": 5,
        "cfopSaidasTotal": 80,
    }
    deleted = [{"totalCompras": 5}]
    remaining = [{"cfopSaidasTotal": 80, "receitaBruta": 80}]
    out = rebuild_pack(current, deleted, remaining)
    assert out["memoriaSimples"]["baseMemoria"] == 100.0
    assert out["receitaBruta"] == 100.0
    assert out["cfopSaidasTotal"] == 80
    assert "totalCompras" not in out


def test_same_tipo_with_pack_patch_rebuilds():
    mode = slot_revert_mode(
        [{"tipo": "entradas", "pack_patch": {"totalCompras": 1}}],
        [{"tipo": "entradas", "pack_patch": {"totalCompras": 2}}],
    )
    assert mode == "rebuild"


def test_legacy_same_tipo_is_conflict():
    mode = slot_revert_mode(
        [{"tipo": "entradas", "pack_patch": None}],
        [
            {"tipo": "entradas", "pack_patch": None},
            {"tipo": "saidas", "pack_patch": None},
        ],
    )
    assert mode == "conflict"


def test_legacy_entradas_keys_do_not_remove_saidas():
    pack = {
        "totalCompras": 10,
        "nfsEntradas": 1,
        "cfopDados": [{"cfop": "1-102"}],
        "fornecedores": [{"nome": "A"}],
        "porUf": [{"uf": "SP"}],
        "entradasMeta": {"nfs": 1},
        "cfopSaidasTotal": 20,
        "nfsSaidas": 2,
        "cfopSaidas": [{"cfop": "5-102"}],
        "clientes": [{"nome": "B"}],
        "porUfSaidas": [{"uf": "RJ"}],
        "saidasMeta": {"nfs": 2},
        "hasMovimentacao": True,
    }
    out = apply_legacy_key_removal(pack, {"entradas"}, {"saidas"})
    assert "totalCompras" not in out
    assert "nfsEntradas" not in out
    assert "cfopDados" not in out
    assert "fornecedores" not in out
    assert "porUf" not in out
    assert "entradasMeta" not in out
    assert out["cfopSaidasTotal"] == 20
    assert out["nfsSaidas"] == 2
    assert out["cfopSaidas"] == [{"cfop": "5-102"}]
    assert out["clientes"] == [{"nome": "B"}]
    assert out["porUfSaidas"] == [{"uf": "RJ"}]
    assert out["saidasMeta"] == {"nfs": 2}
    assert out["hasMovimentacao"] is True


def test_replace_dre_keeps_movement_taxes_and_balancete():
    pack = {
        "totalCompras": 10,
        "cfopSaidasTotal": 20,
        "hasMovimentacao": True,
        "apuracao": {"icms": {"aRecolher": 3}},
        "hasBalancete": True,
        "balancete": {"contas": [{"codigo": "1"}]},
        "hasDre": True,
        "dre": {"linhas": [{"label": "Receita"}]},
        "receitaBruta": 30,
        "lucLiq": 4,
    }
    out = apply_legacy_key_removal(
        pack,
        {"dre"},
        {"entradas", "saidas", "icms", "balancete"},
    )
    assert out["totalCompras"] == 10
    assert out["cfopSaidasTotal"] == 20
    assert out["apuracao"]["icms"]["aRecolher"] == 3
    assert out["balancete"]["contas"] == [{"codigo": "1"}]
    assert "dre" not in out
    assert "receitaBruta" not in out


def test_replace_5005_removes_only_its_memory_and_icms_values():
    pack = {
        "memoriaCalculo": {"icmsARecolher": 10},
        "subvencao": 7,
        "apuracao": {
            "icms": {"aRecolher": 10},
            "subvencao": 7,
            "pis": {"aRecolher": 2},
            "cofins": {"aRecolher": 9},
        },
    }
    out = apply_legacy_key_removal(pack, {"apuracao_5005"}, {"pis_cofins"})
    assert "memoriaCalculo" not in out
    assert "subvencao" not in out
    assert "icms" not in out["apuracao"]
    assert "subvencao" not in out["apuracao"]
    assert out["apuracao"]["pis"]["aRecolher"] == 2
    assert out["apuracao"]["cofins"]["aRecolher"] == 9


def test_replacement_types_group_only_valid_items():
    items = [
        {
            "ok": True,
            "pack_patch": {"dre": {}},
            "company_id": "baifer",
            "competencia": "2026-07",
            "unidade": "matriz",
            "tipo": "dre",
        },
        {
            "ok": True,
            "pack_patch": {"balancete": {}},
            "company_id": "baifer",
            "competencia": "2026-07",
            "unidade": "matriz",
            "tipo": "balancete",
        },
        {
            "ok": False,
            "errors": ["inválido"],
            "pack_patch": {"apuracao": {}},
            "company_id": "baifer",
            "competencia": "2026-07",
            "tipo": "icms",
        },
    ]
    assert _replacement_types_by_slot(items) == {
        ("baifer", "2026-07", "matriz"): {"dre", "balancete"}
    }
