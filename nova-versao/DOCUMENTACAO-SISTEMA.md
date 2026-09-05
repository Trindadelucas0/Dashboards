# Dashboards Êxito (nova-versao) — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 2.4.8 — Recebimentos tela completa |
| Última atualização | 05/09/2026 (aba Recebimentos/Pagamentos: 8 KPIs do mês + acumulado/MoM + 2 gráficos + tabela) |
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
| 2.4.8 | Recebimentos tela completa | Aba **Recebimentos/Pagamentos**: 8 KPIs do mês (receb./pag./saldo/% compras/vendas, NFs, ticket, cobertura) + 4 KPIs de acumulado/MoM; gráficos barras Rec×Pag e doughnut do mês; tabela evolução mensal; série com `nfsEntradas`/`nfsSaidas` e lacunas; continua estimativa NF-e (não é caixa) |
| 2.4.7 | Balancete EXITO Única | Arquivos `Balancete MM-2026…UNICA.xls` (CNPJ 36517206000130) → tipo `balancete`, `pack.hasBalancete` + `pack.balancete` (kind `exito`); competências 2026-02…05; totais Ativo/Passivo/Resultado = Saldo Atual das contas 1/2/3; aba **Balancete** via `BalanceteTree` / `build_balancete_por_mes` |
| 2.4.6 | DRE Análise Vertical | Planilha EXITO `Análise Vertical do D. R. E.xls` (meses `MM/YYYY` nas colunas) → tipo `dre_vertical`, uma part `dre` por competência preenchida; empresa herdada do dashboard se sem CNPJ; jan/2026 sem lucro operacional na planilha → `lucLiq` null (não inventa) |
| 2.4.5 | Caveat ST aba UF | Aba `ST` da planilha padrão = tabela UF/VALOR (sem linha “a recolher”/crédito). O parser grava a **soma das UFs** em `apurado` e `aRecolher` (`fonte: st_mensal`). Isso **bate com a planilha**, mas **não prova** o valor pago/guia. Fonte oficial de ST a recolher: demonstrativo EXITO **SUBTRI** (`substituicao tributaria a recolher`) ou guia. Não inventar outro número sem esse arquivo. |
| 2.4.4 | Workbook parcial + Serviços | Aceita planilha padrão **parcial** (ENTRADAS/SAÍDAS + ≥3 abas fiscais, mesmo sem DRE/BAL); Finalidade com painel **Serviços Tomados**; Recebimentos com aviso/gaps; ST por UF no card Impostos/Memória |
| 2.4.3 | Export vendas/finalidade | PDF e Excel do relatório geral de vendas e da finalidade de compras; Excel CPF×CNPJ (resumo, clientes, linhas NF); KPIs CPF/CNPJ na aba Vendas |
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

Esqueleto completo (preferido):

`DRE` · `BALANCETE` · `ICMS 5005-2012` · `PIS COFINS` · `IRPJ` · `CSLL` · `ST` · `DIFAL` · `IPI`

Opcionais (movimento do mês, no mesmo arquivo):

`ENTRADAS` · `SAÍDAS` — sinônimos aceitos: `ENTRADA`, `SAIDA`, `SAIDAS`, `SAÍDA` (comparação sem acento e sem caixa).

**Workbook parcial:** se o arquivo tiver **ENTRADAS e/ou SAÍDAS** e **pelo menos 3** abas fiscais do modelo (ex.: sem DRE/BALANCETE), ainda é tratado como `workbook_padrao` — extrai movimento + impostos presentes e avisa as abas faltantes. Não inventa DRE/Balancete.

- Nome do arquivo **não** define empresa nem tipo; detecção pelo conjunto de abas.
- Empresa: CNPJ do cabeçalho das abas de movimento ou dashboard aberto.
- `MMYYYY` no nome do arquivo ancora impostos, DRE e Balancete.
- Competência das abas de movimento: `Período:` do cabeçalho da própria aba.
- Abas vazias ou CNPJ divergente (IRPJ/CSLL): **aviso**, não erro — Gravar continua.
- Arquivo só com parte das abas fiscais **e sem movimento**: aviso de incompleto no fluxo legado (lê a primeira aba).

### Mapa aba da planilha → aba do dashboard

| Aba planilha | Pack | Aba UI |
|--------------|------|--------|
| DRE | `dre`, `receitaBruta`, `cmv`, `lucBruto`, `lucLiq`, `margMb`, `margMl` | DRE, Visão Geral (RB), Indicadores |
| BALANCETE | `balancete` | Balancete |
| ENTRADAS | `totalCompras`, `fornecedores`, `cfopDados`, `porUf`, `nfsEntradas`, linhas NF | **Compras**, Finalidade, Visão Geral, **Recebimentos** (pagamentos) |
| SAÍDAS | `cfopSaidasTotal`, `receitaBruta`, `clientes`, `clientesTop10`, `cfopSaidas`, `porUfSaidas`, `nfsSaidas`, `vendasPorDoc`, linhas NF | **Vendas**, Visão Geral, **Recebimentos** (recebimentos) |
| ICMS 5005-2012 | `memoriaCalculo`, `apuracao.icms`, `apuracao.subvencao` | **Memória**, KPI ICMS |
| PIS COFINS | `apuracao.pis`, `apuracao.cofins`, `memoriaPisCofins` | **Memória**, Impostos |
| ST | `apuracao.icmsSt`, `porUfSt` (`fonte: st_mensal`) | **Memória**, Impostos — ver caveat §3.3 (soma UF ≠ necessariamente guia paga) |
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

### 3.2.3 Exportação (Vendas e Finalidade)

Números só do pack / `NfeLine` do mês (e unidade) selecionados no dashboard. Sem inventar.

| Relatório | Onde | Arquivos | Conteúdo |
|-----------|------|----------|----------|
| Geral de vendas | Aba **Vendas** | PDF + Excel | Resumo (total, NFs, ticket, CPF/CNPJ) + UF + CFOP + ranking de clientes |
| Finalidade de compras | Aba **Finalidade** | PDF + Excel | Macro (Revenda / Ativo / Devol / **Serviços** / Outros) + painel Serviços Tomados + CFOP + Excel de fornecedores. |
| Vendas CPF × CNPJ | Aba **Vendas** | Excel detalhado | Aba Resumo (% e R$) + Clientes + Linhas NF (nota, série, doc, tipo, nome, UF, CFOP, valor) |

Classificação do documento: só dígitos; **11 = CPF**, **14 = CNPJ**, qualquer outro = `outros`. Percentual = valor do tipo / total de vendas do slice; sem vendas → `—`.

Endpoint autenticado: `GET /api/companies/{id}/months/{competencia}/nfe-lines?unidade=&tipo=saidas` (ou `tipo=entradas`). Ownership via `require_company`. Usado pelo Excel CPF/CNPJ.

### 3.2.4 Recebimentos / Pagamentos (layout)

Estimativa **NF-e**, não financeiro real: recebimentos = `cfopSaidasTotal` (saídas); pagamentos = `totalCompras` (entradas). Sem extrato/caixa/contas a receber.

| Bloco | O que mostra |
|-------|----------------|
| 8 KPIs do mês | Recebimentos; Pagamentos; Saldo (receb − pag); Compras/Vendas %; NFs saída; NFs entrada; Ticket médio (receb / NFs saída); Cobertura V/C (receb / pag) |
| 4 KPIs secundários | Receb. acumulados; Pag. acumulados; Saldo acumulado (soma só dos meses com valor na série); Δ Receb. vs mês anterior (MoM %; `—` no 1º mês ou no chip de trimestre) |
| Gráficos | Barras Rec × Pag (série anual, lacuna se sem movimento); doughnut composição do mês |
| Tabela | Mês · Rec · Pag · Saldo · Comp./Vend. · NFs s/e; linha do mês atual destacada |

Slice: `_slice("recebimentos")` devolve `saldo`, `ticketMedio`, `comprasSobreVendasPct`, `cobertura`, nfs. Série: `vendas`, `compras`, `nfsEntradas`, `nfsSaidas`, `competencias`. Sem movimento no mês → aviso + KPIs `—` (não inventa zero).

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
| 2026-07 | 2.119.642,66 (238 NFs) | 2.440.744,56 | 67.908,41 | 170.102,60 | **81.871,70** (soma aba ST; ver caveat) |

Julho em **dois arquivos** (mesmo nome, tamanhos diferentes):
- ~61 KB — 9 abas fiscais, **sem** ENTRADAS/SAÍDAS → só impostos / memória.
- ~370 KB — ENTRADAS/SAÍDAS + impostos, **sem** DRE/BALANCETE → workbook **parcial** (movimento + impostos). Goldens movimento: Entradas 2.119.642,66 (238 NFs, Δ0); Saídas 2.440.744,56. PIS 3.699,88 / COFINS 17.041,86 (débito − crédito).

Importar **os dois** (ou o parcial + o de 9 abas) sem “substituir mês” para merge.

**Caveat ICMS ST (jul/2026 e aba `ST` em geral):**
- Dump aba ST (iguais nos dois arquivos): BA **342,70** · DF **48.663,84** · GO **17.114,14** · MG **15.751,02** → soma **81.871,70**. Sem linha TOTAL; sem coluna de crédito.
- O dashboard/`pack.apuracao.icmsSt` **bate** com essa soma (`apurado` = `aRecolher` porque o parser não encontra “a recolher” separado).
- Contador Única: o cliente **não paga** esse valor — a aba é resumo por UF, não guia. **Não alterar** o parser para inventar outro `aRecolher` sem demonstrativo.
- DRE `(-) SUBSTITUIÇÃO TRIBUTÁRIA` no arquivo ~61 KB está só na coluna **JANEIRO** (−81,99) — **não** é ST de julho.
- ICMS 5005 / PIS do mesmo workbook **não** trazem ST a recolher. Não há arquivo `Demonst. SUBTRI` / `Apuração icms st` nos Downloads para a Única.
- Fonte oficial de ST **a recolher**: planilha EXITO SUBTRI (label `substituicao tributaria a recolher`, como no Baifer) ou valor da guia paga informado pelo contador.
- `% s/ vendas: —` em jul no Postgres: pack sem `cfopSaidasTotal`/`receitaBruta` (movimento do ~370 KB ainda não mergeado). Reimportar o parcial **sem** “substituir mês”. Não é bug de cálculo do % quando há vendas.

DRE/Balancete da planilha padrão Única: nos workbooks `Planilha Padrão…` **só a coluna JANEIRO** está preenchida (valores de exemplo do modelo) — fev–jul saem como `vazia`. Para DRE real multi-mês, usar **Análise Vertical do D. R. E.** (ver §3.4). Para Balancete real, usar os arquivos EXITO mensais (ver §3.5).

## 3.4 DRE Análise Vertical (EXITO — Única)

Arquivo típico: `Análise Vertical do D. R. E.xls` (sem CNPJ no corpo).

| Item | Comportamento |
|------|----------------|
| Detecção | Cabeçalho com colunas `MM/YYYY` + linha `RECEITA BRUTA`, ou nome/aba “Análise Vertical… D.R.E.” |
| Tipo pipeline | `dre_vertical` → preview/commit expande em várias parts `dre` (uma por competência) |
| Competências | Cada coluna mensal preenchida vira um `FiscalMonth` (ex.: 2026-01 … 2026-06). Coluna `TOTAL` e colunas `%` são ignoradas. |
| Empresa | Sem CNPJ → herda do dashboard aberto (`unica`). Importar com login/dashboard Única. |
| Pack | `hasDre`, `dre` (kind `analise_vertical`), `receitaBruta`, `cmv`, `lucBruto`, `lucLiq`, margens |
| Abas UI | **DRE**, Visão Geral (RB), Indicadores (quando houver RB/lucros) |
| Lucro líquido | Linha `= LUCRO OU PREJUÍZO OPERACIONAL`. Célula vazia → `lucLiq`/`margMl` null (não inventa). |

Golden (conferido na planilha; fixture `fixtures/unica-padrao/Analise Vertical do D. R. E.xls`):

| Competência | Receita bruta | CMV | Lucro bruto | Lucro op. |
|-------------|---------------|-----|-------------|-----------|
| 2026-01 | 1.853.772,30 | −1.339.730,37 | 51.413,73 | *(vazio na planilha)* |
| 2026-02 | 1.748.060,74 | −1.226.219,37 | 96.889,05 | −39.122,77 |
| 2026-03 | 2.070.208,14 | −1.438.197,35 | 139.913,54 | 20.137,44 |
| 2026-04 | 1.968.049,95 | −1.406.098,81 | 45.680,25 | −150,87 |
| 2026-05 | 1.983.869,76 | −1.467.938,90 | −404,02 | −139.638,01 |
| 2026-06 | 2.209.566,53 | −1.628.944,73 | 36.100,22 | −66.034,82 |

Julho/2026 e meses seguintes: enviar nova Análise Vertical (ou DRE mensal EXITO) quando disponível. Não usa `RANGE_ERROR` — multi-mês é o formato nativo deste relatório.

## 3.5 Balancete EXITO mensal (Única)

Arquivos típicos: `Balancete 02-2026 - UNICA.xls`, `Balancete 03-2026-UNICA.xls`, `Balancete 04-2026 - UNICA.xls`, `Balancete 05-2026- UNICA.xls` (um arquivo = uma competência; variação de hífen/espaço no nome é irrelevante — CNPJ + `Período:` no cabeçalho mandam).

| Item | Comportamento |
|------|----------------|
| Detecção | Aba/título Balancete + colunas Código / Classificação / Descrição / Saldo Anterior / Débito / Crédito / Saldo Atual |
| Tipo pipeline | `balancete` → `pack.hasBalancete` + `pack.balancete` (kind `exito`, contas + totais) |
| Empresa | CNPJ `36.517.206/0001-30` → `unica` (login `unica`) |
| Competência | Cabeçalho `Período: 01/MM/YYYY - …` → `YYYY-MM` |
| Totais | `totais.ativo` / `passivo` / `resultado` = **Saldo Atual** das contas Classificação `1` / `2` / `3` (não inventar) |
| Abas UI | **Balancete** (`BalanceteTree` + chips multi-mês via `build_balancete_por_mes`); Indicadores patrimoniais deixam de ser N/D quando houver BP |

Golden (conferido na planilha; fixtures `fixtures/unica-padrao/Balancete *-UNICA.xls`):

| Competência | Contas | Ativo (1) | Passivo (2) | Resultado (3) |
|-------------|--------|-----------|-------------|----------------|
| 2026-02 | 118 | 17.725.883,14 | −19.158.242,06 | 1.432.358,92 |
| 2026-03 | 133 | 18.894.008,23 | −20.513.069,63 | 1.619.061,40 |
| 2026-04 | 129 | 19.012.297,41 | −20.631.509,68 | 1.619.212,27 |
| 2026-05 | 135 | 18.320.007,45 | −20.078.857,73 | 1.758.850,28 |

Identidade: Ativo + Passivo + Resultado ≈ 0 (saldos com sinal EXITO). Débitos = créditos no nível 1. Janeiro/2026 e jun+/2026: enviar Balancete EXITO do mês quando disponível. Não usar a coluna BALANCETE da planilha padrão (só janeiro modelo).

## 4. Onde olhar no código

| Fluxo | Arquivo |
|-------|---------|
| Detecção + extração workbook | `backend/app/extract/parse_workbook_padrao.py` |
| Classificação tipo (Entradas / por fornecedor) | `backend/app/extract/classify.py` → `detect_sheet_tipo` |
| Parser 5005 | `backend/app/extract/parse_memoria_5005.py` |
| Parser PIS/COFINS/IPI/IRPJ | `backend/app/extract/parse_impostos.py` |
| Parser movimento | `backend/app/extract/parse_movimento.py` |
| Parser DRE / Análise Vertical | `backend/app/extract/parse_dre.py` (`extract_dre_vertical`, `parse_dre_padrao_column`) |
| Parser Balancete EXITO / padrão | `backend/app/extract/parse_balancete.py` |
| Pipeline | `backend/app/extract/pipeline.py` |
| Preview/commit | `backend/app/routers/imports.py` (`expand_workbook_parts` também expande `dre_vertical`) |
| Fatia por aba UI | `backend/app/routers/companies.py` → `_slice`, `_is_empty`, `build_dre_por_mes`, `build_balancete_por_mes` |
| CFOP / Finalidade / Serviços | `backend/app/extract/cfop.py` (`CFOP_INFO`, `aggregate_macro`, `aggregate_servicos`) |
| Linhas NF (export) | `GET .../nfe-lines` em `backend/app/routers/companies.py`; classificação `tipo_doc` / `vendas_por_doc` em `backend/app/extract/aggregate.py` |
| Export PDF/Excel | `frontend/lib/exportLibs.ts`, `vendasExport.ts`, `finalidadeExport.ts`, `cpfCnpjExport.ts`, `supplierExport.ts` |
| UI Memória | `frontend/components/MemoriaLivro.tsx` |
| UI DRE | `frontend/components/DreStatement.tsx` |
| UI Balancete | `frontend/components/BalanceteTree.tsx` |
| UI abas (Impostos / Indicadores / Recebimentos) | `frontend/app/dashboard/[empresa]/[aba]/page.tsx` |
| Estilos dashboard | `frontend/app/dashboard.css` |
| UI import | `frontend/components/ImportTab.tsx` |
| Catálogo de empresas | `backend/app/companies.py`, `backend/scripts/seed.py` |
| Testes golden | `backend/tests/test_workbook_padrao.py`, `backend/tests/test_unica_padrao.py`, `backend/tests/test_unica_dre_vertical.py`, `backend/tests/test_unica_balancete.py`, `backend/tests/test_cfop.py`, `backend/tests/test_slice_contract.py`, `backend/tests/test_baifer_entradas.py`, `backend/tests/test_baifer_balancete.py`, `backend/tests/test_loja_balancete.py` |
| Fixtures | `fixtures/baifer-padrao/`, `fixtures/unica-padrao/`, `fixtures/egaplast-padrao/`, `fixtures/loja-maquinas-padrao/` |

## 5. Regras de negócio

1. Não inventar imposto — aba vazia omite chave no pack e a seção some na Memória.
2. Próximo mês = novo `FiscalMonth`; merge só dentro do mesmo mês/competência.
3. Planilha padrão nunca bloqueia por CNPJ ausente no arquivo.
4. IRPJ/CSLL só grava se CNPJ da aba = empresa do dashboard.
5. Movimento (Entradas/Saídas, avulso ou dentro do workbook): valor vem de **Valor Contábil**, nunca da coluna `Valor` (ICMS). Sem essa coluna, a aba não é gravada.
6. Memória não calcula imposto: só exibe o livro importado.
7. DRE/Balancete da planilha padrão só gravam a coluna do mês do próprio arquivo (`MMYYYY`); coluna vazia = nada gravado. Exceção: **Análise Vertical** grava uma part por coluna `MM/YYYY` preenchida.
8. `Total Geral` só é aceito se houver número na coluna de valor da própria linha — nunca aproveitar número de outra coluna (Isentas/Outras/Base).
9. PIS/COFINS gravam o resultado do mês (`débito − crédito`); saldo credor acumulado fica informativo.
10. Percentuais na UI (Impostos `% s/ vendas`, Memória `% s/ RB` = max(aRecolher,0)/RB, DRE margens) só com numerador e denominador no pack; caso contrário `—` / `N/D` / “Em apuração”.
11. Balancete multi-mês: coluna Total da grade = soma dos saldos mensais exibidos (layout wireframe); não interpreta patrimônio consolidado.
12. Documento de cliente/fornecedor: 11 dígitos = CPF, 14 = CNPJ; demais = outros. Exportações de vendas/finalidade/CPF×CNPJ usam só pack e `NfeLine` da competência/unidade atuais.
13. Workbook parcial (movimento + ≥3 abas fiscais) é `workbook_padrao`; abas DRE/BAL ausentes geram aviso, não inventário.
14. CFOPs de serviço (1-933/2-933 ISSQN; 1-353/2-353 transporte; faixa SINIEF `.300` comunicação) entram no macro `servicos` e no painel `servicosTomados` da Finalidade.
15. DRE Análise Vertical sem CNPJ herda a empresa do dashboard (como 5005/ST); não inventa `lucLiq` se a linha de resultado operacional estiver vazia.
16. Balancete EXITO mensal (Única e demais): totais Ativo/Passivo/Resultado vêm do Saldo Atual das contas `1`/`2`/`3`; um arquivo = uma competência.
17. Recebimentos/Pagamentos é estimativa NF-e (saídas × entradas), não caixa. KPIs de % e ticket ficam `—` sem denominador; série deixa lacuna nos meses sem `hasMovimentacao`.

## 6. Pendências de dados (Única)

| Pendência | Impacto | O que o cliente precisa enviar |
|-----------|---------|-------------------------------|
| DRE real jan–jun/2026 | Coberto por `Análise Vertical do D. R. E.xls` (§3.4) — importar no dashboard Única | Já disponível; gravação pelo usuário na aba Importar |
| Balancete real fev–mai/2026 | Coberto por `Balancete MM-2026…UNICA.xls` (§3.5) — importar no dashboard Única | Já disponível; gravação pelo usuário na aba Importar |
| DRE jul/2026+ e Balancete jan/jun+/2026 | DRE jul e Balancete fora de fev–mai ausentes nestes arquivos | Nova Análise Vertical / Balancete EXITO do mês |
| Planilha padrão: DRE/BAL só JANEIRO (modelo) | Não usar esses números de exemplo se a Análise Vertical já foi gravada | Preferir Análise Vertical para DRE |
| Julho em dois arquivos | Importar o ~61 KB (impostos) **e** o ~370 KB (movimento parcial) | Ideal: um único `.xlsx` com 9 abas + ENTRADAS + SAÍDAS |
| Aba `SAIDA` de abril sem a coluna `Valor Contábil` | Vendas de abril vazias (a coluna `Valor` da aba é ICMS: R$ 243.233,52, não faturamento) | Reexportar abril com a coluna `Valor Contábil` |
| CST / vencimento não parseados | Colunas Vencimento na Memória ficam `—` | Parser CST/vencimento (fora do layout) |

**Import workbook:** o preview mantém `file_hash` **por aba** (`expand_workbook_parts`). Reimportar o mesmo `.xlsx` para completar parts ausentes não marca todas as abas como `duplicata` só porque uma part já foi gravada.

## 8. Como usar o sistema (guia do dia a dia)

1. Cadastrar empresa (nome + CNPJ) em **Nova empresa**.
2. Abrir dashboard → **Importar planilhas**.
3. Subir o `.xlsx` padrão (mesmo esqueleto todo mês). Se o arquivo já trouxer `ENTRADAS`/`SAÍDAS`, Compras e Vendas saem dele; senão, subir também o EXITO de Entradas **ou** o **Relatório de entrada por fornecedor**.
4. Conferir preview (ok / vazia / ignorada) → **Gravar**.
5. Selecionar mês no chip superior; conferir DRE, Balancete, **Memória** (livro linha a linha), Impostos, Compras, Vendas.

**Única — DRE Análise Vertical (jan–jun/2026):** login `unica` → Importar → selecionar `Análise Vertical do D. R. E.xls` → preview deve listar **6** linhas `dre` (2026-01 … 2026-06) com `ok` → **Gravar** (sem “substituir mês” se o mês já tiver movimento/impostos) → conferir aba **DRE** em cada chip de mês. Em jan/2026 a planilha não traz lucro operacional → KPI de lucro líquido / ML fica N/D.

**Única — Balancete EXITO (fev–mai/2026):** login `unica` → Importar → selecionar os quatro `Balancete *UNICA.xls` de uma vez (ou um por um) → preview: cada linha `balancete` / competência `2026-02`…`2026-05` / `ok`, sem errors → **Gravar** (sem “substituir mês” se o mês já tiver movimento/impostos/DRE) → aba **Balancete**: chips de mês com Ativo/Passivo/Resultado iguais à tabela §3.5. Pode misturar no mesmo lote com a Análise Vertical e os workbooks padrão.

**Única — meses 01 a 07/2026 (workbook):** login `unica` → Importar → selecionar os arquivos `Planilha Padrão DASBORADS - UNICA MM2026.xlsx` (pode subir vários meses de uma vez) → conferir no preview: `entradas` com Δ 0,00, `saidas` com aviso de Total Geral, `dre`/`balancete` como `vazia` fora de janeiro (use a Análise Vertical para DRE real), `IRPJ`/`CSLL` como `ignorada` → **Gravar** (sem "substituir mês", para permitir merge) → conferir **Compras**, **Vendas**, **Impostos** e **Memória** em cada mês.

**Única — julho 2026 (reimport):** subir **os dois** arquivos de Downloads (fiscais ~61 KB + movimento parcial ~370 KB). Preview do parcial deve listar `entradas`/`saidas` ok + impostos; aviso de workbook parcial sem DRE/BAL. Depois de gravar: **Recebimentos** com ~2,44M / 2,12M; **Impostos** PIS 3.699,88 e COFINS 17.041,86 (se o banco ainda tiver acumulado errado, reimporte o mês). **Finalidade** mostra o bloco Serviços Tomados (CFOPs 1-933 / 2-933 / 2-353 etc.).

**Recebimentos:** estimativa NF-e (não é caixa). Aba completa: 8 KPIs do mês + acumulado/MoM + barras Rec×Pag + doughnut + tabela mensal. Mês sem movimento → aviso e KPIs `—`; série deixa lacuna (null) nos meses sem `hasMovimentacao`.

**Finalidade — Serviços Tomados:** após os KPIs/gráficos gerais, painel com total de serviços, ISSQN, transporte e comunicação; empty state se não houver CFOP de serviço. Macro doughnut inclui fatia **Serviços** (separada de Outros).

**Memória / Impostos — ST:** quando houver `porUfSt`, o card ICMS ST lista o detalhe por UF (BA, DF, GO, MG…). Na planilha padrão a aba `ST` é só UF/VALOR: o sistema mostra a soma como Importado/Apurado. Se o contador disser que **não é o valor pago**, pedir **Demonst. SUBTRI** / guia — não “corrigir” o número na mão.

**Memória:** depois de gravar a planilha padrão, abra **Memória de Cálculo**. No topo: cards detalhados + **Resumo Consolidado**; abaixo, **Ver livro técnico** abre 5005 / PIS/COFINS / ST etc.

**Impostos:** KPIs no topo mostram vendas, total de impostos e **% sobre vendas**; cada card de tributo repete `% s/ vendas` quando há aRecolher e faturamento.

**Balancete / DRE / Indicadores:** use o chip de mês do header. No **Balancete**, os chips dentro do card destacam a coluna do mês; Expandir/Recolher controla a árvore; busca e filtro de grupo restringem as contas. Indicadores patrimoniais ficam N/D sem Balancete.

**Vendas — exportar:** com o mês importado aberto, use **Exportar PDF** ou **Exportar Excel** (resumo + UF + CFOP + clientes). **Excel CPF/CNPJ detalhado** gera três abas (Resumo %, Clientes, Linhas NF). Os cards **Vendas CPF** e **Vendas CNPJ** mostram R$ e %; sem vendas no mês ficam `—`.

**Finalidade — exportar:** **Exportar PDF** / **Exportar Excel** do quadro macro e da lista completa de CFOPs (o Excel inclui fornecedores por CFOP). O botão **Por Fornecedor** segue gerando o relatório filtrado no modal.

**Baifer — entradas ago/2026:** login `baifer` → dashboard Baifer → Importar → `Relatorio de entrada por fornecedor 082026 BAIFER.xls` → preview `entradas` / `2026-08` / Δ 0 → Gravar → aba **Compras** total R$ 377.506,76.

Login seed: `admin`, `baifer`, `egaplast`, `loja-maquinas`, `unica` (senhas no `.env`).
