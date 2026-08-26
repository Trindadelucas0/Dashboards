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
