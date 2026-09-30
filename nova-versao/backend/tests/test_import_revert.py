from app.imports_revert import (
    apply_legacy_key_removal,
    deep_merge,
    rebuild_pack,
    slot_revert_mode,
)


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
