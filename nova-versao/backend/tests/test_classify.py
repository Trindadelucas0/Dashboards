from app.extract.classify import (
    competencia_from_filename,
    detect_sheet_tipo,
    format_cfop,
    is_balancete_filename,
    is_dre_filename,
    is_multi_month_movimento,
    resolve_company,
    scan_cnpj,
    scan_period,
)
from app.extract.parse_movimento import parse_movimento, _header_map
from app.extract.workbook import WorkbookGrid


def test_format_cfop_variants():
    assert format_cfop("2-102") == "2-102"
    assert format_cfop("2.102") == "2-102"
    assert format_cfop("2102") == "2-102"
    assert format_cfop("", 2102) == "2-102"


def test_competencia_from_filename():
    assert competencia_from_filename("Relatorio 072026.xls") == "2026-07"
    assert competencia_from_filename("RESULTADO FEV.xls") == "2026-02"
    assert competencia_from_filename("resultadojaneiro.xls") == "2026-01"
    assert competencia_from_filename("Demostrativo IRPJ e CSLL 1º Trimestre de 2026.xls") == "2026-03"
    assert competencia_from_filename("Demonst. CSOC 03-2026 (1 T)") == "2026-03"


def test_detect_sheet_tipo_ignores_misleading_filename():
    grid = WorkbookGrid("x.xls", "Saídas", [["Total Cliente"]], "html")
    assert detect_sheet_tipo(grid, "Entradas por Cliente 072026.xls") == "saidas"


def test_detect_entrada_por_fornecedor_filename_and_acompanhamento():
    by_name = WorkbookGrid(
        "Relatorio de entrada por fornecedor 082026 BAIFER.xls",
        "Plan1",
        [["ACOMPANHAMENTO DE ENTRADAS"], ["Total Fornecedor"]],
        "html",
    )
    assert detect_sheet_tipo(by_name, "Relatorio de entrada por fornecedor 082026 BAIFER.xls") == "entradas"
    by_head = WorkbookGrid("qualquer.xls", "Plan1", [["ACOMPANHAMENTO DE ENTRADAS"]], "html")
    assert detect_sheet_tipo(by_head, "qualquer.xls") == "entradas"


def test_detect_demonstrativo_icms():
    grid = WorkbookGrid(
        "Apuração icms 062026.xls",
        "Demonst. ICMS 06-2026 (M)",
        [["EGAPLAST"], ["DEMONSTRATIVO DO ICMS"]],
        "html",
    )
    assert detect_sheet_tipo(grid, "Apuração icms 062026.xls") == "icms"
    assert detect_sheet_tipo(grid, "qualquer.xls") == "icms"


def test_detect_pis_cofins_by_sheet_not_filename():
    pis = WorkbookGrid(
        "Apuração pis e cofins 012026.xls",
        "Demonstrativo de Apuração - PIS",
        [["DEMONSTRATIVO DA APURAÇÃO DO PIS"]],
        "html",
    )
    cof = WorkbookGrid(
        "Apuração pis e cofins 012026.xls",
        "Demonstrativo de Apuração - COF",
        [["DEMONSTRATIVO DA APURAÇÃO DO COFINS"]],
        "html",
    )
    assert detect_sheet_tipo(pis, "Apuração pis e cofins 012026.xls") == "pis"
    assert detect_sheet_tipo(cof, "Apuração pis e cofins 012026.xls") == "cofins"


def test_resolve_catalog_companies():
    company, unit = resolve_company("03185564000134", "EGAPLAST ARTEFATOS", "Entradas.xls")
    assert company and company.id == "egaplast"
    assert unit == "matriz"
    company, unit = resolve_company("03185564000134", "EGAPLAST", "Entradas filial 61.xls")
    assert company and company.id == "egaplast"
    assert unit == "filial"
    company, unit = resolve_company("52005382000140", "BAIFER DISTRIBUIDORA", "Entradas 01-2026.xls")
    assert company and company.id == "baifer"
    assert unit == "matriz"
    company, unit = resolve_company("36517206000130", "UNICA COMERCIO ATACADISTA DE TINTAS", "x.xls")
    assert company and company.id == "unica"
    assert unit == "matriz"



def test_header_map_prefers_valor_contabil_over_icms_valor():
    row = [""] * 33
    row[0] = "Código"
    row[1] = "Data Emissão"
    row[4] = "Nota"
    row[5] = "Série"
    row[11] = "Cliente"
    row[15] = "CNPJ/CPF"
    row[17] = "CFOP"
    row[21] = "UF"
    row[22] = "Valor Contábil"
    row[25] = "Tipo"
    row[28] = "Valor"
    mapping = _header_map(row)
    assert mapping is not None
    assert mapping["valor"] == 22
    assert mapping["nota"] == 4


def test_header_map_entrada_por_fornecedor_keeps_first_codigo_and_valor_contabil():
    row = [
        "Código",
        "Data Emissão",
        "Data Entrada",
        "Nota",
        "Série",
        "Espécie",
        "Código",
        "Fornecedor",
        "CNPJ/CPF/CEI/CAEPF",
        "Insc. Est.",
        "CFOP",
        "AC.",
        "UF",
        "Valor Contábil",
        "Tipo",
        "Base Cálculo",
        "Alíq.",
        "Valor",
        "IPI",
    ]
    mapping = _header_map(row)
    assert mapping is not None
    assert mapping["codigo"] == 0
    assert mapping["nome"] == 7
    assert mapping["valor"] == 13
    assert mapping["nota"] == 3


def test_saidas_uses_valor_contabil_not_zero_icms():
    header = [""] * 33
    header[0] = "Código"
    header[4] = "Nota"
    header[5] = "Série"
    header[11] = "Cliente"
    header[15] = "CNPJ/CPF"
    header[17] = "CFOP"
    header[21] = "UF"
    header[22] = "Valor Contábil"
    header[28] = "Valor"
    detail = [""] * 33
    detail[0] = "6807"
    detail[4] = "4655"
    detail[5] = "1"
    detail[11] = "CLIENTE TESTE"
    detail[15] = "28446993000149"
    detail[17] = "6102"
    detail[21] = "GO"
    detail[22] = "2400"
    detail[28] = "0"
    total = [""] * 33
    total[0] = "Total Geral"
    total[22] = "2400"
    grid = WorkbookGrid("mg.xls", "Saídas", [header, detail, total], "html")
    mov = parse_movimento(grid, "saidas")
    assert len(mov.lines) == 1
    assert mov.lines[0].valor == 2400
    assert mov.total_geral == 2400


def test_range_filename_is_multi_month():
    grid = WorkbookGrid("x.xls", "Saídas", [["01/05/2026 até 31/05/2026"]], "html")
    assert is_multi_month_movimento(grid, "Saídas.xls jan a junho.xls") is True
    assert is_multi_month_movimento(grid, "Entradas.xls jan a maio.xls") is True
    assert is_multi_month_movimento(grid, "entradas a jan a jun.xls") is True


def test_single_month_header_is_not_range():
    grid = WorkbookGrid("x.xls", "Saídas", [["Período 01/05/2026 até 31/05/2026"]], "html")
    assert is_multi_month_movimento(grid, "Saídas 052026.xls") is False


def test_header_span_multiple_months():
    grid = WorkbookGrid("x.xls", "Entradas", [["01/01/2026 até 30/06/2026"]], "html")
    assert is_multi_month_movimento(grid, "Entradas.xls") is True


def test_scan_cnpj_ignores_unlabeled_digits():
    grid = WorkbookGrid("dre.xls", "Sheet1", [["Custo da Mercadoria Vendida", "05726073430819"]], "html")
    assert scan_cnpj(grid) == ""


def test_scan_cnpj_formatted_and_labeled():
    grid = WorkbookGrid(
        "x.xls",
        "Entradas",
        [["UNICA"], ["CNPJ:", "36.517.206/0001-30"]],
        "html",
    )
    assert scan_cnpj(grid) == "36517206000130"
    grid2 = WorkbookGrid("x.xls", "IRPJ", [["CNPJ:", "00598375000103"]], "html")
    assert scan_cnpj(grid2) == "00598375000103"


def test_scan_period_competencia_label():
    grid = WorkbookGrid("x.xls", "IRPJ", [["Competência:", "01/03/2026"]], "html")
    assert scan_period(grid)[0] == "2026-03"


def test_is_dre_filename_compact():
    assert is_dre_filename("D. R. E..xls") is True
    assert is_dre_filename("D. R. E. 01-2026.xls") is True
    assert is_dre_filename("dre.xls") is True
    assert is_dre_filename("Entradas 01-2026.xls") is False


def test_is_balancete_filename():
    assert is_balancete_filename("Balancete.xls") is True
    assert is_balancete_filename("Balancete 01-2026.xls") is True
    assert is_balancete_filename("D. R. E..xls") is False


def test_detect_balancete_exito():
    grid = WorkbookGrid(
        "Balancete.xls",
        "Balancete",
        [
            ["Empresa:", "BAIFER DISTRIBUIDORA DE FERRAMENTAS LTDA"],
            ["C.N.P.J.:", "52.005.382/0001-40"],
            ["Período:", "01/01/2026 - 31/01/2026"],
            [""],
            ["BALANCETE"],
        ],
        "html",
    )
    assert detect_sheet_tipo(grid, "Balancete.xls") == "balancete"
    assert scan_period(grid)[0] == "2026-01"


def test_detect_dre_exito_spaced_name_and_header():
    grid = WorkbookGrid(
        "D. R. E..xls",
        "D. R. E.",
        [
            ["Empresa:", "BAIFER DISTRIBUIDORA DE FERRAMENTAS LTDA"],
            ["C.N.P.J.:", "52.005.382/0001-40"],
            ["Insc. Junta Comercial:  Data: 30/08/2023"],
            [""],
            ["DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM 31/01/2026"],
        ],
        "html",
    )
    assert detect_sheet_tipo(grid, "D. R. E..xls") == "dre"
    assert scan_period(grid)[0] == "2026-01"
