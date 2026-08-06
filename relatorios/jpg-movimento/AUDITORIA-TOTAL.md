# Auditoria total JPG — todas as filiais e abas

Gerado: 06/08/2026, 17:19:46
Overlay impostos aplicado nesta execução: **SIM**

## Resumo: OK 619 | FAIL 8 | WARN 10

## Por aba

| Aba | OK | FAIL | WARN |
|-----|----|------|------|
| sistema | 47 | 0 | 0 |
| compras | 105 | 0 | 0 |
| vendas | 85 | 3 | 0 |
| finalidade | 30 | 0 | 0 |
| impostos | 121 | 5 | 8 |
| dre | 168 | 0 | 0 |
| recebimentos | 49 | 0 | 0 |
| visao-geral | 7 | 0 | 0 |
| memoria | 7 | 0 | 0 |
| balancete | 0 | 0 | 1 |
| indicadores | 0 | 0 | 1 |

## FAILs

- **impostos** `2026-01-SP-impostos-kpi`: kpi ICMS c/d=28445.49/0 plan=28445.49/0; IPI e/s=7952.47/49371.61 plan=7952.47/49371.61
- **impostos** `2026-02-SP-impostos-kpi`: kpi ICMS c/d=5229.2/0 plan=5229.2/0; IPI e/s=18694.71/80155.32 plan=18694.71/80155.32
- **impostos** `2026-03-SP-impostos-kpi`: kpi ICMS c/d=4428.14/0 plan=4428.14/0; IPI e/s=15830.58/88738.29 plan=15830.58/88738.29
- **impostos** `2026-04-SP-impostos-kpi`: kpi ICMS c/d=2283.11/0 plan=2283.11/0; IPI e/s=0/0 plan=0/0
- **impostos** `2026-05-SP-impostos-kpi`: kpi ICMS c/d=905.02/20811.75 plan=905.02/20811.75; IPI e/s=18544.51/62610.88 plan=18544.51/62610.88
- **vendas** `2026-05-LANNIC-cfop-s`: 0 ≠ 50901.51
- **vendas** `2026-06-LANNIC-cfop-s`: 0 ≠ 82874.55
- **vendas** `2026-07-LANNIC-cfop-s`: 0 ≠ 560212.54

## WARNs / pendências

- **impostos** `2026-01-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-02-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-03-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-04-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-05-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-06-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **impostos** `2026-07-LANNIC-tax`: LANNIC fora da planilha grupo ICMS/IPI
- **balancete** `fonte`: Balancete contábil não enviado — aba pendente/estimada
- **indicadores** `fonte`: Indicadores derivados do movimento/DRE estimada
- **impostos** `pis-cofins-st`: PIS/COFINS/ICMS ST zerados (não vêm na planilha grupo)
