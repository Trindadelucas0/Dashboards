# Dashboards Êxito (nova-versao) — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 2.4.2 — Balancete: layout wireframe fiel (KPIs + árvore) |
| Última atualização | 04/09/2026 (Balancete alinhado ao layout de referência: KPIs com natureza, toolbar e árvore D/C) |
| Fonte oficial | Este arquivo |

## 1. Como usar este documento

Mapa de fluxos, regras de importação e onde olhar no código para o dashboard Next.js + FastAPI + Postgres em `nova-versao/`.

## 2. Tecnologias utilizadas

- Frontend: Next.js (:3000)
- API: FastAPI (:8001)
- Banco: PostgreSQL
- Importação: planilha padrão `.xlsx` (9 abas fiscais + ENTRADAS/SAÍDAS) e planilhas EXITO `.xls` legadas

### 2.1 Histórico de versões

| Versão | Nome | Mudança |
|--------|------|---------|
| 2.4.2 | Balancete layout fiel | Título + banner; KPIs Ativo/Passivo/Resultado/analíticas com ícones e natureza; card Verificação com chips+busca+Expandir/Recolher; árvore com pasta, faixa lateral e badges D/C |
| 2.4.1 | Memória layout fiel | Cards por tributo com linhas zebradas + badge de status; Resumo Consolidado com pills % s/ RB e TOTAL ICMS+ST; livro técnico em accordion |
| 2.4.0 | Layouts wireframe | Memória (cards + resumo), DRE (KPIs MB/MO/ML/Carga), Indicadores (A–D), Balancete árvore multi-mês; Impostos com KPI % s/ vendas |
| 2.3.0 | Planilha padrão v2 | Abas ENTRADAS/SAÍDAS no mesmo workbook; DRE/Balancete só na coluna do mês do arquivo; PIS/COFINS = débito − crédito; empresa Única |
| 2.2.0 | Memória detalhada | Aba Memória mostra o livro da planilha (5005, PIS/COFINS, ST/DIFAL, IPI, IRPJ/CSLL) |
| 2.1.1 | Entradas por fornecedor | `Relatorio de entrada por fornecedor MMYYYY.xls` → tipo `entradas` (Compras / Finalidade) |
| 2.1.0 | Planilha padrão | Workbook 9 abas → DRE, Balancete, impostos, memória 5005 |
| 2.0.x | EXITO mensal | Entradas/Saídas/demonstrativos separados |

## 3. Planilha padrão (import principal)

### Esqueleto oficial (9 abas fiscais + ENTRADAS + SAÍDAS)

Obrigatórias (sem as 9 o arquivo **não** é reconhecido como planilha padrão):

`DRE` · `BALANCETE` · `ICMS 5005-2012` · `PIS COFINS` · `IRPJ` · `CSLL` · `ST` · `DIFAL` · `IPI`

Opcionais (movimento do mês, no mesmo arquivo):

`ENTRADAS` · `SAÍDAS` — sinônimos aceitos: `ENTRADA`, `SAIDA`, `SAIDAS`, `SAÍDA` (comparação sem acento e sem caixa).

- Nome do arquivo **não** define empresa nem tipo; detecção pelo conjunto de abas.
- Empresa: CNPJ do cabeçalho das abas de movimento ou dashboard aberto.
- `MMYYYY` no nome do arquivo ancora impostos, DRE e Balancete.
- Competência das abas de movimento: `Período:` do cabeçalho da própria aba.
- Abas vazias ou CNPJ divergente (IRPJ/CSLL): **aviso**, não erro — Gravar continua.
- Arquivo com parte das 9 abas (ex.: sem DRE/BALANCETE): cai no fluxo legado, lê **só a primeira aba** e avisa quais abas faltam.

### Mapa aba da planilha → aba do dashboard

| Aba planilha | Pack | Aba UI |
|--------------|------|--------|
| DRE | `dre`, `receitaBruta`, `cmv`, `lucBruto`, `lucLiq`, `margMb`, `margMl` | DRE, Visão Geral (RB), Indicadores |
| BALANCETE | `balancete` | Balancete |
| ENTRADAS | `totalCompras`, `fornecedores`, `cfopDados`, `porUf`, `nfsEntradas`, linhas NF | **Compras**, Finalidade, Visão Geral |
| SAÍDAS | `cfopSaidasTotal`, `receitaBruta`, `clientes`, `clientesTop10`, `cfopSaidas`, `porUfSaidas`, `nfsSaidas`, linhas NF | **Vendas**, Visão Geral |
| ICMS 5005-2012 | `memoriaCalculo`, `apuracao.icms`, `apuracao.subvencao` | **Memória**, KPI ICMS |
| PIS COFINS | `apuracao.pis`, `apuracao.cofins`, `memoriaPisCofins` | **Memória**, Impostos |
| ST | `apuracao.icmsSt`, `porUfSt` | **Memória**, Impostos |
| DIFAL | `apuracao.difal` se houver valor | **Memória**, Impostos |
| IPI | `apuracao.ipi` se houver valor | **Memória**, Impostos |
| IRPJ / CSLL | `apuracao.irpj` / `apuracao.csll` se CNPJ conferir | **Memória**, Impostos |

Sem as abas de movimento no workbook, Compras/Vendas/Finalidade continuam vindo das planilhas EXITO `Entradas`/`Saídas` (fluxo legado). O relatório **entrada por fornecedor** conta como Entradas.

### Regras de gravação (planilha padrão)

| Situação | Comportamento |
|----------|----------------|
| DRE/Balancete: coluna do mês do arquivo **com** valores | Part `ok`, grava |
| DRE/Balancete: coluna do mês do arquivo **vazia** | Part `vazia` + aviso, **não grava** (nunca puxa outro mês do modelo) |
| Movimento: `Total Geral` sem valor na coluna Valor Contábil | Part `ok` com **aviso**; conferência pela soma das linhas |
| Movimento: Δ soma × Total Geral ≥ 0,02 | **Erro** na part; não grava |
| Movimento: aba sem coluna `Valor Contábil` | Part `vazia` + aviso; **não grava** (a coluna `Valor` é imposto, não faturamento) |
| PIS/COFINS: coluna A RECOLHER do RESUMO ≠ débito − crédito | Grava `débito − crédito` e guarda o valor da planilha em `aRecolherPlanilha` + aviso |

### 3.1 Relatório de entrada por fornecedor (EXITO)

Mesmo movimento de `Entradas MM-YYYY.xls`, agrupado por fornecedor (linhas `Total Fornecedor` são ignoradas). Não é um tipo novo.

| Campo | Destino |
|-------|---------|
| Tipo | `entradas` |
| Empresa | CNPJ do cabeçalho (Baifer `52005382000140`) |
| Competência | `Período:` do cabeçalho ou `MMYYYY` no nome (`082026` → `2026-08`) |
| Pack | `totalCompras`, `fornecedores`, `cfopDados`, `porUf`, `nfsEntradas`, linhas NF |
| Abas UI | **Compras**, **Visão Geral** (KPI compras), **Finalidade** (CFOP) |

Não importar este arquivo **e** um `Entradas` do mesmo mês: o gravar substitui o movimento, não soma.

Golden Baifer ago/2026: Total Geral **377.506,76**, Δ 0, 211 NFs. Fixture: `fixtures/baifer-padrao/Relatorio de entrada por fornecedor 08-2026.xls`.

### 3.2 Memória de Cálculo (livro)

A aba **Memória** é o livro da planilha, não um resumo inventado. O **primeiro viewport** segue o layout de referência (cards densos + Resumo Consolidado); o detalhe linha a linha fica no accordion **Ver livro técnico**.

| Leitor | O que vê |
|--------|----------|
| Cliente | Grade de **cards detalhados** por tributo (header colorido, linhas zebradas label\|valor, badge Zero recolher / Saldo credor / Em apuração / A recolher) + bloco **Resumo Consolidado — {mês}** (Tributo · Vencimento · Apurado bruto · Créditos/Benef. · A recolher · % s/ RB com pills) + linha TOTAL (ICMS + ICMS ST) |
| Contador | Accordion com cada linha da aba correspondente (5005, PIS/COFINS, ST/DIFAL, IPI, IRPJ/CSLL) |

Regras de exibição:

- Vencimento e CST **omitidos** (`—`) quando não existem no pack — a UI não inventa.
- IRPJ/CSLL sem demonstrativo no mês → card **Em apuração** (linhas com `—` + faixa verde).
- `% s/ RB` = max(aRecolher, 0) / `receitaBruta` do pack (carga a recolher); sem RB → `—`.
- Ordem do resumo: ICMS 5005 → ICMS ST → PIS → COFINS → IRPJ → CSLL → TOTAL.

Fórmulas gravadas no pack (não calculadas na UI):

- ICMS 5005: `Total 5005 + Total fora = ICMS a recolher`
- PIS/COFINS: `a recolher = débito − crédito` (resultado do mês). A coluna `SALDO CREDOR` da planilha é o crédito **acumulado** de meses anteriores; o valor da planilha fica em `aRecolherPlanilha`, só como referência, para não somar o mesmo crédito em todos os meses.
- IPI: `a recolher = débito − crédito − saldo credor`

Pack: `memoriaCalculo` (5005 + `linhas` + `formulaIcms`), `memoriaPisCofins`, `memoriaIpi`, `memoriaIrpj`, `memoriaCsll`, `porUfSt`, `porUfDifal`.

Seção omitida quando a aba veio vazia ou IRPJ/CSLL com CNPJ de outra empresa. Pack antigo (só KPIs) continua mostrando o que existir; para o livro completo, **reimportar** a planilha padrão.

Golden Baifer jan/2026: ICMS a recolher **−1.901,28**, subvenção **45.070,99**, PIS **−2.030,42**, COFINS **−9.352,23** (planilha: −18.080,71 / −83.280,93 com o saldo credor acumulado), ST DF **474,62**.

### 3.2.1 Impostos (UI)

Topo da aba: KPIs **Vendas do mês**, **Total impostos**, **Total impostos / Vendas %**, **Carga tributária**.

- Base de vendas: `receitaBruta` ou `cfopSaidasTotal` do pack (o que vier no slice).
- Total impostos: `deducoes` do pack; se ausente, soma dos `aRecolher` presentes na apuração.
- `% s/ vendas` por tributo nos cards = `aRecolher / vendas × 100`. Sem vendas ou sem aRecolher → `—` (nunca `0%` inventado).

### 3.2.2 DRE / Indicadores / Balancete (layout)

| Aba | Layout |
|-----|--------|
| **DRE** | KPIs MB / MO / ML / Carga % do mês selecionado + tabela multi-mês (CMV Pendente, deduções em vermelho). MO só se a DRE tiver linha de lucro/resultado operacional. |
| **Indicadores** | A Margens · B Carga · C Patrimoniais **N/D** sem Balancete (banner) · D gráfico deduções % / MB % / ML % |
| **Balancete** | Título + banner de competências; 4 KPIs (Ativo D / Passivo C / Resultado R / analíticas); card **Balancete de Verificação** com chips de mês + busca/filtro/Expandir·Recolher; árvore Conta×Descrição×meses com pasta/chevron, faixa lateral Ativo(verde)/Passivo·Resultado(roxo), coluna ativa com borda verde vertical, badges **D**/**C**; TOTAL = soma dos saldos mensais da grade (wireframe — não é patrimônio consolidado) |

Pendências de dado (Única): DRE/Balancete fev–jul vazios no arquivo → células `—`; CST/vencimento não parseados.
## 3.3 Empresas cadastradas

| Empresa | Login | CNPJ | Tema | Origem dos dados |
|---------|-------|------|------|------------------|
| Egaplast | `egaplast` | 03185564000134 | verde | EXITO legado |
| Baifer | `baifer` | 52005382000140 | azul | Planilha padrão + EXITO |
| Loja das Máquinas | `loja-maquinas` | 13983066000190 | verde | EXITO legado |
| Única (UNICA COMERCIO ATACADISTA DE TINTAS) | `unica` | 36517206000130 | azul | Planilha padrão v2 (01–07/2026) |

Cadastro estático: `backend/app/companies.py` (+ `KEEP_USERNAMES`) e `backend/scripts/seed.py`.

### Única — competências 01–07/2026

| Competência | Entradas | Saídas | ICMS 5005 | Subvenção | ST |
|-------------|----------|--------|-----------|-----------|-----|
| 2026-01 | 1.790.105,13 (204 NFs) | 1.863.198,21 | 18.164,87 | 139.563,57 | 66.958,60 |
| 2026-02 | 1.549.056,05 (162 NFs) | 1.749.489,47 | 59.789,54 | 132.906,83 | 59.350,91 |
| 2026-03 | 2.337.179,25 (256 NFs) | 2.074.977,46 | 19.531,28 | 172.720,45 | 71.713,34 |
| 2026-04 | 1.898.660,87 (246 NFs) | **pendente** (aba sem Valor Contábil) | 65.810,31 | 36.488,51 | 71.751,12 |
| 2026-05 | 2.462.684,27 (241 NFs) | 2.062.864,56 | 28.183,76 | 155.318,04 | 71.907,31 |
| 2026-06 | 1.981.355,68 (230 NFs) | 2.270.697,73 | 73.486,07 | 161.882,23 | 81.007,00 |
| 2026-07 | 2.119.642,66 (238 NFs)* | 2.440.744,56* | 67.908,41 | 170.102,60 | 81.871,70 |

\* Julho veio em **dois arquivos**: um com as 9 abas (sem movimento) e outro com o movimento mas **sem DRE/BALANCETE** — este último não é reconhecido como planilha padrão. Enquanto o cliente não reenviar um arquivo único completo, julho entra só com os impostos.

DRE/Balancete da Única: nos arquivos entregues **só a coluna JANEIRO** está preenchida, e com os valores de exemplo do modelo — fev–jul saem como `vazia`. Ver §6.

## 4. Onde olhar no código

| Fluxo | Arquivo |
|-------|---------|
| Detecção + extração workbook | `backend/app/extract/parse_workbook_padrao.py` |
| Classificação tipo (Entradas / por fornecedor) | `backend/app/extract/classify.py` → `detect_sheet_tipo` |
| Parser 5005 | `backend/app/extract/parse_memoria_5005.py` |
| Parser PIS/COFINS/IPI/IRPJ | `backend/app/extract/parse_impostos.py` |
| Parser movimento | `backend/app/extract/parse_movimento.py` |
| Pipeline | `backend/app/extract/pipeline.py` |
| Preview/commit | `backend/app/routers/imports.py` |
| Fatia por aba UI | `backend/app/routers/companies.py` → `_slice`, `_is_empty`, `build_dre_por_mes`, `build_balancete_por_mes` |
| UI Memória | `frontend/components/MemoriaLivro.tsx` |
| UI DRE | `frontend/components/DreStatement.tsx` |
| UI Balancete | `frontend/components/BalanceteTree.tsx` |
| UI abas (Impostos / Indicadores) | `frontend/app/dashboard/[empresa]/[aba]/page.tsx` |
| Estilos dashboard | `frontend/app/dashboard.css` |
| UI import | `frontend/components/ImportTab.tsx` |
| Catálogo de empresas | `backend/app/companies.py`, `backend/scripts/seed.py` |
| Testes golden | `backend/tests/test_workbook_padrao.py`, `backend/tests/test_unica_padrao.py`, `backend/tests/test_baifer_entradas.py` |
| Fixtures | `fixtures/baifer-padrao/`, `fixtures/unica-padrao/`, `fixtures/egaplast-padrao/` |

## 5. Regras de negócio

1. Não inventar imposto — aba vazia omite chave no pack e a seção some na Memória.
2. Próximo mês = novo `FiscalMonth`; merge só dentro do mesmo mês/competência.
3. Planilha padrão nunca bloqueia por CNPJ ausente no arquivo.
4. IRPJ/CSLL só grava se CNPJ da aba = empresa do dashboard.
5. Movimento (Entradas/Saídas, avulso ou dentro do workbook): valor vem de **Valor Contábil**, nunca da coluna `Valor` (ICMS). Sem essa coluna, a aba não é gravada.
6. Memória não calcula imposto: só exibe o livro importado.
7. DRE/Balancete da planilha padrão só gravam a coluna do mês do próprio arquivo (`MMYYYY`); coluna vazia = nada gravado.
8. `Total Geral` só é aceito se houver número na coluna de valor da própria linha — nunca aproveitar número de outra coluna (Isentas/Outras/Base).
9. PIS/COFINS gravam o resultado do mês (`débito − crédito`); saldo credor acumulado fica informativo.
10. Percentuais na UI (Impostos `% s/ vendas`, Memória `% s/ RB` = max(aRecolher,0)/RB, DRE margens) só com numerador e denominador no pack; caso contrário `—` / `N/D` / “Em apuração”.
11. Balancete multi-mês: coluna Total da grade = soma dos saldos mensais exibidos (layout wireframe); não interpreta patrimônio consolidado.

## 6. Pendências de dados (Única)

| Pendência | Impacto | O que o cliente precisa enviar |
|-----------|---------|-------------------------------|
| DRE e BALANCETE só com a coluna JANEIRO preenchida (valores do modelo) | DRE, Balancete, Indicadores e margens vazios em fev–jul; janeiro, se gravado, traz os números de exemplo do modelo | Planilha com a coluna do mês correspondente preenchida com os dados da Única |
| Julho em dois arquivos incompletos | Julho sem Compras/Vendas | Um único `.xlsx` com as 9 abas + ENTRADAS + SAÍDAS |
| Aba `SAIDA` de abril sem a coluna `Valor Contábil` | Vendas de abril vazias (a coluna `Valor` da aba é ICMS: R$ 243.233,52, não faturamento) | Reexportar abril com a coluna `Valor Contábil` |
| CST / vencimento não parseados | Colunas Vencimento na Memória ficam `—` | Parser CST/vencimento (fora do layout) |

**Import workbook:** o preview mantém `file_hash` **por aba** (`expand_workbook_parts`). Reimportar o mesmo `.xlsx` para completar parts ausentes não marca todas as abas como `duplicata` só porque uma part já foi gravada.

## 8. Como usar o sistema (guia do dia a dia)

1. Cadastrar empresa (nome + CNPJ) em **Nova empresa**.
2. Abrir dashboard → **Importar planilhas**.
3. Subir o `.xlsx` padrão (mesmo esqueleto todo mês). Se o arquivo já trouxer `ENTRADAS`/`SAÍDAS`, Compras e Vendas saem dele; senão, subir também o EXITO de Entradas **ou** o **Relatório de entrada por fornecedor**.
4. Conferir preview (ok / vazia / ignorada) → **Gravar**.
5. Selecionar mês no chip superior; conferir DRE, Balancete, **Memória** (livro linha a linha), Impostos, Compras, Vendas.

**Única — meses 01 a 07/2026:** login `unica` → Importar → selecionar os arquivos `Planilha Padrão DASBORADS - UNICA MM2026.xlsx` (pode subir vários meses de uma vez) → conferir no preview: `entradas` com Δ 0,00, `saidas` com aviso de Total Geral, `dre`/`balancete` como `vazia` fora de janeiro, `IRPJ`/`CSLL` como `ignorada` → **Gravar** (sem "substituir mês", para permitir merge) → conferir **Compras**, **Vendas**, **Impostos** e **Memória** em cada mês.

**Memória:** depois de gravar a planilha padrão, abra **Memória de Cálculo**. No topo: cards detalhados + **Resumo Consolidado**; abaixo, **Ver livro técnico** abre 5005 / PIS/COFINS / ST etc.

**Impostos:** KPIs no topo mostram vendas, total de impostos e **% sobre vendas**; cada card de tributo repete `% s/ vendas` quando há aRecolher e faturamento.

**Balancete / DRE / Indicadores:** use o chip de mês do header. No **Balancete**, os chips dentro do card destacam a coluna do mês; Expandir/Recolher controla a árvore; busca e filtro de grupo restringem as contas. Indicadores patrimoniais ficam N/D sem Balancete.

**Baifer — entradas ago/2026:** login `baifer` → dashboard Baifer → Importar → `Relatorio de entrada por fornecedor 082026 BAIFER.xls` → preview `entradas` / `2026-08` / Δ 0 → Gravar → aba **Compras** total R$ 377.506,76.

Login seed: `admin`, `baifer`, `egaplast`, `loja-maquinas`, `unica` (senhas no `.env`).
