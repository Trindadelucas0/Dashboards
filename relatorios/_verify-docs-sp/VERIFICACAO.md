# Verificação Documents → JPG SP

Gerado: 2026-08-06T18:46:29.058Z
Asserts: OK=19 FAIL=0
Conclusão: TODOS JÁ NO SISTEMA (patch=false)

## Entradas.xls
- Status: **JA_NO_SISTEMA**
- Empresa: 82 - JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS | CNPJ 21051983000750
- Período: 01/06/2026 até 30/06/2026 | aba Entradas
- Total Geral: 112749.13 | Δ=0 | NFs=128 | linhas=128
- Por mês: {"2026-06":112749.13}
- Onde: relatorios/jpg-movimento/raw/sp-jun-entradas.json | src/views/jpg.ejs → filiais.SP (meses 2026-06)
- Prod raw: sp-jun-entradas → match={"path":"c:\\Users\\trind\\Desktop\\Dashboards\\relatorios\\jpg-movimento\\raw\\sp-jun-entradas.json","totalGeral":112749.13,"lineCount":128,"sum":112749.13,"matchTg":true,"matchLines":true,"matchSum":true}

## Saídas (2).xls
- Status: **JA_NO_SISTEMA**
- Empresa: 82 - JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS | CNPJ 21051983000750
- Período: 01/06/2026 até 30/06/2026 | aba Saídas
- Total Geral: 810686.49 | Δ=0 | NFs=188 | linhas=188
- Por mês: {"2026-06":810686.49}
- Onde: relatorios/jpg-movimento/raw/sp-jun-saidas.json | src/views/jpg.ejs → filiais.SP (meses 2026-06)
- Prod raw: sp-jun-saidas → match={"path":"c:\\Users\\trind\\Desktop\\Dashboards\\relatorios\\jpg-movimento\\raw\\sp-jun-saidas.json","totalGeral":810686.49,"lineCount":188,"sum":810686.49,"matchTg":true,"matchLines":true,"matchSum":true}

## Saídas.xls jan a junho.xls
- Status: **JA_NO_SISTEMA**
- Empresa: 82 - JPG - PRODUTOS FUNCIONAIS E NUTRICIONAIS | CNPJ 21051983000750
- Período: 01/01/2026 até 31/05/2026 | aba Saídas
- Total Geral: 2487219.1 | Δ=0 | NFs=479 | linhas=479
- Por mês: {"2026-02":538694.5,"2026-03":584827.43,"2026-04":595601.23,"2026-01":337216.1,"2026-05":430879.84}
- Onde: relatorios/jpg-movimento/raw/sp-janmai-saidas.json | src/views/jpg.ejs → filiais.SP (meses 2026-01,2026-02,2026-03,2026-04,2026-05)
- Prod raw: sp-janmai-saidas → match={"path":"c:\\Users\\trind\\Desktop\\Dashboards\\relatorios\\jpg-movimento\\raw\\sp-janmai-saidas.json","totalGeral":2487219.1,"lineCount":479,"sum":2487219.1,"matchTg":true,"matchLines":true,"matchSum":true}

## Pendências
- Entradas SP Jan–Mai não estão nestes 3 arquivos (sistema continua com compras=0 nesses meses).
- Jul SP no EJS veio de outra entrega; estes XLS não cobrem jul.