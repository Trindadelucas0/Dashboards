from app.extract.cfop import cfop_meta, sinief_grupo, top_grupos
from app.extract.parse_impostos import apuracao_from_imposto_row, composicao_from_apuracao, parse_impostos_icms_ipi
from app.extract.workbook import WorkbookGrid
from app.routers.companies import _is_empty, _slice


def test_slice_visao_geral_from_apuracao():
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 1000,
        "cfopSaidasTotal": 2000,
        "receitaBruta": 2000,
        "nfsEntradas": 2,
        "nfsSaidas": 3,
        "apuracao": {
            "icms": {"apurado": 100, "aRecolher": 40, "pctRb": 2},
            "icmsSt": {"apurado": 10, "aRecolher": 10, "pctRb": 0.5},
            "pis": {"apurado": 0, "aRecolher": 12, "pctRb": 0},
            "cofins": {"apurado": 0, "aRecolher": 55, "pctRb": 0},
            "subvencao": 5,
        },
    }
    data = _slice("visao-geral", pack)
    assert data["receitaBruta"] == 2000
    assert data["cfopSaidasTotal"] == 2000
    assert data["saldoOperacional"] == 1000
    assert data["pisCofinsRecolher"] == 67
    assert data["icmsKpi"]["lbl"] == "ICMS a Recolher"
    assert data["icmsKpi"]["val"] == 40
    assert data["deducoes"] == 117.0
    assert data["dedPct"] == 5.85
    assert len(data["composicao"]) == 4
    assert data["apuracao"]["icms"]["aRecolher"] == 40


def test_slice_visao_geral_separates_rb_and_vendas():
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 500,
        "cfopSaidasTotal": 800,
        "receitaBruta": 1000,
        "nfsSaidas": 4,
        "apuracao": {
            "icms": {"apurado": 10, "aRecolher": -30},
            "pis": {"aRecolher": 0},
            "cofins": {"aRecolher": 0},
        },
    }
    data = _slice("visao-geral", pack)
    assert data["receitaBruta"] == 1000
    assert data["cfopSaidasTotal"] == 800
    assert data["saldoOperacional"] == 300
    assert data["icmsKpi"]["lbl"] == "Crédito ICMS"
    assert data["icmsKpi"]["val"] == 30
    assert data["icmsKpi"]["color"] == "green"


def test_slice_compras_cfop_and_concentracao():
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 100,
        "cfopDados": [
            {"cfop": "2-102", "total": 30, "qtd": 1},
            {"cfop": "2-152", "total": 70, "qtd": 2},
        ],
        "fornecedores": [
            {"nome": "TOP SA", "total": 80, "uf": "SC"},
            {"nome": "OUTRO", "total": 20, "uf": "PR"},
        ],
    }
    data = _slice("compras", pack)
    assert data["cfopDados"][0]["cfop"] == "2-152"
    assert len(data["cfopDados"]) == 2
    assert data["concentracaoTopFornecedor"] == 80.0


def test_slice_finalidade_top_grupos():
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 100,
        "cfopDados": [
            {"cfop": "2-152", "total": 70, "qtd": 2},
            {"cfop": "2-551", "total": 20, "qtd": 1},
            {"cfop": "2-102", "total": 10, "qtd": 1},
        ],
    }
    data = _slice("finalidade", pack)
    assert len(data["topGrupos"]) == 3
    assert "2.150" in data["topGrupos"][0]["grupo"]
    assert data["topGrupos"][0]["pct"] == 70.0
    assert data["macro"]
    assert data["servicosTomados"]["total"] == 0


def test_slice_finalidade_servicos_tomados():
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 200,
        "cfopDados": [
            {"cfop": "1-102", "total": 100, "qtd": 1},
            {"cfop": "1-933", "total": 70, "qtd": 3},
            {"cfop": "2-353", "total": 30, "qtd": 1},
        ],
    }
    data = _slice("finalidade", pack)
    st = data["servicosTomados"]
    assert st["total"] == 100
    assert st["qtd"] == 4
    assert st["pctCompras"] == 50.0
    macro = {m["key"]: m for m in data["macro"]}
    assert macro["servicos"]["total"] == 100
    assert any(c["finalidade"] == "Serviço ISSQN" for c in data["cfopDados"])


def test_slice_vendas_demais_clientes():
    pack = {
        "cfopSaidasTotal": 100,
        "receitaBruta": 120,
        "nfsSaidas": 4,
        "clientes": [
            {"nome": "A", "total": 40, "uf": "DF", "qtd": 1},
            {"nome": "B", "total": 30, "uf": "GO", "qtd": 1},
            {"nome": "C", "total": 30, "uf": "MG", "qtd": 1},
        ],
        "clientesTop10": [
            {"nome": "A", "total": 40, "uf": "DF", "qtd": 1},
            {"nome": "B", "total": 30, "uf": "GO", "qtd": 1},
        ],
        "demaisClientes": 30,
        "cfopSaidas": [],
    }
    data = _slice("vendas", pack)
    assert data["demaisClientes"] == 30
    assert len(data["clientesTop10"]) == 2
    assert data["receitaBruta"] == 120
    assert data["ticketMedio"] == 25.0


def test_slice_vendas_ticket_null_without_nfs():
    data = _slice("vendas", {"cfopSaidasTotal": 100, "nfsSaidas": 0, "cfopSaidas": []})
    assert data["ticketMedio"] is None
    assert data["receitaBruta"] == 100


def test_slice_recebimentos_kpis():
    pack = {
        "hasMovimentacao": True,
        "cfopSaidasTotal": 2270697.73,
        "totalCompras": 1981355.68,
        "nfsSaidas": 954,
        "nfsEntradas": 230,
    }
    data = _slice("recebimentos", pack)
    assert data["cfopSaidasTotal"] == 2270697.73
    assert data["totalCompras"] == 1981355.68
    assert data["saldo"] == round(2270697.73 - 1981355.68, 2)
    assert data["nfsSaidas"] == 954
    assert data["nfsEntradas"] == 230
    assert data["ticketMedio"] == round(2270697.73 / 954, 2)
    assert data["comprasSobreVendasPct"] == round(100 * 1981355.68 / 2270697.73, 2)
    assert data["cobertura"] == round(2270697.73 / 1981355.68, 2)
    assert data["hasMovimentacao"] is True


def test_slice_recebimentos_sem_vendas_nao_inventa_pct():
    data = _slice("recebimentos", {"hasMovimentacao": True, "totalCompras": 100, "nfsEntradas": 2})
    assert data["ticketMedio"] is None
    assert data["comprasSobreVendasPct"] is None
    assert data["cobertura"] == 0.0
    assert data["saldo"] == -100.0


def test_slice_recebimentos_sem_compras_cobertura_null():
    data = _slice(
        "recebimentos",
        {"hasMovimentacao": True, "cfopSaidasTotal": 200, "nfsSaidas": 4, "totalCompras": 0},
    )
    assert data["ticketMedio"] == 50.0
    assert data["cobertura"] is None
    assert data["comprasSobreVendasPct"] == 0.0


def test_slice_vendas_por_doc_from_clientes():
    pack = {
        "cfopSaidasTotal": 100,
        "nfsSaidas": 2,
        "clientes": [
            {"nome": "PF", "cnpj": "123.456.789-01", "total": 40, "qtd": 1, "uf": "DF"},
            {"nome": "PJ", "cnpj": "12.345.678/0001-99", "total": 60, "qtd": 1, "uf": "SP"},
        ],
        "cfopSaidas": [],
    }
    data = _slice("vendas", pack)
    assert data["clientes"][0]["tipoDoc"] == "cpf"
    assert data["clientes"][1]["tipoDoc"] == "cnpj"
    assert data["vendasPorDoc"]["cpf"]["total"] == 40.0
    assert data["vendasPorDoc"]["cpf"]["pct"] == 40.0
    assert data["vendasPorDoc"]["cnpj"]["pct"] == 60.0


def test_variacao_vendas_mom():
    from app.routers.companies import variacao_vendas_mom

    class M:
        def __init__(self, competencia, pack):
            self.competencia = competencia
            self.pack = pack

    months = [
        M("2026-01", {"cfopSaidasTotal": 100}),
        M("2026-02", {"cfopSaidasTotal": 150}),
    ]
    first = variacao_vendas_mom("2026-01", months)
    assert first["pct"] is None
    second = variacao_vendas_mom("2026-02", months)
    assert second["pct"] == 50.0
    assert second["label"] == "vs Jan"


def test_trimestre_meses_q1_and_q3():
    from app.routers.companies import _trimestre_meses, _trimestre_label

    assert _trimestre_meses("2026-01") == ["2026-01", "2026-02", "2026-03"]
    assert _trimestre_meses("2026-02") == ["2026-01", "2026-02", "2026-03"]
    assert _trimestre_meses("2026-07") == ["2026-07", "2026-08", "2026-09"]
    assert _trimestre_label("2026-01") == "1º Trimestre 2026"
    assert _trimestre_label("2026-07") == "3º Trimestre 2026"


def test_build_trimestre_totais_partial_and_dedpct():
    from app.routers.companies import build_trimestre_totais

    class M:
        def __init__(self, competencia, pack):
            self.competencia = competencia
            self.pack = pack

    months = [
        M(
            "2026-01",
            {
                "totalCompras": 100,
                "cfopSaidasTotal": 200,
                "receitaBruta": 200,
                "nfsEntradas": 1,
                "nfsSaidas": 2,
                "apuracao": {
                    "icms": {"aRecolher": 10},
                    "pis": {"aRecolher": 4},
                    "cofins": {"aRecolher": 6},
                    "icmsSt": {"aRecolher": 0},
                },
            },
        ),
        M(
            "2026-03",
            {
                "totalCompras": 50,
                "cfopSaidasTotal": 100,
                "receitaBruta": 100,
                "nfsEntradas": 1,
                "nfsSaidas": 1,
                "apuracao": {
                    "icms": {"aRecolher": 5},
                    "pis": {"aRecolher": 2},
                    "cofins": {"aRecolher": 3},
                    "icmsSt": {"aRecolher": 0},
                },
            },
        ),
    ]
    tri = build_trimestre_totais("2026-02", months)
    assert tri["id"] == "q1"
    assert tri["meses"] == ["2026-01", "2026-02", "2026-03"]
    assert tri["mesesPresentes"] == ["2026-01", "2026-03"]
    assert tri["completo"] is False
    assert "Fev" not in tri["mesesLabel"]
    assert tri["totais"]["totalCompras"] == 150
    assert tri["totais"]["cfopSaidasTotal"] == 300
    assert tri["totais"]["saldoOperacional"] == 150
    assert tri["totais"]["nfsEntradas"] == 2
    assert tri["totais"]["nfsSaidas"] == 3
    assert tri["totais"]["icmsARecolher"] == 15
    assert tri["totais"]["pisCofinsRecolher"] == 15
    # deducoes = icms+st+pis+cofins = 10+0+4+6 + 5+0+2+3 = 30
    assert tri["totais"]["deducoes"] == 30.0
    # dedPct sobre receita do trimestre (300), não média de % mensais
    assert tri["totais"]["dedPct"] == 10.0
    assert tri["totais"]["icmsKpi"]["lbl"] == "ICMS a Recolher"
    assert tri["totais"]["icmsKpi"]["val"] == 15


def test_aggregate_fiscal_packs_and_trimestre_key():
    from app.routers.companies import (
        aggregate_fiscal_packs,
        build_trimestre_totais,
        is_trimestre_key,
        _meses_from_trimestre_key,
    )

    assert is_trimestre_key("q1-2026") is True
    assert is_trimestre_key("2026-01") is False
    assert _meses_from_trimestre_key("q1-2026") == ["2026-01", "2026-02", "2026-03"]
    packs = [
        {"totalCompras": 100, "cfopSaidasTotal": 200, "receitaBruta": 200, "nfsEntradas": 1, "nfsSaidas": 2, "hasMovimentacao": True},
        {"totalCompras": 50, "cfopSaidasTotal": 80, "receitaBruta": 80, "nfsEntradas": 1, "nfsSaidas": 1, "hasMovimentacao": True},
    ]
    pack = aggregate_fiscal_packs(packs, "1º Trimestre 2026")
    assert pack["totalCompras"] == 150
    assert pack["cfopSaidasTotal"] == 280
    assert pack["isTrimestre"] is True
    assert pack["competenciaLabel"] == "1º Trimestre 2026"

    class M:
        def __init__(self, competencia, pack):
            self.competencia = competencia
            self.pack = pack

    tri = build_trimestre_totais("q1-2026", [M("2026-01", packs[0]), M("2026-02", packs[1])])
    assert tri["label"] == "1º Trimestre 2026"
    assert tri["totais"]["totalCompras"] == 150


def test_empty_tab_aware():
    class Row:
        pass

    row = Row()
    assert _is_empty("compras", {"hasMovimentacao": False}, row) is True
    assert _is_empty("dre", {"hasDre": True, "dre": {"linhas": []}}, row) is False
    assert _is_empty("impostos", {"apuracao": {"icms": {}}}, row) is False
    assert _is_empty("balancete", {}, row) is True
    assert _is_empty("balancete", {"hasBalancete": True, "balancete": {"contas": [{"codigo": "1"}]}}, row) is False


def test_slice_memoria_pis_cofins_e_receita():
    """Memória devolve apuração PIS/COFINS (incl. aRecolher 0) + receitaBruta para % s/ RB."""
    pack = {
        "hasMovimentacao": True,
        "totalCompras": 500,
        "cfopSaidasTotal": 2000,
        "receitaBruta": 2000,
        "apuracao": {
            "icms": {"apurado": 100, "aRecolher": 40, "credito": 60},
            "pis": {"apurado": 6568.32, "aRecolher": 0, "credito": 18080.71},
            "cofins": {"apurado": 30254.08, "aRecolher": 0, "credito": 83280.93},
        },
        "memoriaCalculo": {"icmsARecolher": 40, "debitoOriginal": 100},
        "memoriaPisCofins": {"resumo": {"pis": {"aRecolher": 0}}},
        "porUfSt": {"DF": 474.62},
    }
    data = _slice("memoria", pack)
    assert data["receitaBruta"] == 2000
    assert data["apuracao"]["pis"]["aRecolher"] == 0
    assert data["apuracao"]["pis"]["apurado"] == 6568.32
    assert data["apuracao"]["pis"]["credito"] == 18080.71
    assert data["apuracao"]["cofins"]["aRecolher"] == 0
    assert data["apuracao"]["cofins"]["apurado"] == 30254.08
    assert data["memoriaCalculo"]["icmsARecolher"] == 40
    assert data["memoriaPisCofins"]["resumo"]["pis"]["aRecolher"] == 0
    assert data["porUfSt"]["DF"] == 474.62
    assert "aRecolher" in data["apuracao"]["pis"]
    assert "aRecolher" in data["apuracao"]["cofins"]


def test_cfop_credito_flag():
    assert cfop_meta("2-102")["creditoPisCofins"] is True
    assert cfop_meta("1-202")["creditoPisCofins"] is False


def test_sinief_and_top_grupos():
    assert sinief_grupo("2-152").startswith("2.150")
    assert sinief_grupo("2-551").startswith("2.550")
    rows = [
        {"cfop": "2-152", "total": 90},
        {"cfop": "2-102", "total": 10},
    ]
    tops = top_grupos(rows, 4)
    assert len(tops) == 2
    assert tops[0]["pct"] == 90.0


def test_parse_impostos_jpg_headers():
    grid = WorkbookGrid(
        path="impostos.xlsx",
        sheet_name="Planilha4",
        kind="xlsx",
        rows=[
            ["Empresa", "Filial", "Mês", "ICMS Crédito", "ICMS Débito", "ICMS a Recolher", "IPI Crédito", "IPI Débito", "IPI a Recolher"],
            ["JPG", "Filial MG", "Julho", 0, 0, 0, 100, 500, 400],
        ],
    )
    parsed = parse_impostos_icms_ipi(grid)
    assert len(parsed["rows"]) == 1
    row = parsed["byCompetenciaUnidade"]["07|mg"]
    ap = apuracao_from_imposto_row(row, receita=1000)
    assert ap["ipi"]["aRecolher"] == 400
    assert composicao_from_apuracao(ap)[0]["label"] == "IPI"


def test_dre_por_mes_year_media_and_cmv_pendente():
    from app.routers.companies import (
        build_dre_por_mes,
        cmv_pendente,
        dre_media_acumulado,
        dre_period_label,
        year_from_period,
    )

    class M:
        def __init__(self, competencia, pack):
            self.competencia = competencia
            self.pack = pack

    assert year_from_period("2026-03") == "2026"
    assert year_from_period("q2-2026") == "2026"
    assert dre_media_acumulado([10, 20, None]) == {"media": 15.0, "acumulado": 30.0}
    assert dre_media_acumulado([None, None]) == {"media": None, "acumulado": None}
    assert dre_period_label(["2026-01", "2026-05"]) == "Jan a Mai / 2026"

    pack_ok = {
        "hasDre": True,
        "receitaBruta": 100,
        "cmv": -40,
        "lucBruto": 60,
        "lucLiq": 10,
        "dre": {
            "linhas": [
                {"descricao": "Receita Bruta", "valor": 100, "grupo": "receita"},
                {"descricao": "CMV", "valor": -40, "grupo": "cmv"},
            ],
            "source": "DRE.xls",
        },
    }
    pack_pending = {
        "hasDre": True,
        "receitaBruta": 100,
        "dre": {
            "linhas": [
                {"descricao": "Receita Bruta", "valor": 100, "grupo": "receita"},
                {"descricao": "CMV", "valor": None, "grupo": "cmv"},
            ],
        },
    }
    pack_zero = {
        "hasDre": True,
        "cmv": 0,
        "dre": {"linhas": [{"descricao": "CMV", "valor": 0, "grupo": "cmv"}]},
    }
    assert cmv_pendente(pack_ok) is False
    assert cmv_pendente(pack_pending) is True
    assert cmv_pendente(pack_zero) is False

    months = [
        M("2025-12", pack_ok),
        M("2026-01", pack_ok),
        M("2026-02", pack_pending),
        M("2026-03", {"hasMovimentacao": True}),
    ]
    por = build_dre_por_mes(months, "2026")
    assert [m["competencia"] for m in por] == ["2026-01", "2026-02"]
    assert por[0]["cmvPendente"] is False
    assert por[1]["cmvPendente"] is True
    assert por[0]["source"] == "DRE.xls"
    assert build_dre_por_mes(months, "2024") == []


def test_balancete_por_mes_year_filter():
    from app.routers.companies import build_balancete_por_mes

    class M:
        def __init__(self, competencia, pack):
            self.competencia = competencia
            self.pack = pack

    bal = {
        "kind": "padrao",
        "contas": [
            {"codigo": "1", "descricao": "ATIVO", "nivel": 1, "grupo": "ativo", "saldoAtual": 100},
            {"codigo": "1.1", "descricao": "Circulante", "nivel": 2, "grupo": "ativo", "saldoAtual": 40},
        ],
        "totais": {"ativo": 100, "passivo": None, "resultado": None, "contas": 2},
        "hasValores": True,
    }
    months = [
        M("2025-12", {"hasBalancete": True, "balancete": bal}),
        M("2026-01", {"hasBalancete": True, "balancete": bal}),
        M("2026-02", {"hasMovimentacao": True}),
        M("2026-03", {"hasBalancete": True, "balancete": {**bal, "contas": []}}),
    ]
    por = build_balancete_por_mes(months, "2026")
    assert [m["competencia"] for m in por] == ["2026-01"]
    assert por[0]["totais"]["ativo"] == 100
    assert por[0]["shortLabel"] == "Jan"
    assert build_balancete_por_mes(months, "2024") == []
