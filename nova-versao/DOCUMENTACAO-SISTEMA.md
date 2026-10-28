# Dashboards Êxito (nova-versao) — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 2.12.0 — gerenciamento de unidades e CNPJs |
| Última atualização | 28/10/2026 (cadastro e manejo administrativo de unidades com CNPJ próprio) |
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
| 2.12.0 | Gerenciamento de unidades e CNPJs | **Nova empresa** cadastra cada CNPJ adicional com nome próprio. O cabeçalho acompanha a unidade; **Todas as unidades** identifica o consolidado sem atribuir um CNPJ individual. Pelo menu de três pontos, somente administrador adiciona unidades e altera nome/CNPJ ou remove unidades vazias. Unidade com dados importados aceita renomear, mas bloqueia troca de CNPJ e exclusão; empresa principal fica protegida. APIs `POST/PATCH/DELETE /api/companies/{company_id}/units...` validam permissão, CNPJ e duplicidade. |
| 2.11.1 | Ações discretas no card da empresa | O seletor destaca **Acessar dashboard** como ação principal verde. Para administrador, **Excluir empresa** deixa de ocupar uma faixa permanente e passa ao menu de três pontos no canto superior do card; selecionar a ação mantém a confirmação em dois passos. O menu fecha ao clicar fora ou pressionar Esc. API e regra de exclusão permanecem inalteradas. |
| 2.11.0 | Exclusão completa de empresas | No seletor, somente o administrador vê **Excluir empresa**. O primeiro clique abre a confirmação no card; **Confirmar exclusão** remove, em uma transação, dados fiscais, planilhas e lançamentos bancários, meses, notas, CNPJs/unidades e vínculos de usuários. As contas permanecem. `DELETE /api/companies/{company_id}` exige administrador, registra um tombstone técnico sem dados empresariais e o seed não recria empresas fixas excluídas. |
| 2.10.8 | Schema garantido no startup da API | A API executa a criação idempotente das tabelas modeladas antes de atender requisições. Corrige o erro 500 de **Recebimentos/Pagamentos** em ambientes onde o deploy publicou as rotas de conciliação sem criar `bank_statement_imports` e `bank_transactions`; reinícios e próximos deploys passam a garantir o schema automaticamente. |
| 2.10.7 | Alias PIS E COFINS | A planilha padrão aceita as abas `PIS COFINS` e `PIS E COFINS` como o mesmo tributo. A variação com a conjunção passa a gerar a part `pis_cofins`, preencher a Memória e os cards de PIS/COFINS em Impostos sem alterar o ICMS do mês. |
| 2.10.6 | Recorte fiscal ICMS 5005 + ST | A planilha padrão parcial com somente `ICMS 5005-2012` e outra aba fiscal oficial (por exemplo `ST`) é tratada como um único workbook: cada tributo presente é extraído para a aba Impostos/Memória. O identificador fixo `5005-2012` não é mais confundido com a competência maio/2012. A competência real continua vindo de `MMYYYY` no nome do arquivo; se estiver ausente, a prévia bloqueia a gravação e pede correção do nome. |
| 2.10.5 | Substituição segura de importações | **“Substituir tipos enviados” não limpa mais o mês inteiro:** a API remove e marca como `replaced` somente os tipos presentes na nova prévia, preservando movimento, impostos, DRE e Balancete vindos de outras planilhas. As `NfeLine` também são removidas somente para os tipos substituídos. A interface explica a diferença entre **Gravar** (mesclar) e **Substituir tipos enviados**. Incidentes Baifer e Loja das Máquinas 07–09/2026 recompostos a partir do histórico de `pack_patch`, snapshots, fixtures validadas e metadados do banco; detalhes linha a linha só foram recriados quando havia fonte preservada. |
| 2.10.4 | Conciliação bancária | **DRE em árvore expansível:** a DRE comum organiza grupos, subtotais e contas detalhadas no mesmo padrão visual do Balancete. Grupos iniciam abertos, subtotais iniciam fechados, resultados permanecem visíveis e os botões **Expandir** / **Recolher** controlam toda a estrutura. Nome e chevron são clicáveis por mouse ou teclado. A hierarquia é derivada no frontend, inclusive para packs antigos sem `nivel`; API, banco, valores, KPIs e DRE Schumacher permanecem inalterados. |
| 2.10.3 | Conciliação bancária | **DRE EXITO detalhada:** o parser preserva o nível original (`total` / `detalhe`) de cada linha e a tabela comum mostra todas as linhas contábeis na ordem da planilha, inclusive Salários, INSS, FGTS, Energia, Água, Seguros, Honorários, Serviços de terceiros e o detalhamento do CMV. Subtotais ficam destacados e detalhes recuados. Packs antigos sem `nivel` usam a ordem e o último grupo reconhecido, sem exigir reimportação. KPIs, margens e DRE Schumacher inalterados. |
| 2.10.2 | Conciliação bancária | **Deploy:** o workflow `.github/workflows/deploy.yml` usa o runner exclusivo `exito-vps-Dashboards`, atualiza a instalação real em `/root/PROJETOS/exito/Dashboards` e executa `scripts/vps-root-deploy-nova.txt`. O script compila o frontend, reinicia `exito-dashboard` e `dashboards-nova-api`, executa as cargas documentadas da Schumacher e valida a saúde da API e da aplicação web. |
| 2.10.1 | Conciliação bancária | **Balancete comum** (`BalanceteTree`): mês mostra só a competência escolhida; trimestre mostra somente os Balancetes importados nos três meses civis; **Geral** mostra todas as competências importadas do ano consultado. TOTAL aparece apenas com mais de uma coluna e soma somente o recorte visível. KPIs usam o mês escolhido ou a última competência visível no trimestre/Geral. Mês ou trimestre sem Balancete mostra aviso e não reaproveita outra competência. Balanço Patrimonial Schumacher, API e packs inalterados. |
| 2.10.0 | Conciliação bancária | **Recebimentos/Pagamentos** deixa de ser estimativa por NF-e e passa a importar `.xlsx` bancário por empresa, unidade, banco e competência. Administrador valida e grava/substitui; viewers autorizados consultam. Persistência própria (`BankStatementImport`/`BankTransaction`), APIs `/api/bank-statements/*`, tela `BankReconciliation`, indicadores, Classificação Êxito, busca, datas e paginação. Só A:G é armazenado; Situação/Verificação/Observação são ignoradas. |
| 2.9.12 | Menu Indicadores Schumacher | Só na **Indústria Schumacher**, o link **Indicadores** sai da seção **Financeiro** (que fica só **Balanço Patrimonial** + **DRE**) e passa para a seção lateral **Indicadores** (`navSectionsForCompany` em `frontend/lib/nav.ts`; `layout-inner.tsx`). Rota `/dashboard/schumacher/indicadores`, API e `IndicadoresSchumacher` inalterados. Cabeçalho da aba: subtítulo “Resultado, liquidez e evolução — consolidado Matriz”. Demais empresas: Indicadores continua em Financeiro. |
| 2.9.11 | Ordem trimestres na barra | Barra `MesBar` (`page.tsx`, `quartersFromMonths`): grupos **1º–4º Trim** em ordem de calendário (ano, depois trimestre), não intercalando 2025/2026. Com meses de **dois anos** na barra, o chip do trimestre mostra o ano (**1º Trim 2025**); com um só ano, continua **1º Trim**. API e packs inalterados. |
| 2.9.10 | Indicadores card expandível | **Indicadores Schumacher:** clique no card (KPI) expande inline a tabela **Como calculamos** (`detalhe.passos[]`, mesma do modal). Um card aberto por vez; hint “Clique no card para ver o cálculo”. Botão **!** vermelho continua abrindo modal em tela cheia (`stopPropagation`). Teclado: Enter/Espaço no card alterna expandir. CSS `.ind-card-clickable`, `.ind-card-open`, `.ind-card-expand`. API inalterada. |
| 2.9.9 | Indicadores Schumacher evolução | Aba **Indicadores** (`IndicadoresSchumacher`): textos de **leitura** dos 10 cards alinhados ao glossário combinado (`_LEITURAS` em `indicadores_schumacher.py`; fórmulas e números inalterados). **C · Evolução:** gráfico de linha (`chart-card` + `Line`) com margem bruta %, margem líquida % e as quatro liquidez; eixo esquerdo em %, direito para índices; série = `porMes` do ano (Matriz). Os cards A/B seguem o mês ou trimestre do chip; o gráfico não vira um ponto de trimestre. Sem `porMes` → aviso “Sem meses com DRE ou Balanço neste ano.” Botão **!** e memória de cálculo intactos. Teste golden asserta `leitura`. |
| 2.9.8 | UI DRE e Vendas por produto | **DRE Schumacher** (`DreSchumacher`): grupos L1 com linha clicável, meta “N linhas · X% da RB” (mês do chip), filhas com % do grupo por coluna, **Soma do grupo**, busca com restauração ao limpar; coluna Conta fixa no scroll (`.dre-tbl-year`). **Vendas por produto** (`VendasProduto`): 4 KPIs + **Ver mais métricas**; top 8 com barra de participação; lista completa sempre visível (`#vp-lista`); coluna Part.; detalhe em grid; mobile só cards (≤1024px). Parser/API inalterados. |
| 2.9.7 | Árvore do Balanço Schumacher | Aba **Balanço Patrimonial** da Indústria Schumacher (`BalancoSchumacher`): grupos (ex. ATIVO CIRCULANTE) abrem com clique na linha inteira; fechado mostra quantidade de contas e % do total do lado (Ativo ou Passivo); aberto lista contas indentadas com % do grupo e linha **Soma do grupo** (= valor da linha no arquivo). Busca destaca o texto, abre só o caminho da conta e, ao limpar, restaura o que estava expandido. Expandir/Recolher vale para Ativo e Passivo. Parser/API/pack inalterados. |
| 2.9.6 | Indicadores Schumacher | Aba **Indicadores** na Indústria Schumacher (`indicadores` no menu Financeiro, após Balanço). Liquidez corrente/seca/imediata/geral do Balanço comparativo; faturamento, lucros, margens e **EBITDA** (= resultado operacional + depreciação/amortização do mês na DRE, excl. acumulada/apropriação). Cada card tem botão **!** com memória de cálculo (`detalhe.passos[]`). API `GET .../indicadores` inclui `indicadoresSchumacher` e `porMes`. Trimestre soma operandos monetários e recalcula ratios. Golden jan/2026: LC **≈1,58**; RB **65.256.171,15**; EBITDA **≈4.940.019,71**. UI `IndicadoresSchumacher.tsx`; demais empresas mantêm a tela genérica. |
| 2.9.5 | Margens Schumacher | Abas **Margens por mês** (`margens-mes`) e **Margens por cidade** (`margens-cidade`) na Indústria Schumacher; **Vendas por produto** passa para a seção **Vendas** do menu. Arquivos ODS com extensão `.xls` (`Demonstrativo de Margens de Venda(Mes)` e `(Cidade)`) viram `margem_mes` (parts por `YYYY-MM`, matriz) e `margem_cidade` (uma part em `2026-09`, acumulado Jan–Set/2026). Pack `margemMes` / `margemCidade`; margem **razão** (planilha ÷ 100). Leitor ODS em `workbook.py` (`content.xml`). Golden jan/2026 total **2.855.367,29**; soma cidades **51.139.507,94**. Script `import_schumacher_margem.py` faz merge e atualiza abas da empresa/viewers. |
| 2.9.4 | Cards na Memória Schumacher | Aba **Memória de Cálculo** da Indústria Schumacher (`MemoriaApuracao`) abre com os mesmos cards (`TaxDetailCard`) e **Resumo Consolidado** da Única. Linhas de cada card = campos do livro (débitos, outros débitos, saldo devedor, créditos, saldo anterior, outros créditos, saldo credor, a recolher, a transportar). IPI entra com os números do livro. ICMS ST, IRPJ e CSLL ficam **Em apuração**. Chip do card: a recolher > 0 → **A recolher**; a recolher ~ 0 e a transportar > 0 → **Saldo credor**. `% s/ RB` e vencimento ficam `—` (o pack do livro não tem `receitaBruta` nem guia). O livro por CFOP (Resumo / Entradas / Saídas / Conferência) abre em **Ver livro técnico**. Única, Baifer e JPG em `MemoriaLivro` não mudam. Impostos (`ApuracaoDashboard`) não muda. |
| 2.9.3 | DRE e Balanço Patrimonial Schumacher | Indústria Schumacher ganha abas **DRE** e **Balanço Patrimonial** (id `balancete`, rótulo só nesta empresa). Excel Comparativo jan–ago/2026 (CNPJ 04.589.817/0001-06, consolidado) vira 8 parts na Matriz (`dre.kind=schumacher_comparativo`, `balancete.kind=schumacher_bp`). DRE: KPIs em R$ + Conta × meses + coluna Acumulado Jan–Ago do arquivo. Balanço: duas colunas Ativo \| Passivo do mês; trimestre usa o último mês e uma faixa dos fins. Seletor de unidade some nessas abas. Única/Baifer continuam com `DreStatement` e `BalanceteTree`. Janeiro da DRE entra como no Excel (RB 65.256.171,15). |
| 2.9.2 | Cores pelo sinal na lista de produtos | Na aba **Vendas por produto**, colunas Total, Lucro líq. e Marg. líq. (tabela, TOTAL GERAL e card mobile) ficam verdes se o valor for positivo e vermelhas se for negativo. Zero, código, nome, quantidade e custo não mudam de cor. KPIs e Maiores vendas intactos. |
| 2.9.1 | Sem faixa de trimestre na Schumacher | Chip **1º Trim** / **2º Trim** da Indústria Schumacher não renderiza `TrimestreBlock` (Vendas/Compras/Saldo/ICMS do trimestre). Cabeçalho “· Soma …”, chips e cards do livro (`ApuracaoDashboard`) continuam. Única, Baifer, JPG, Egaplast e Loja das Máquinas mantêm a faixa. |
| 2.9.0 | Vendas por produto Schumacher | Aba **Vendas por produto** só na Indústria Schumacher (`vendas-produto`). Excel Matriz 01–08 + Filial 01–08 vira `venda_produto` (16 parts). Pack `vendaProduto` (margem como razão; tela × 100). Unidade `filial` = Schumacher Serviços, sem CNPJ. Todas/trimestre somam quantidade e dinheiro, recalculam margem e PMP ponderado pelo total. A Vendas de nota (`vendas`) de Única, Baifer, JPG, Egaplast e Loja das Máquinas **não muda**. |
| 2.8.0 | Livro fiscal Schumacher | Empresa **Indústria Schumacher** (login `schumacher`, CNPJ 04589817000106, abas Visão Geral, Impostos, Memória e Importar). Planilha com abas Resumo + ICMS_Entradas vira `livro_apuracao` (uma part por mês). Impostos e Memória usam o layout do livro **somente** quando o pack tem `livroApuracao`. Única, Baifer, JPG, Egaplast e Loja das Máquinas continuam com os 4 KPIs de vendas/% e `MemoriaLivro`. ICMS ST, IRPJ e CSLL ficam **Em apuração** (não entram no pack). |
| 2.7.1 | Confirmação de exclusão no card | Em **Planilhas importadas**, **Excluir** troca o botão do card pela confirmação (Cancelar / **Excluir planilha**) no próprio card, que rola para a vista. Antes a caixa ficava depois da lista inteira e o clique parecia não fazer nada. API e regra de exclusão não mudaram. |
| 2.7.0 | Excluir planilha | Aba **Importar** (admin) lista as planilhas `ok` da empresa e permite **Excluir**. A exclusão apaga o registro e os dados daquele arquivo no mês; o que veio de outro arquivo permanece. Com `pack_patch`, o mês é reconstruído. Import antigo sem patch: tipo repetido no mesmo mês responde 409 e não altera nada. |
| 2.6.10 | Planilha padrão qualquer empresa | O parser não depende de Baifer/Loja. Empresa nova (catálogo ou só Postgres) usa o mesmo modelo: `MMYYYY` no nome → competência; abas → mesmos campos; `company_id` do dashboard aberto. Guia §8 e teste `test_padrao_qualquer_empresa.py`. |
| 2.6.9 | ICMS simples | Aba `ICMS` (sem `ICMS 5005-2012`) grava só `apuracao.icms` (`fonte: planilha_padrao_icms`). PIS/COFINS: cabeçalho `AJUSTE` não vira `saldoCredor`; `SALDO CREDOR` continua saldo credor. Aviso de workbook parcial lista só as abas do esqueleto que faltam. DRE/Balancete seguem só a coluna do mês do arquivo. |
| 2.6.8 | Planilha padrão fiscal sem movimento | Arquivo com ≥3 abas fiscais do modelo é `workbook_padrao` mesmo sem ENTRADAS/SAÍDAS (ex. Baifer 08/2026). `MMYYYY` no nome ancora a competência; DRE/Balancete usam só a coluna desse mês (vazia não copia janeiro). ICMS a recolher só da linha homônima; PIS/COFINS `aRecolher` continua a coluna do RESUMO. |
| 2.6.7 | PIS/COFINS RESUMO | Planilha padrão aba PIS COFINS: `aRecolher` = coluna A RECOLHER do RESUMO (inclui saldo credor acumulado), como o IPI. Débito − crédito fica em `aRecolherCalculado` (linha **Resultado do mês**). Packs já gravados: script `_fix_pis_cofins_arecolher_remote.py`. |
| 2.6.6 | LANNIC movimento | Faixa de 4 KPIs (vendas/compras/saldo/ICMS do trimestre) só no chip **1º Trim** / **2º Trim** (`qN-YYYY`). Chip de mês não mostra mais “Total — trimestre”. DRE continua sem a faixa. |
| 2.6.5 | LANNIC movimento | Planilhas 144 Entradas/Saídas (`pasta temporaria/Nova pasta`) split mai–ago/2026 na unidade `lannic`; agosto faz merge com PGDAS (DAS 28.398,35). `receitaBruta` permanece a base 478.335,06; Compras/Vendas usam o Excel. Seed PGDAS não apaga NFs. |
| 2.6.4 | JPG IPI credor | Demonstrativo IPI EXITO: se saldo devedor = 0 e “saldo credor de IPI para o mês seguinte” > 0 → `apuracao.ipi.aRecolher` negativo (Asa Sul 08/2026: **−1.914,98**). Tabela ICMS/IPI igual. KPI **Crédito IPI** na Visão Geral quando não há ICMS. Dashboard **JPG** não mostra textos/empty-states de APURAÇÃO 5005 (Baifer/Única seguem com 5005). Reimportar IPI já gravado com 0. |
| 2.6.3 | JPG IRPJ/CSLL | Demonstrativo EXITO IRPJ+CSLL (2 abas CSOC + IRPJ-LP) na **Matriz Sede**: 1º tri em 03/2026 (IRPJ 143.211,70 / CSLL 74.476,66) e 2º tri em 06/2026 (IRPJ 137.737,02 / CSLL 77.617,99); merge no movimento; trimestre soma `irpj`/`csll` |
| 2.6.2 | LANNIC Simples | Memória PGDAS sem linha **Base memória** (receita 478.335,06 permanece no pack para KPIs) |
| 2.6.1 | LANNIC Simples | LANNIC 08/2026: saídas 557.733,52 − devoluções 79.398,46 = base 478.335,06; Memória sem RPA PGDAS nem diferença de bases |
| 2.6.0 | LANNIC Simples | Unidade JPG `lannic` (CNPJ 48285395000142, login continua `jpg`): pack 08/2026 Simples Nacional (PGDAS); DAS em `apuracao.das`; partilha só em `memoriaSimples`; sem NFs/DRE; cards Impostos/Memória de SN |
| 2.5.0 | JPG filiais | Empresa **JPG** no catálogo (login `jpg`, um card): unidades `sede` / `asa_sul` / `pr` / `sp` / `mg`; dropdown no header; consolidado **Todas as unidades** soma virtual (`aggregate_fiscal_packs`) sem gravar slot `todas`; split de movimento acumulado (`split_movimento_mensal.py`) |
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

`DRE` · `BALANCETE` · `ICMS 5005-2012` · `PIS COFINS` (também `PIS E COFINS`) · `IRPJ` · `CSLL` · `ST` · `DIFAL` · `IPI`

Opcionais (movimento do mês, no mesmo arquivo):

`ENTRADAS` · `SAÍDAS` — sinônimos aceitos: `ENTRADA`, `SAIDA`, `SAIDAS`, `SAÍDA` (comparação sem acento e sem caixa).

**Workbook parcial:** se o arquivo tiver **pelo menos 3** abas fiscais do modelo, é `workbook_padrao` — **com ou sem** ENTRADAS/SAÍDAS. O recorte com `ICMS 5005-2012` + pelo menos outra aba fiscal oficial (por exemplo `ST`) também é reconhecido. Extrai as abas presentes e avisa as do esqueleto que faltam. Não inventa imposto, DRE, Balancete nem movimento. O caso com movimento e sem DRE/BALANCETE (ex. Única julho) segue o mesmo critério.

### Qualquer empresa (incluindo cadastrada depois)

O mesmo arquivo modelo serve para Baifer, Loja, Única e **empresa nova**. Só mudam os números e o `MMYYYY` no nome. Não nasce parser por empresa.

1. Cadastrar a empresa (catálogo estático ou `/empresas/nova` no Postgres) e entrar no **dashboard dela**.
2. Importar `Planilha Padrão … MMYYYY.xlsx` (ex. `092026` = setembro/2026). A empresa gravada é a do dashboard aberto (`_apply_session_company`), não o texto do nome do arquivo.
3. Cada aba com valor cai no mesmo campo do mapa abaixo. Aba vazia ou ausente não inventa número.
4. Relatório EXITO de Entradas/Saídas (ou abas ENTRADAS/SAÍDAS no workbook): o CNPJ do cabeçalho tem que ser o da empresa cadastrada. IRPJ/CSLL com CNPJ de outra empresa continua **ignorado**.
5. Use **Gravar** para juntar novos tipos ao mês. Se estiver corrigindo um tipo já importado, use **Substituir tipos enviados**; os demais tipos do mês permanecem.

- Nome do arquivo **não** define empresa nem tipo; detecção pelo conjunto de abas.
- Empresa: CNPJ do cabeçalho das abas de movimento ou dashboard aberto (empresa só no Postgres também herda o dashboard).
- `MMYYYY` no nome (`082026`, `092026`, …) vira competência `YYYY-MM` e ancora DRE, Balancete e impostos. O texto fixo da aba `ICMS 5005-2012` é norma/modelo, não maio/2012. Sem uma competência real no nome ou cabeçalho, a prévia bloqueia a gravação. A empresa vem do dashboard aberto.
- DRE e BALANCETE: só a coluna desse mês. Coluna vazia = part `vazia`. Nunca copia janeiro (nem outro mês preenchido) para a competência do arquivo.
- ICMS 5005-2012: débito/crédito na memória. `apuracao.icms.aRecolher` só da linha **ICMS a recolher**, se ela existir. Se essa aba existir, o caminho é a memória 5005 (ex. Baifer).
- Aba `ICMS` (comparada sem acento como `icms`, sem 5005): grava só `apuracao.icms` com `apurado` = linha Débito ICMS, `credito` = Crédito ICMS, `aRecolher` = linha ICMS a recolher, `fonte: planilha_padrao_icms`. Não cria `memoriaCalculo`. Sem as três linhas, a aba não é gravada.
- PIS COFINS / PIS E COFINS: os dois nomes de aba são equivalentes. `aRecolher` é a coluna do RESUMO cujo cabeçalho é A RECOLHER ou IMPOSTO A RECOLHER. Débito − crédito do mês fica em `aRecolherCalculado`. Cabeçalho `SALDO CREDOR` grava `saldoCredor`. Cabeçalho `AJUSTE` (ex. aluguel) grava `ajuste` e não é saldo credor.
- ST: soma UF/VALOR em `apuracao.icmsSt` só se houver valor. DIFAL e IPI só se a aba tiver valor no resumo/grade.
- IRPJ/CSLL só se a aba existir e o CNPJ conferir com a empresa do dashboard.
- ENTRADAS/SAÍDAS alimentam Compras/Vendas só quando essas abas existem.
- Competência das abas de movimento: `Período:` do cabeçalho da própria aba, quando ENTRADAS/SAÍDAS existirem.
- Abas vazias ou CNPJ divergente (IRPJ/CSLL): **aviso**, não erro — Gravar continua.
- Arquivo com pelo menos 3 abas fiscais e **sem** ENTRADAS/SAÍDAS continua `workbook_padrao`: lê cada aba presente. Não cai na leitura só da primeira aba.

### Mapa aba da planilha → aba do dashboard

| Aba planilha | Pack | Aba UI |
|--------------|------|--------|
| DRE | `dre`, `receitaBruta`, `cmv`, `lucBruto`, `lucLiq`, `margMb`, `margMl` | DRE, Visão Geral (RB), Indicadores |
| BALANCETE | `balancete` | Balancete |
| ENTRADAS | `totalCompras`, `fornecedores`, `cfopDados`, `porUf`, `nfsEntradas`, linhas NF | **Compras**, Finalidade, Visão Geral, **Recebimentos** (pagamentos) |
| SAÍDAS | `cfopSaidasTotal`, `receitaBruta`, `clientes`, `clientesTop10`, `cfopSaidas`, `porUfSaidas`, `nfsSaidas`, `vendasPorDoc`, linhas NF | **Vendas**, Visão Geral |
| ICMS 5005-2012 | `memoriaCalculo`, `apuracao.icms`, `apuracao.subvencao` | **Memória**, KPI ICMS |
| ICMS (sem 5005) | `apuracao.icms` (`fonte: planilha_padrao_icms`); sem `memoriaCalculo` | **Memória**, KPI ICMS |
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
| PIS/COFINS: coluna A RECOLHER do RESUMO ≠ débito − crédito | Grava a coluna do RESUMO em `aRecolher`; débito − crédito em `aRecolherCalculado` |
| PIS/COFINS: cabeçalho `AJUSTE` | Não grava essa coluna em `saldoCredor` |
| PIS/COFINS: cabeçalho `SALDO CREDOR` | Grava em `saldoCredor` (Baifer/Única) |
| Aba `ICMS` sem `ICMS 5005-2012` | Part `icms`, só `apuracao.icms`; não é memória 5005 |
| Workbook parcial | Aviso lista só os nomes das abas do esqueleto que faltam. Coluna do mês vazia em DRE/BAL não entra nesse aviso |

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
- Ordem do resumo: Simples Nacional (se houver) → ICMS 5005 → ICMS ST → PIS → COFINS → IRPJ → CSLL → TOTAL.
- **Simples Nacional (LANNIC):** card/tabela PGDAS com saídas e devoluções (sem linha “Base memória”); partilha IRPJ/CSLL/PIS/COFINS/INSS/ICMS **só no livro**. Sem APURAÇÃO 5005 não aparece empty-state de 5005. Pack: `memoriaSimples` + `apuracao.das` (`fonte: pgdas_simples_nacional`). Partilha **não** vai para `apuracao.icms` / `irpj` / `csll`.
- **Indústria Schumacher** (`livroApuracao`): os mesmos cards e Resumo Consolidado; cada tributo do livro lista as 9 linhas do resumo (não Decreto 5005, não base/alíquota, não UF). IPI entra nessa grade. ICMS ST, IRPJ e CSLL são cards **Em apuração**. **Ver livro técnico** abre ICMS/IPI/PIS/COFINS com Resumo, Entradas/créditos, Saídas/débitos e Conferência. `% s/ RB` = `—`.

Fórmulas gravadas no pack (não calculadas na UI):

- ICMS 5005: `Total 5005 + Total fora = ICMS a recolher`
- PIS/COFINS: `a recolher` = coluna A RECOLHER / IMPOSTO A RECOLHER do RESUMO. Débito − crédito do mês fica em `aRecolherCalculado` e na linha **Resultado do mês**. Se o cabeçalho for `SALDO CREDOR`, esse valor fica em `saldoCredor`. Se for `AJUSTE` (aluguel), fica em `ajuste` e o livro não chama isso de saldo credor. No livro, se o resultado do mês diferir do oficial, as duas colunas aparecem.
- ICMS sem aba 5005: card **Apuração ICMS** (não Decreto 5005), com apurado, créditos e a recolher. Sem `memoriaCalculo` não abre o livro técnico da 5005.
- IPI: `a recolher = débito − crédito − saldo credor`. Na tabela ICMS/IPI das filiais JPG, se **IPI a Recolher** vier 0 e crédito > débito, grava o saldo credor (negativo). Demonstrativo EXITO: **Saldo credor de IPI para o mês seguinte** vira `aRecolher` negativo (mesmo padrão do ICMS).

Pack: `memoriaCalculo` (5005 + `linhas` + `formulaIcms`), `memoriaPisCofins`, `memoriaIpi`, `memoriaIrpj`, `memoriaCsll`, `porUfSt`, `porUfDifal`.

Seção omitida quando a aba veio vazia ou IRPJ/CSLL com CNPJ de outra empresa. Pack antigo (só KPIs) continua mostrando o que existir; para o livro completo, **reimportar** a planilha padrão.

Golden Baifer jan/2026: ICMS a recolher **−1.901,28**, subvenção **45.070,99**, PIS **−18.080,71**, COFINS **−83.280,93** (resultado do mês: −2.030,42 / −9.352,23), ST DF **474,62**.

Golden Loja das Máquinas ago/2026 (aba `ICMS`, sem 5005): débito **80.544,36**, crédito **55.937,66**, a recolher **24.606,70**. PIS a recolher **3.016,31** (ajuste aluguel 227,15). COFINS a recolher **13.893,28** (ajuste 1.046,27). DRE e Balancete de agosto ficam `vazia` — a coluna do mês está vazia; o janeiro do modelo não é importado. ST, DIFAL e IPI sem valor não são gravados. Fixture: `fixtures/loja-maquinas-padrao/planilha-padrao-082026.xlsx`.

Golden Loja das Máquinas set/2026 (arquivo com **só** a aba `ICMS`): débito **69.407,76**, crédito **56.208,94**, a recolher **13.198,82**. Entra como `workbook_padrao` com uma part `icms`; nada de PIS/COFINS, DRE ou Balancete é gravado por esse arquivo. Fixture: `fixtures/loja-maquinas-padrao/planilha-padrao-092026-so-icms.xlsx`.

### 3.2.1 Impostos (UI)

Topo da aba: KPIs **Vendas do mês**, **Total impostos**, **Total impostos / Vendas %**, **Carga tributária**.

- Base de vendas: `receitaBruta` ou `cfopSaidasTotal` do pack (o que vier no slice).
- Total impostos: `deducoes` do pack; se ausente, soma dos `aRecolher` presentes na apuração (inclui `das`).
- `% s/ vendas` por tributo nos cards = `aRecolher / vendas × 100`. Sem vendas ou sem aRecolher → `—` (nunca `0%` inventado).
- Com `apuracao.das`, a aba mostra o card **Simples Nacional** e **não** lista ICMS/PIS/IPI “Em apuração” vazios.

### 3.2.2 DRE / Indicadores / Balancete (layout)

| Aba | Layout |
|-----|--------|
| **DRE** | KPIs MB / MO / ML / Carga % do mês selecionado + tabela multi-mês (CMV Pendente, deduções em vermelho). Na DRE EXITO, a tabela é uma árvore na ordem da planilha: grupos iniciam abertos, subtotais fechados e detalhes aparecem ao clicar; **Expandir** / **Recolher** controlam toda a estrutura e resultados permanecem visíveis. Packs antigos recebem a mesma hierarquia sem reimportação. MO só se a DRE tiver linha de lucro/resultado operacional. |
| **Indicadores** | A Margens · B Carga · C Patrimoniais **N/D** sem Balancete (banner) · D gráfico deduções % / MB % / ML % |
| **Balancete** | Título + banner do recorte; 4 KPIs (Ativo D / Passivo C / Resultado R / analíticas); mês = uma coluna, trimestre = Balancetes importados daquele trimestre, botão **Geral** = todas as competências importadas do ano consultado; busca/filtro/Expandir·Recolher; árvore Conta×Descrição×meses com pasta/chevron, faixa lateral Ativo(verde)/Passivo·Resultado(roxo), coluna mensal ativa com borda verde vertical e badges **D**/**C**. TOTAL só aparece com mais de um mês e soma os saldos das colunas visíveis (wireframe — não é patrimônio consolidado). |

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

Central de **conciliação bancária real**, independente dos packs fiscais e do seletor global de trimestre. A tela usa seletores próprios de **Banco** e **Competência**, sincronizados em `bank` e `bankMonth` na URL.

**Contrato do arquivo:** `.xlsx`, uma aba, um banco e um mês. O cabeçalho precisa informar `Banco:` e `Competência: MM/AAAA`; o parser localiza as colunas `Data`, `Débito`, `Crédito`, `Valor`, `Histórico`, `Nº Nota` e `Classificação Êxito`. Somente A:G é persistido. Colunas posteriores — inclusive Situação, Verificação do cliente e Observação — não são lidas nem expostas.

| Bloco | O que mostra |
|-------|---------------|
| Seleção | Banco, competência mensal e data da importação ativa |
| Indicadores | Entradas (valores positivos), saídas (módulo dos negativos), saldo assinado e quantidade de lançamentos |
| Classificação Êxito | Quantidade e valor líquido por classificação; classificação vazia aparece como **Sem classificação** |
| Conferência | Banco/mês reconhecidos, linhas válidas, sem classificação e arquivo ativo |
| Lançamentos | Data, débito, crédito, valor, histórico, nota e classificação; busca, classificação, intervalo de datas e paginação de 20 linhas |

**Validações bloqueantes:** banco ou competência ausentes, cabeçalho diferente, valor ilegível, data inválida, data fora da competência, arquivo não `.xlsx`, mais de uma aba e arquivo acima de 10 MB. Classificação vazia não bloqueia. Valores brasileiros com `R$`, milhar, vírgula decimal, sinal negativo ou parênteses são aceitos.

**Persistência e substituição:** `BankStatementImport` guarda metadados/totais e `BankTransaction` guarda A:G. A chave ativa é empresa + unidade específica + banco normalizado + competência. Arquivo idêntico ativo é duplicado e não grava. Arquivo diferente no mesmo slot exige confirmação; a operação marca o anterior como `replaced`, limpa sua chave ativa e grava a nova versão e suas linhas na mesma transação. O histórico anterior não entra nas consultas.

**Permissões:** `preview` e `commit` dependem de administrador. `options`, `summary` e `transactions` exigem acesso à empresa e à aba `recebimentos`; a API também valida se a unidade pertence à empresa. A opção consolidada `todas` não pode ser usada para importar ou consultar conciliação.

Endpoints: `POST /api/bank-statements/preview`, `POST /api/bank-statements/commit`, `GET /api/companies/{id}/bank-statements/options`, `/summary` e `/transactions`.

## 3.3 Empresas cadastradas

| Empresa | Login | CNPJ | Tema | Origem dos dados |
|---------|-------|------|------|------------------|
| Egaplast | `egaplast` | 03185564000134 | verde | EXITO legado |
| Baifer | `baifer` | 52005382000140 | azul | Planilha padrão + EXITO |
| Loja das Máquinas | `loja-maquinas` | 13983066000190 | verde | EXITO legado |
| Única (UNICA COMERCIO ATACADISTA DE TINTAS) | `unica` | 36517206000130 | azul | Planilha padrão v2 (01–07/2026) |
| JPG | `jpg` | 21051983000165 (Sede) | verde | EXITO por filial (`unidade`); um dashboard |
| Indústria Schumacher | `schumacher` | 04589817000106 | verde | Livro de apuração (Matriz) + venda por produto (Matriz e Schumacher Serviços) + DRE e Balanço consolidado (Matriz), jan–ago/2026. Sem NF |

Cadastro estático: `backend/app/companies.py` (+ `KEEP_USERNAMES`) e `backend/scripts/seed.py`.

### Indústria Schumacher — livro de apuração

Login `schumacher` → um card → abas **Visão Geral**, **Margens por mês/cidade**, **Vendas por produto**, **Impostos**, **Memória de Cálculo**, **DRE**, **Balanço Patrimonial**, **Indicadores** e **Importar** (Importar só para administrador). No menu lateral, **Financeiro** agrupa só Balanço e DRE; **Indicadores** fica em seção própria (não junto com DRE/Balanço). Não há Compras nem a Vendas de nota. Unidade **Matriz** (CNPJ 04.589.817/0001-06) e **Schumacher Serviços** (sem CNPJ no pack/`CompanyCnpj`). Nas abas DRE, Balanço e Indicadores o seletor de unidade some: os números são consolidado gravado na Matriz.

Fonte: `fixtures/schumacher-padrao/SHUMACKER_MATRIZ_APURACOES_2026.xlsx` (CNPJ 04.589.817/0001-06). O parser reconhece o arquivo quando as abas dobradas incluem `resumo` e `icms_entradas`. A planilha padrão (DRE / BALANCETE / ICMS 5005) **não** entra nesse tipo.

Fórmula gravada a partir das colunas do Resumo (não é débito − crédito):

- saldo devedor = débitos por saídas + outros débitos
- saldo credor = créditos por entradas + saldo anterior + outros créditos
- a recolher = saldo devedor − saldo credor, quando o devedor é maior
- a transportar = saldo credor − saldo devedor, quando o credor é maior

Jan/2026 ICMS: débitos 202.756,31 · créditos 140.400,70 · outros créditos 16.331,63 · saldo credor 156.732,33 · a recolher **46.023,98** · a transportar 0. IPI a recolher 3.561,24. Abr/2026 ICMS outros débitos 180.694,92 (subtítulo do card Débitos).

ICMS ST, IRPJ e CSLL **não** são gravados. Na tela aparecem como **Em apuração** com traços.

O layout novo (cards do livro na Memória, tabela por tributo em Impostos) só renderiza se `data.livroApuracao` existe. Na Memória: `TaxDetailCard` + Resumo Consolidado no topo; o CFOP fica em **Ver livro técnico**. Única, Baifer, JPG, Egaplast e Loja das Máquinas seguem Impostos com os 4 KPIs (Vendas do mês, total, % ) e `MemoriaLivro`.

Carga local: `python scripts/seed.py`, `python scripts/import_schumacher_livro.py` (merge no pack da Matriz), `python scripts/import_schumacher_venda_produto.py` (merge `vendaProduto`; cria os slots da Filial), `python scripts/import_schumacher_margem.py` (margens mês + cidade; atualiza abas), `python scripts/import_schumacher_dre.py` e `python scripts/import_schumacher_balanco.py` (merge na Matriz; não apaga livro nem venda por produto).

**Produção (VPS):** um push na branch `main` dispara `.github/workflows/deploy.yml`. O job é recebido pelo runner exclusivo `exito-vps-Dashboards` na própria VPS e executa [`scripts/vps-root-deploy-nova.txt`](../../scripts/vps-root-deploy-nova.txt) no caminho `/root/PROJETOS/exito/Dashboards`. O script atualiza a cópia de produção, compila `nova-versao/frontend`, reinicia o PM2 `exito-dashboard` e o container `dashboards-nova-api`, executa `seed.py` e `import_schumacher_margem.py` e confere os endereços locais de saúde. Ao iniciar, a API executa `Base.metadata.create_all` de forma idempotente para criar tabelas modeladas que ainda estejam ausentes antes de liberar as rotas. O serviço do runner é restrito ao repositório `Trindadelucas0/Dashboards`; credenciais e tokens não ficam na documentação nem no repositório.

### Indústria Schumacher — margens por mês e por cidade

Fontes: `fixtures/schumacher-padrao/Demonstrativo de Margens de Venda(Mes).xls` (jan–set/2026), `(Mes)2025.xls` (2025 inteiro) e `(Cidade).xls` (145 cidades, acumulado jan–set/2026). São ODS (ZIP + `mimetype` OpenDocument), não Excel OLE.

`margem_mes`: cabeçalho `Mês`/`Ano`/`Total Vendas`; uma part por competência na Matriz. `margem_cidade`: cabeçalho `CODCIDADE`/`CIDADE`; gravado em `2026-09` matriz com `periodoLabel` **Jan–Set/2026**. A API de **Margens por cidade** ignora o mês da URL e lê o pack com `margemCidade` (preferência slot `2026-09`). Trimestre em **Margens por mês** soma valores e recalcula margens.

Golden: jan/2026 total **2.855.367,29**; soma totais das 145 cidades **51.139.507,94**. Venda por produto e livro **não** classificam como margem.

### Indústria Schumacher — venda por produto

Fonte: `fixtures/schumacher-padrao/VENDA_POR_PRODUTO_SHUMACHER_01_A_08_2026_MATRIZ_E_FILIAL.xlsx`. O parser reconhece o arquivo quando existem as abas dobradas `matriz 01` e `filial 01`. Livro (`icms_entradas`) e planilha padrão **não** entram nesse tipo.

Cada aba `Matriz MM` / `Filial MM` vira uma part `venda_produto` com competência `2026-MM` e unidade `matriz` ou `filial`. Hash `tipo:competencia:unidade` para Matriz e Filial do mesmo mês não colidirem. O Resumo só confere o total; a lista vem da aba do mês. Se a soma da coluna Total e o TOTAL GERAL diferirem em 0,02 ou mais, a part volta com erro e não grava como ok.

Pack `vendaProduto.resumo` e `vendaProduto.produtos[]`: `codigo`, `produto`, `qtde`, `qtdeUn`, `aVista`, `aPrazo`, `total`, `custo`, `lucroBruto`, `lucroLiquido`, `margBruta`, `margLiquida`, `pmp`. Margem **gravada como razão** (`0,5862` = 58,62% na tela). PMP do mês é o da linha TOTAL, não média simples. Filial fevereiro lucro bruto **−187.636,43** é o card, não erro de parse. Quantidade zero mostra o PMP da planilha.

**Todas** e **1º Trimestre**: somam quantidade, à vista, a prazo, total, custo e lucros; margem = lucro ÷ total (total zero não divide); PMP = soma(PMP × total) ÷ soma(total); produtos com o mesmo código somam. Não há opção “Jan–Ago” no seletor; os oito meses aparecem no gráfico.

API: `GET /api/companies/schumacher/months/2026-01/vendas-produto?unidade=matriz` (sem rota nova). Golden: Matriz jan/2026 total **2.124.363,70** / 244 itens / produto 10001 qtde 603 total 17.529,33; Filial jan **731.003,59** / 53 itens; Todas jan ≈ **2.855.367,29**.

**UI (`VendasProduto`):** quatro KPIs (Total, Lucro líquido, Margem líquida, Itens) + acordeão **Ver mais métricas**; ranking top 8 com barra de participação no total; lista completa com filtros/ordenação/busca, coluna **Part.** e detalhe em grid ao clicar a linha; **Ir para lista completa** no card de maiores vendas. Em telas ≤1024px a tabela some e permanecem os cards.

A aba **Vendas** (`vendas`) das outras empresas continua nota por cliente/UF/ticket.

### Indústria Schumacher — DRE e Balanço Patrimonial

Fontes: `fixtures/schumacher-padrao/DRE_SCHUMACHER_2026.xlsx` e `BALANCO_PATRIMONIAL_SCHUMACHER_2026.xlsx`. O parser usa a aba **Comparativo** (cabeçalho `Jan/26`…`Ago/26`). CNPJ 04.589.817/0001-06; DRE `Filial: CONSOLIDADO`; BP `Unidade: TODOS (0)`. As abas mensais `Jan-26`… são ignoradas (mesmo número). Análise Vertical (`01/2026`), livro e venda por produto **não** entram nesses tipos.

Cada coluna de mês vira uma part na **Matriz** (`2026-01`…`2026-08`). Hash `tipo:competencia`. Merge no pack existente (`hasDre` + `dre.kind=schumacher_comparativo`; `hasBalancete` + `balancete.kind=schumacher_bp` com `linhas` e `totais`, sem código de conta). `hasMovimentacao` permanece false.

**DRE (UI `DreSchumacher`):** KPIs em R$ do chip (Receita bruta = RECEITA OPERACIONAL BRUTA, Receita líquida, Lucro bruto, Lucro líquido). Tabela Conta × meses + **Acum Jan–Ago**; chip de mês destaca a coluna; **1º/2º Trim** mostra só esses três meses e **soma** os KPIs (fluxo). Acumulado sempre do arquivo (não é soma do trimestre). Grupos recolhíveis: meta % da RB, filhas com % do grupo, **Soma do grupo**; Expandir/Recolher/busca como no Balanço. Janeiro RB **65.256.171,15** entra como no Excel.

Golden DRE: jan LL **3.286.063,34** · RL **64.810.440,98** · Lucro bruto **21.588.039,86**; ago RB **5.448.307,61** · LL **−60.274,01**; Acumulado Jan–Ago RB **101.951.997,02** · LL **−4.771.004,58**.

**Balanço (UI `BalancoSchumacher`, rota `balancete`):** duas colunas Ativo | Passivo+PL da posição do mês. KPIs Ativo, Passivo (c/ PL), Patrimônio líquido, Diferença (linha do Excel). Grupos recolhíveis: meta “N contas · X% do Ativo|Passivo”; ao expandir, contas filhas com % do grupo e **Soma do grupo** (valor da linha do Excel, não soma das filhas). Trimestre: corpo = último mês importado do trimestre; faixa com Ativo/Passivo/Diferença de cada fim. Sem coluna TOTAL somando meses. Estoque negativo permanece.

Golden BP jan: Ativo **78.939.887,50** · Passivo **75.653.824,16** · PL **24.427.195,97** · Diferença **3.286.063,34** (= LL da DRE de janeiro). Ago: Ativo **75.570.991,22** · Passivo **80.341.995,80** · Diferença **−4.771.004,58** (= LL acumulado Jan–Ago da DRE, posição de estoque).

Única, Baifer, JPG, Egaplast e Loja das Máquinas continuam com `DreStatement` (MB/MO/ML/Carga) e `BalanceteTree` e a aba **Indicadores** genérica (A–D). A Schumacher usa `IndicadoresSchumacher` (A Resultado · B Liquidez · C Evolução).

### JPG — um dashboard, várias unidades

**Não** há card, login ou rota por filial. Login `jpg` → `/dashboard/jpg/...`. O dropdown do header escolhe a unidade.

| Unidade (`unidade`) | Label | CNPJ | Pasta deste lote |
|---------------------|-------|------|------------------|
| `sede` | Matriz Sede | 21051983000165 | `pasta temporaria/711- JPG PRODUTOS MATRIZ` (Entradas/Saídas) + IRPJ/CSLL trimestral EXITO (03/2026 e 06/2026) |
| `asa_sul` | Filial Asa Sul DF | 21051983000327 | `712-JPG FILIAL BRASILIA` + ICMS/IPI Asa Sul |
| `pr` | Filial PR | 21051983000670 | `81-JPG FILIAL CURITIBA` + IPI PR |
| `sp` | Filial SP | 21051983000750 | `82- JPG FILIAL SÃO PAULO` + ICMS/IPI SP |
| `mg` | Filial MG | 21051983000599 | `90-JPG FILIAL MINAS` + IPI MG |
| `lannic` | LANNIC Dermocosméticos | 48285395000142 | `pasta temporaria/Nova pasta` (`144-Entradas` / `144-Saídas` 01 a 08/2026) → split `_split/144/lannic` (dados reais **mai–ago/2026**) + PGDAS 08/2026 (`scripts/seed_jpg_lannic.py`, merge) |

Filial DF (`matriz` no legado) — mesmo CNPJ da Asa Sul, **sem** Excel na pasta temporária.

**LANNIC 08/2026 (Simples Nacional + movimento EXITO):** receita no pack R$ 478.335,06 (PGDAS: saídas 557.733,52 − devoluções 79.398,46); a Memória **não** mostra linha “Base memória”. DAS R$ 28.398,35 (alíq. 5,9369184503617% × base). Partilha só na memória: IRPJ 1.848,41 · CSLL 1.176,26 · COFINS 0 · PIS 0 · INSS/CPP 14.115,16 · ICMS 11.258,52. Compras ago: R$ 451.739,03 (237 NFs). Vendas Excel ago: R$ 893.349,52 (241 NFs; CFOP 6-905+6-910 = 335.616,00 — **não** entra na base PGDAS). Sem DRE/Balancete. RBT12 560.212,54 · RBA 1.038.547,60 · faixa 360.000,01 a 720.000,00 · fator r 1,00 · Anexo I Comércio · Seção II ST · Tabela 7 PIS/COFINS monofásicos. Cabeçalho do `.xls` acumulado diz jan–ago, mas **não há linhas em 01–04/2026**.

**JPG Matriz — IRPJ/CSLL (lucro presumido, 1º e 2º trimestre 2026):** arquivo EXITO com abas `Demonst. CSOC` + `Demonst. IRPJ-LP`. Cabeçalho CNPJ da sede; competência = último mês do trimestre. **Não** espalha pelos 3 meses. Saldo devedor: mar/2026 IRPJ 143.211,70 e CSLL 74.476,66; jun/2026 IRPJ 137.737,02 e CSLL 77.617,99. Fixtures: `fixtures/jpg-padrao/irpj-csll-1t-2026.xls` e `irpj-csll-2t-2026.xls`. Import merge: `python scripts/import_jpg_irpj_csll.py`.

Gravação: `FiscalMonth(company_id=jpg, competencia, unidade)` isolado. Merge só no mesmo mês **e** mesma unidade. **Nunca** persistir `unidade=todas`.

Arquivos de movimento `01-2026 a 08-2026` disparam `RANGE_ERROR`. Pré-processar com `backend/scripts/split_movimento_mensal.py` (filtra **Data Emissão** → `Entradas MM-YYYY.xlsx`). Impostos `icms/ipi filial … 01 a 08.xls` são **demonstrativos EXITO com 8 abas** (uma competência cada); o pipeline gera parts por mês da **mesma** filial (CNPJ). Não misturar PR com MG.

**JPG não usa APURAÇÃO 5005** (Decreto 5005). ICMS/IPI vêm do demonstrativo EXITO (ou tabela filial). Na UI JPG a Memória e o Importar não citam 5005; o parser 5005 continua só para Baifer/Única.

**IPI saldo credor:** mesma regra do ICMS. Linha “Saldo credor de IPI para o mês seguinte” com valor e “Saldo devedor de IPI” = 0 → `aRecolher` negativo e chip **Saldo credor** / KPI **Crédito IPI**. Exemplo Asa Sul 08/2026: saldo credor **1.914,98**. Packs já gravados com IPI 0 não atualizam sozinhos — reimportar o arquivo IPI da filial com **Substituir tipos enviados**.

Consolidado **Todas as unidades**: soma virtual na API (`tab_payload` + `aggregate_fiscal_packs`). Transferências entre filiais podem duplicar no consolidado (igual legado). Export CPF/CNPJ em `todas` é **bloqueado** — escolha uma filial. Sem DRE/Balancete/PIS-COFINS nestas pastas → abas `—` (não inventar).

Ordem de import recomendada: 711 sede → 81 PR → 90 MG → 82 SP → 712 Asa Sul. Login `jpg` → aba **Importar** no dashboard JPG (CNPJ define a unidade).

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
- ~370 KB — ENTRADAS/SAÍDAS + impostos, **sem** DRE/BALANCETE → workbook **parcial** (movimento + impostos). Goldens movimento: Entradas 2.119.642,66 (238 NFs, Δ0); Saídas 2.440.744,56. Resultado do mês PIS 3.699,88 / COFINS 17.041,86 (`aRecolherCalculado`); `aRecolher` oficial = coluna RESUMO.

Importar **os dois** (ou o parcial + o de 9 abas) com **Gravar** para fazer o merge.

**Caveat ICMS ST (jul/2026 e aba `ST` em geral):**
- Dump aba ST (iguais nos dois arquivos): BA **342,70** · DF **48.663,84** · GO **17.114,14** · MG **15.751,02** → soma **81.871,70**. Sem linha TOTAL; sem coluna de crédito.
- O dashboard/`pack.apuracao.icmsSt` **bate** com essa soma (`apurado` = `aRecolher` porque o parser não encontra “a recolher” separado).
- Contador Única: o cliente **não paga** esse valor — a aba é resumo por UF, não guia. **Não alterar** o parser para inventar outro `aRecolher` sem demonstrativo.
- DRE `(-) SUBSTITUIÇÃO TRIBUTÁRIA` no arquivo ~61 KB está só na coluna **JANEIRO** (−81,99) — **não** é ST de julho.
- ICMS 5005 / PIS do mesmo workbook **não** trazem ST a recolher. Não há arquivo `Demonst. SUBTRI` / `Apuração icms st` nos Downloads para a Única.
- Fonte oficial de ST **a recolher**: planilha EXITO SUBTRI (label `substituicao tributaria a recolher`, como no Baifer) ou valor da guia paga informado pelo contador.
- `% s/ vendas: —` em jul no Postgres: pack sem `cfopSaidasTotal`/`receitaBruta` (movimento do ~370 KB ainda não mergeado). Reimportar o parcial com **Gravar**. Não é bug de cálculo do % quando há vendas.

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
| Abas UI | **Balancete** (`BalanceteTree` + dados anuais de `build_balancete_por_mes`): chip mensal mostra uma coluna; trimestre mostra apenas competências importadas daquele trimestre; **Geral** mostra todas as competências importadas do ano. Mês/trimestre sem Balancete mostra aviso, sem fallback para outro período. Indicadores patrimoniais deixam de ser N/D quando houver BP |

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
| Parser PIS/COFINS/IPI/IRPJ | `backend/app/extract/parse_impostos.py` (`parse_pis_cofins_padrao` coluna RESUMO; `parse_demonstrativo_ipi` saldo credor; `parse_demonstrativo_exito_irpj_csll`) |
| Import IRPJ/CSLL JPG sede | `backend/scripts/import_jpg_irpj_csll.py` (merge 03/2026 e 06/2026) |
| Parser movimento | `backend/app/extract/parse_movimento.py` |
| Parser DRE / Análise Vertical | `backend/app/extract/parse_dre.py` (`extract_dre_vertical`, `parse_dre_padrao_column`) |
| Parser DRE Schumacher | `backend/app/extract/parse_dre_schumacher.py` |
| Parser Balancete EXITO / padrão | `backend/app/extract/parse_balancete.py` |
| Parser Balanço Schumacher | `backend/app/extract/parse_balanco_schumacher.py` |
| Indicadores Schumacher (cálculo) | `backend/app/indicadores_schumacher.py` |
| UI Indicadores Schumacher | `frontend/components/IndicadoresSchumacher.tsx` |
| Menu lateral (Schumacher: seção Indicadores) | `frontend/lib/nav.ts` (`navSectionsForCompany`), `frontend/app/dashboard/[empresa]/layout-inner.tsx` |
| Pipeline | `backend/app/extract/pipeline.py` |
| Preview/commit | `backend/app/routers/imports.py` (`expand_workbook_parts` também expande `dre_vertical`). Cada item gravado guarda `source_file_hash` e `pack_patch`; cada `NfeLine` nova aponta `import_id`. **Substituir tipos enviados** marca como `replaced` e remove linhas somente dos tipos presentes na prévia, preservando os outros dados do mês/unidade. |
| Conciliação — parser e armazenamento | `backend/app/extract/parse_bank_statement.py`; modelos `BankStatementImport` e `BankTransaction` em `backend/app/models.py` |
| Conciliação — API | `backend/app/routers/bank_statements.py` (preview/commit de admin; options/summary/transactions com empresa, aba e unidade validadas no servidor) |
| Conciliação — UI | `frontend/components/BankReconciliation.tsx`; montagem dedicada em `frontend/app/dashboard/[empresa]/[aba]/page.tsx`; estilos `.bank-*` em `frontend/app/dashboard.css` |
| Lista e exclusão | `GET /api/imports?companyId=` e `DELETE /api/imports/{id}` em `backend/app/routers/imports.py` (admin + empresa do registro). Reconstrução do mês: `backend/app/imports_revert.py` (`rebuild_pack`). |
| Seletor / unidades / exclusão de empresa | `frontend/app/seletor/page.tsx` (manejo administrativo), `frontend/app/empresas/nova/page.tsx` (CNPJs nomeados); `GET /api/companies/{company_id}`, `POST /units`, `PATCH/DELETE /units/{unit_key}` e `DELETE /api/companies/{company_id}` em `backend/app/routers/companies.py`; `CompanyCnpj`/`CompanyDeletion` em `backend/app/models.py`. |
| Fatia por aba UI | `backend/app/routers/companies.py` → `_slice`, `_is_empty`, `build_dre_por_mes`, `build_balancete_por_mes` |
| CFOP / Finalidade / Serviços | `backend/app/extract/cfop.py` (`CFOP_INFO`, `aggregate_macro`, `aggregate_servicos`) |
| Linhas NF (export) | `GET .../nfe-lines` em `backend/app/routers/companies.py`; classificação `tipo_doc` / `vendas_por_doc` em `backend/app/extract/aggregate.py` |
| Export PDF/Excel | `frontend/lib/exportLibs.ts`, `vendasExport.ts`, `finalidadeExport.ts`, `cpfCnpjExport.ts`, `supplierExport.ts` |
| UI Memória | `frontend/components/MemoriaLivro.tsx` (padrão). Schumacher com `livroApuracao`: `frontend/components/MemoriaApuracao.tsx` |
| UI livro Schumacher | `frontend/components/ApuracaoDashboard.tsx` (Impostos e Visão Geral sem movimento). Parser `backend/app/extract/parse_livro_apuracao.py`. Carga `backend/scripts/import_schumacher_livro.py` (merge no pack) |
| UI venda por produto | `frontend/components/VendasProduto.tsx`. Parser `backend/app/extract/parse_venda_produto.py`. Carga `backend/scripts/import_schumacher_venda_produto.py`. Fatia `_slice` / `aggregate_fiscal_packs` / `TAB_KEYS` em `backend/app/routers/companies.py` |
| UI DRE | `frontend/components/DreStatement.tsx` (Única e demais). Schumacher: `frontend/components/DreSchumacher.tsx` |
| UI Balancete | `frontend/components/BalanceteTree.tsx` (Única e demais). Schumacher: `frontend/components/BalancoSchumacher.tsx` (rótulo Balanço Patrimonial) |
| UI abas (Impostos / Indicadores) | `frontend/app/dashboard/[empresa]/[aba]/page.tsx` (`TrimestreBlock` só se `viewingTrimestre`; Schumacher não monta) |
| Estilos dashboard | `frontend/app/dashboard.css` |
| UI import | `frontend/components/ImportTab.tsx` (upload, lista **Planilhas importadas**, confirmação de exclusão dentro do card clicado) |
| Catálogo de empresas | `backend/app/companies.py`, `backend/scripts/seed.py` |
| JPG unidades / consolidado | `company_detail` + `tab_payload` (`unidade=todas`) em `backend/app/routers/companies.py`; `aggregate_fiscal_packs` soma `irpj`/`csll`; dropdown em `frontend/app/dashboard/[empresa]/layout-inner.tsx` |
| LANNIC Simples | `Unit lannic` em `backend/app/companies.py`; pack `scripts/seed_jpg_lannic.py` (merge, não apaga NFs); `preserve_simples_receita` em `aggregate.py`; UI Impostos `page.tsx` + `MemoriaLivro.tsx` |
| Split movimento acumulado | `backend/scripts/split_movimento_mensal.py` |
| Testes golden | `backend/tests/test_bank_statements.py` (parser sintético, colunas ignoradas, datas, dinheiro, duplicidade e substituição), `backend/tests/test_import_revert.py`, `backend/tests/test_padrao_qualquer_empresa.py` (sintético, sem empresa fixa), `backend/tests/test_workbook_padrao.py`, `backend/tests/test_unica_padrao.py`, `backend/tests/test_loja_padrao_082026.py`, `backend/tests/test_unica_dre_vertical.py`, `backend/tests/test_unica_balancete.py`, `backend/tests/test_cfop.py`, `backend/tests/test_slice_contract.py`, `backend/tests/test_baifer_entradas.py`, `backend/tests/test_baifer_balancete.py`, `backend/tests/test_loja_balancete.py`, `backend/tests/test_jpg.py`, `backend/tests/test_livro_apuracao_schumacher.py`, `backend/tests/test_venda_produto_schumacher.py`, `backend/tests/test_dre_schumacher.py`, `backend/tests/test_balanco_schumacher.py`, `backend/tests/test_indicadores_schumacher.py` |
| Fixtures | `fixtures/baifer-padrao/`, `fixtures/unica-padrao/`, `fixtures/egaplast-padrao/`, `fixtures/loja-maquinas-padrao/`, `fixtures/jpg-padrao/`, `fixtures/schumacher-padrao/` |

## 5. Regras de negócio

1. Não inventar imposto — aba vazia omite chave no pack e a seção some na Memória.
2. Próximo mês = novo `FiscalMonth`; merge só dentro do mesmo mês/competência.
3. Planilha padrão nunca bloqueia por CNPJ ausente no arquivo.
4. IRPJ/CSLL só grava se CNPJ da aba = empresa do dashboard.
5. Movimento (Entradas/Saídas, avulso ou dentro do workbook): valor vem de **Valor Contábil**, nunca da coluna `Valor` (ICMS). Sem essa coluna, a aba não é gravada.
6. Memória não calcula imposto: só exibe o livro importado.
7. DRE/Balancete da planilha padrão só gravam a coluna do mês do próprio arquivo (`MMYYYY`); coluna vazia = nada gravado. Exceção: **Análise Vertical** grava uma part por coluna `MM/YYYY` preenchida.
8. `Total Geral` só é aceito se houver número na coluna de valor da própria linha — nunca aproveitar número de outra coluna (Isentas/Outras/Base).
9. PIS/COFINS da planilha padrão gravam a coluna A RECOLHER / IMPOSTO A RECOLHER do RESUMO em `aRecolher`; débito − crédito do mês fica em `aRecolherCalculado`. `SALDO CREDOR` e `AJUSTE` são colunas distintas: só a primeira vira `saldoCredor`.
10. Percentuais na UI (Impostos `% s/ vendas`, Memória `% s/ RB` = max(aRecolher,0)/RB, DRE margens) só com numerador e denominador no pack; caso contrário `—` / `N/D` / “Em apuração”.
11. Balancete multi-mês: coluna Total da grade = soma dos saldos mensais exibidos (layout wireframe); não interpreta patrimônio consolidado.
12. Documento de cliente/fornecedor: 11 dígitos = CPF, 14 = CNPJ; demais = outros. Exportações de vendas/finalidade/CPF×CNPJ usam só pack e `NfeLine` da competência/unidade atuais.
13. Workbook com ≥3 abas fiscais do modelo é `workbook_padrao`, com ou sem ENTRADAS/SAÍDAS. Também é `workbook_padrao` o arquivo que tem a aba `ICMS` com as três linhas Débito ICMS / Crédito ICMS / ICMS a recolher, mesmo sem as outras abas (antes caía em “Tipo de planilha não reconhecido”). Abas do esqueleto ausentes geram aviso; coluna do mês vazia em DRE/BAL = part `vazia` (não copia outro mês). Sem abas de movimento, Compras/Vendas não são alteradas por esse arquivo. Empresa nova usa o mesmo contrato: só mudam números e `MMYYYY`; `company_id` vem do dashboard.
14. CFOPs de serviço (1-933/2-933 ISSQN; 1-353/2-353 transporte; faixa SINIEF `.300` comunicação) entram no macro `servicos` e no painel `servicosTomados` da Finalidade.
15. DRE Análise Vertical sem CNPJ herda a empresa do dashboard (como 5005/ST); não inventa `lucLiq` se a linha de resultado operacional estiver vazia.
16. Balancete EXITO mensal (Única e demais): totais Ativo/Passivo/Resultado vêm do Saldo Atual das contas `1`/`2`/`3`; um arquivo = uma competência.
18. JPG: um `company_id`; filiais só em `unidade`. Consolidado `todas` é soma na API, não é slot no Postgres. Export CPF/CNPJ exige filial específica.
19. JPG IRPJ/CSLL EXITO (abas CSOC + IRPJ-LP): grava só no último mês do trimestre (`sede` 03 e 06/2026); merge no movimento; o chip de trimestre soma `apuracao.irpj`/`csll` sem espalhar pelos outros dois meses.
20. IPI (demonstrativo EXITO ou tabela): se a recolher/saldo devedor ≈ 0 e há saldo credor (ou crédito > débito) → `aRecolher` negativo. KPI Visão Geral: DAS, senão ICMS com valor, senão IPI. JPG não exibe APURAÇÃO 5005 na UI.
21. LANNIC (Simples): `memoriaSimples.baseMemoria` manda em `receitaBruta` após merge de saídas/import/seed. `cfopSaidasTotal` e `NfeLine` vêm do Excel. Reexecutar `seed_jpg_lannic.py` **não** zera movimento.
22. Barra de competência (`MesBar`): chip de mês mostra só o mês. Grupos de trimestre (`qN-YYYY`) aparecem em **ordem de calendário** (todos os trimestres de um ano antes do ano seguinte). Com **dois ou mais anos** na barra, o chip do trimestre inclui o ano (**1º Trim 2025**); com um só ano, **1º Trim** / **2º Trim** sem ano. O chip de trimestre soma os meses importados daquele trimestre e, nas empresas com movimento, exibe a faixa de 4 KPIs (`TrimestreBlock`). Aba **DRE**, aba **Vendas por produto** e a empresa **Indústria Schumacher** (`schumacher`) não usam essa faixa. A API ainda pode devolver `trimestre` no mês; a UI ignora.
23. Excluir planilha (só administrador, aba **Importar**): a lista mostra só registros `status=ok` da empresa aberta. Várias abas do mesmo arquivo compartilham `source_file_hash` e saem juntas; o id do card é o menor id do grupo. `DELETE /api/imports/{id}` apaga esses registros e as `NfeLine` com `import_id` neles. Se todo registro do slot (os que saem e os que ficam `ok`) tem `pack_patch`, o pack do mês é remontado só com os arquivos que permanecem, na ordem de gravação; chave que nenhum desses arquivos gravou (ex. `memoriaSimples` do seed) fica, e `receitaBruta` continua a base PGDAS. Import antigo sem `pack_patch`: se era o único arquivo daquele mês/unidade, o slot zera; se o tipo não se repete entre os que ficam, só as chaves daquele tipo saem; se há outro arquivo do mesmo tipo, a API responde 409 e não grava nada — reimporte o pacote correto. No commit, **Substituir tipos enviados** afeta somente os tipos válidos presentes na prévia daquele mês/unidade; outros tipos e suas linhas permanecem ativos.
24. Livro de apuração (Schumacher): `tipo` `livro_apuracao` antes da planilha padrão. Pack `apuracao.{icms,ipi,pis,cofins}` traz débitos, créditos, saldo credor (pool), a recolher, a transportar e `fonte: livro_apuracao`. `livroApuracao.tributos` traz entradas, saídas, subtotais e ajustes. PIS/COFINS gravam a última coluna em `outros` e `colunaOutrosLabel = "Imune/Susp."`. Trimestre soma os números do resumo e concatena as linhas; conferência do período fica OK só se todos os meses estão OK. A UI nova só aparece com `livroApuracao`. Sem essa chave, Impostos continua com os 4 KPIs de vendas/% e Memória continua em `MemoriaLivro`. Com a chave, Memória (`MemoriaApuracao`) abre nos cards + Resumo Consolidado; o CFOP só depois de **Ver livro técnico**. Reimportar o livro faz **merge** no pack (não apaga `vendaProduto`).
26. Margens gerenciais (Schumacher): `margem_mes` / `margem_cidade` depois de `balanco_schumacher` e antes de `workbook_padrao`. ODS `.xls` lido via `workbook.load_all_sheets` (`kind=ods`). Hash `tipo:competencia`. Abas `margens-mes`, `margens-cidade`, `vendas-produto` na seção **Vendas** do menu. Cidade: slot `2026-09` matriz; tela sem seletor de mês.

25. Venda por produto (Schumacher): `tipo` `venda_produto` depois do livro e antes da planilha padrão. Exige abas `matriz 01` e `filial 01`. Pack `vendaProduto` no mesmo `FiscalMonth` da Matriz (ao lado do livro) e em slots novos da Filial. Margem = razão; a tela multiplica por 100. PMP do mês = linha TOTAL; PMP de Todas/trimestre = ponderado pelo total. Produtos iguais somam pelo código. Aba só no `company.tabs` da Schumacher (`vendas-produto`); `ALL_TABS` das outras empresas não inclui essa aba. Sem a chave, alerta “não inventamos valor”. Na lista, Total / Lucro líq. / Marg. líq. usam `td-val pos` (verde) se > 0 e `td-val neg` (vermelho) se < 0.
26. DRE / Balanço / Indicadores Schumacher: `tipo` `dre_schumacher` / `balanco_schumacher` depois de venda por produto e antes da planilha padrão. Só aba Comparativo; 8 parts na Matriz. DRE não passa por `normalize_dre_deducoes` (`kind=schumacher_comparativo`). Acumulado Jan–Ago da DRE é o da planilha. Balanço não tem códigos nem TOTAL somando meses; `build_balancete_por_mes` aceita `kind=schumacher_bp` com `linhas`. Indicadores: `backend/app/indicadores_schumacher.py` + `_slice`/`tab_payload` em `companies.py`; tela `IndicadoresSchumacher.tsx`. Denominador zero → N/D com aviso no modal. Diferença Ativo−Passivo de janeiro = lucro líquido da DRE do mês; em agosto a diferença de posição = lucro acumulado Jan–Ago. Seletor de unidade oculto em DRE, Balanço e Indicadores. Reimportar faz merge (não apaga livro nem `vendaProduto`).
27. Conciliação bancária não usa nem altera `FiscalMonth`, `ImportRecord`, `NfeLine`, Compras ou Vendas. A origem é exclusivamente o `.xlsx` bancário A:G ligado à empresa/unidade abertas.
28. Somente administrador cria prévia e confirma importação/substituição. Viewer com acesso à empresa e à aba consulta; outra empresa ou aba não autorizada recebe 403. Toda consulta fica restrita à versão `active` do slot empresa + unidade + banco + competência.
29. DRE EXITO mensal: `dre.linhas[].nivel` preserva a posição estrutural da planilha (`total` na primeira coluna; `detalhe` nas linhas recuadas). A UI comum não descarta linha por ausência de palavra-chave nem elimina o detalhamento que acompanha CMV ou subtotais. Para packs gravados antes de 2.10.3, a hierarquia é inferida pela ordem e pelo último grupo contábil reconhecido. Não exige reimportação e não altera os cálculos dos KPIs.
30. Árvore da DRE comum: a hierarquia `grupo → subtotal → detalhe` é derivada somente no frontend. Grupos iniciam expandidos e subtotais recolhidos; **Expandir** abre todos os níveis e **Recolher** restaura esse estado compacto. Receita Líquida, Lucro Bruto, resultados operacionais e Lucro Líquido permanecem como raízes sempre visíveis. Linhas sem filhos não recebem chevron. A interação usa botão semântico com `aria-expanded`, clique, Enter e Espaço. Não altera API, banco nem cálculos.
31. Excluir empresa é operação exclusiva do administrador e exige abrir o menu de **três pontos** no card: **Excluir empresa** → **Confirmar exclusão**. A API remove dados fiscais e bancários, meses, notas, importações, CNPJs/unidades e vínculos em uma única transação; contas de usuário permanecem. Em erro, há rollback e nenhum dado fica parcialmente removido. Um tombstone guarda somente identificador, administrador e data da exclusão para auditoria e para impedir recriação pelo seed; não guarda nome, CNPJ nem valores. Não há restauração pela interface.

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

1. Cadastrar empresa em **Nova empresa**. Informe o nome e o CNPJ principal; em **Outros CNPJs**, use **Adicionar outro CNPJ** e preencha um nome próprio para cada unidade. Nomes e CNPJs não podem se repetir dentro do dashboard.
2. Abrir dashboard → **Importar planilhas**.
3. Subir o `.xlsx` padrão (mesmo esqueleto todo mês). Se o arquivo já trouxer `ENTRADAS`/`SAÍDAS`, Compras e Vendas saem dele; senão, subir também o EXITO de Entradas **ou** o **Relatório de entrada por fornecedor**.
4. Conferir preview (ok / vazia / ignorada) → **Gravar**.
5. Em **Planilhas importadas** (mesma aba, só administrador), cada arquivo gravado mostra data, mês, unidade e tipos. **Excluir** abre a confirmação dentro do próprio card daquela planilha (Cancelar / **Excluir planilha**); Cancelar devolve o botão Excluir. Sai só o que aquela planilha entrou; outro arquivo do mesmo mês permanece. Na reimportação, **Gravar** mescla tipos novos e **Substituir tipos enviados** troca somente os tipos listados na prévia, sem apagar as outras planilhas do mês.
6. Selecionar mês no chip superior; conferir DRE, Balancete, **Memória** (livro linha a linha), Impostos, Compras, Vendas. A barra lista os trimestres em ordem de calendário (ex.: 1º–4º de 2025, depois 1º–3º de 2026); com dois anos importados, o chip do trimestre traz o ano (**1º Trim 2025**). Para o **total somado do trimestre**, clique no chip do trimestre (não no mês): aí aparece a faixa de 4 KPIs (vendas, compras, saldo, imposto), **exceto** na Indústria Schumacher, onde a faixa não é montada. No chip de mês essa faixa não aparece.

**Trocar e gerenciar unidades:** dentro do dashboard, escolha a unidade no seletor superior; o cabeçalho mostra o nome e o CNPJ correspondentes. Em **Todas as unidades**, informa **CNPJs consolidados**. Para fazer o manejo, o administrador volta ao seletor, abre os **três pontos** → **Gerenciar unidades e CNPJs**. Pode adicionar outro CNPJ e salvar nome/CNPJ de uma unidade vazia. Quando já existem dados fiscais ou bancários, o nome continua editável, mas trocar o CNPJ ou remover a unidade é bloqueado para não separar dados históricos. A empresa principal não pode ser alterada ou removida nessa tela.

**Excluir uma empresa inteira (somente administrador):** no seletor de dashboards, abra os **três pontos** no canto superior do card e clique em **Excluir empresa**. Confira o aviso e use **Confirmar exclusão**; **Cancelar** mantém tudo. A confirmação apaga definitivamente todos os dados fiscais e bancários, planilhas, meses, notas, CNPJs/unidades e acessos vinculados à empresa. As contas de usuário continuam cadastradas, mas deixam de acessar essa empresa. A empresa some do seletor e não volta após o seed. A recuperação depende de backup do banco.

**DRE EXITO em árvore:** abra **Financeiro → DRE** e escolha a competência no seletor superior. Os grupos principais já aparecem abertos; clique no nome ou no chevron de um subtotal, como **Despesas Administrativas**, para mostrar as contas detalhadas. Use **Expandir** para abrir todos os níveis e **Recolher** para voltar ao estado compacto. Resultados como Receita Líquida, Lucro Bruto e Lucro Líquido permanecem visíveis. Meses já importados recebem a mesma organização automaticamente, sem nova importação.

**Única — DRE Análise Vertical (jan–jun/2026):** login `unica` → Importar → selecionar `Análise Vertical do D. R. E.xls` → preview deve listar **6** linhas `dre` (2026-01 … 2026-06) com `ok` → **Gravar** para acrescentar a DRE; se estiver corrigindo uma DRE já gravada, **Substituir tipos enviados** → conferir aba **DRE** em cada chip de mês. Em jan/2026 a planilha não traz lucro operacional → KPI de lucro líquido / ML fica N/D.

**Única — Balancete EXITO (fev–mai/2026):** login `unica` → Importar → selecionar os quatro `Balancete *UNICA.xls` de uma vez (ou um por um) → preview: cada linha `balancete` / competência `2026-02`…`2026-05` / `ok`, sem errors → **Gravar** para acrescentar o Balancete; se estiver corrigindo um já gravado, **Substituir tipos enviados** → aba **Balancete**: selecione um mês para ver somente aquela coluna, um trimestre para comparar apenas os meses importados daquele trimestre ou **Geral** no card para ver todas as competências importadas. Ativo/Passivo/Resultado seguem a tabela §3.5. Pode misturar no mesmo lote com a Análise Vertical e os workbooks padrão.

**Única — meses 01 a 07/2026 (workbook):** login `unica` → Importar → selecionar os arquivos `Planilha Padrão DASBORADS - UNICA MM2026.xlsx` (pode subir vários meses de uma vez) → conferir no preview: `entradas` com Δ 0,00, `saidas` com aviso de Total Geral, `dre`/`balancete` como `vazia` fora de janeiro (use a Análise Vertical para DRE real), `IRPJ`/`CSLL` como `ignorada` → **Gravar** para permitir o merge → conferir **Compras**, **Vendas**, **Impostos** e **Memória** em cada mês.

**Única — julho 2026 (reimport):** subir **os dois** arquivos de Downloads (fiscais ~61 KB + movimento parcial ~370 KB). Preview do parcial deve listar `entradas`/`saidas` ok + impostos; aviso de workbook parcial sem DRE/BAL. Depois de gravar, conferir **Compras** e **Vendas**. **Impostos/Memória:** A recolher PIS/COFINS é a coluna do RESUMO; o resultado do mês (débito − crédito) aparece como **Resultado do mês** (3.699,88 / 17.041,86). **Finalidade** mostra o bloco Serviços Tomados (CFOPs 1-933 / 2-933 / 2-353 etc.).

**Recebimentos/Pagamentos — conciliação bancária:** selecione uma unidade específica e abra a aba. Administrador: **Importar planilha** → escolher `.xlsx` → **Validar e gerar prévia** → conferir banco, competência, totais e linhas → **Gravar importação**. Se o banco/mês já existir, marque a confirmação e use **Substituir banco/mês**. Todos os usuários autorizados podem escolher banco/mês, clicar em uma Classificação Êxito para filtrar, buscar histórico/nota, filtrar datas e paginar. O seletor global de trimestre não controla esta aba.

**Finalidade — Serviços Tomados:** após os KPIs/gráficos gerais, painel com total de serviços, ISSQN, transporte e comunicação; empty state se não houver CFOP de serviço. Macro doughnut inclui fatia **Serviços** (separada de Outros).

**Memória / Impostos — ST:** quando houver `porUfSt`, o card ICMS ST lista o detalhe por UF (BA, DF, GO, MG…). Na planilha padrão a aba `ST` é só UF/VALOR: o sistema mostra a soma como Importado/Apurado. Se o contador disser que **não é o valor pago**, pedir **Demonst. SUBTRI** / guia — não “corrigir” o número na mão.

**Memória:** depois de gravar a planilha padrão, abra **Memória de Cálculo**. No topo: cards detalhados + **Resumo Consolidado**; abaixo, **Ver livro técnico** abre 5005 / PIS/COFINS / ST etc. Nos cards PIS/COFINS, **A recolher** é a coluna do RESUMO; se houver saldo credor acumulado, **Resultado do mês** mostra só débito − crédito.

**Impostos:** KPIs no topo mostram vendas, total de impostos e **% sobre vendas**; cada card de tributo repete `% s/ vendas` quando há aRecolher e faturamento. Isso vale para Única, Baifer, JPG, Egaplast e Loja das Máquinas. A Indústria Schumacher, quando o mês tem livro de apuração, mostra os cards de débitos/créditos/a recolher/saldo credor/a transportar em vez desses 4 KPIs.

**Indústria Schumacher:** login `schumacher` → Visão Geral (cards + tabela, sem gráfico) → **Vendas por produto** (mês no seletor já usado em Impostos; unidade Matriz, Schumacher Serviços ou Todas) → Impostos (cards do livro, evolução e rosca) → **Ver memória de cálculo**. **DRE:** chip de mês destaca a coluna; grupos abrem com clique na linha (contagem, % da RB, filhas e **Soma do grupo**); 1º/2º Trim recorta os três meses e soma os KPIs em R$; Acumulado Jan–Ago continua a do arquivo. **Balanço Patrimonial:** Ativo à esquerda e Passivo+PL à direita no mês do chip; clique na linha do grupo (ex. ATIVO CIRCULANTE) para ver as contas, a contagem e o percentual; **Expandir** / **Recolher** e a busca por conta no card. No trimestre, o corpo é o último mês e a faixa mostra os três fins. **Indicadores:** dez cards (resultado + liquidez) refletem o mês ou trimestre do chip; **clique no card** expande a memória de cálculo inline; botão **!** abre o mesmo detalhe em modal (fórmula, leitura e passos). A seção **C · Evolução** mostra o ano importado (`porMes`): margem bruta %, margem líquida % e as quatro liquidez em linhas (dois eixos). Trocar o chip atualiza os cards, não apaga os outros meses do gráfico. Nestas três abas o seletor de unidade some. Em **Memória:** cards no topo (ICMS, IPI, PIS, COFINS com as linhas do livro; ICMS ST, IRPJ e CSLL **Em apuração**) + **Resumo Consolidado**; **Ver livro técnico** abre ICMS/IPI/PIS/COFINS com Resumo, Entradas/créditos, Saídas/débitos e Conferência. Abr/2026 mostra outros débitos de ICMS no card. O menu **não** tem Compras nem a Vendas de nota. O chip **1º Trim** / **2º Trim** soma o livro e o cabeçalho mostra “· Soma …”, mas **não** exibe a faixa `TrimestreBlock` (Vendas/Compras/Saldo/ICMS). Em **Vendas por produto:** quatro KPIs + **Ver mais métricas**; maiores vendas com barra de participação; lista completa abaixo (filtros, Part., detalhe em grid); gráfico Jan–Ago. Margem na tela = razão × 100. Na lista, Total / Lucro líq. / Marg. líq. ficam verdes se positivos e vermelhos se negativos (zero, código, nome, qtde e custo sem cor de sinal). Filial em Impostos continua sem planilha.

**Balancete / DRE / Indicadores:** use o chip do header. No **Balancete comum**, mês mostra só a competência escolhida; trimestre mostra os Balancetes importados daquele trimestre; o botão **Geral** dentro do card alterna entre o recorte selecionado e todos os meses importados do ano. Ao trocar o período no header, Geral é desativado. TOTAL só aparece quando há mais de uma coluna. Expandir/Recolher controla a árvore; busca e filtro de grupo restringem as contas. Na **Schumacher**, abra **Indicadores** na seção lateral homônima (fora de **Financeiro**, onde ficam só Balanço e DRE). A aba usa DRE + Balanço comparativo (não movimento NF); cards pelo chip (clique expande; **!** abre modal), gráfico anual na seção C. Demais empresas: **Indicadores** continua dentro de **Financeiro**; tela genérica; patrimoniais N/D sem Balancete EXITO.

**Vendas — exportar:** com o mês importado aberto, use **Exportar PDF** ou **Exportar Excel** (resumo + UF + CFOP + clientes). **Excel CPF/CNPJ detalhado** gera três abas (Resumo %, Clientes, Linhas NF). Os cards **Vendas CPF** e **Vendas CNPJ** mostram R$ e %; sem vendas no mês ficam `—`.

**Finalidade — exportar:** **Exportar PDF** / **Exportar Excel** do quadro macro e da lista completa de CFOPs (o Excel inclui fornecedores por CFOP). O botão **Por Fornecedor** segue gerando o relatório filtrado no modal.

**Qualquer empresa — planilha padrão do mês:** cadastrar a empresa (se ainda não existir) → login dela → dashboard aberto → **Importar** → arquivo cujo nome termina em `MMYYYY` (ex. `… 082026.xlsx` = agosto/2026; no mês seguinte, `092026`). A empresa gravada é a do dashboard, não o texto do nome. No preview: DRE e Balancete ficam `ok` só se a coluna daquele mês tiver número; coluna vazia fica `vazia` e o janeiro do modelo não entra. ICMS 5005 **ou** ICMS simples, PIS/COFINS, ST, DIFAL e IPI aparecem só quando a aba tem valor. IRPJ/CSLL só se a aba existir e o CNPJ for o da empresa aberta. Sem ENTRADAS/SAÍDAS, Compras e Vendas não mudam com esse arquivo (use o relatório EXITO de entradas/saídas com o CNPJ dela). Use **Gravar** para acrescentar dados e **Substituir tipos enviados** somente ao corrigir os tipos que aparecem na prévia.

**Baifer — planilha padrão (exemplo):** mesmo fluxo acima com login `baifer` e arquivo `Planilha Padrão DASBORADS - BAIFER MMYYYY.xlsx`.

**Baifer — entradas ago/2026:** login `baifer` → dashboard Baifer → Importar → `Relatorio de entrada por fornecedor 082026 BAIFER.xls` → preview `entradas` / `2026-08` / Δ 0 → Gravar → aba **Compras** total R$ 377.506,76. Use este arquivo quando a planilha padrão do mês não trouxer a aba ENTRADAS.

**Loja das Máquinas — planilha padrão (exemplo):** login `loja-maquinas` → Importar o `… LOJA DAS MAQUINAS MMYYYY.xlsx` (aba `ICMS` sem 5005) + entradas/saídas EXITO do mês, se houver.

Login seed: `admin`, `baifer`, `egaplast`, `loja-maquinas`, `unica`, `jpg`, `schumacher` (senhas no `.env`).

**JPG — filiais:** login `jpg` → seletor mostra **um** card JPG → `/dashboard/jpg/visao-geral`. No header, o dropdown lista Matriz Sede, Filial PR/SP/MG, Filial Asa Sul DF, **LANNIC Dermocosméticos** e **Todas as unidades**. Movimento acumulado (`01-2026 a 08-2026`) precisa ser separado por mês (`split_movimento_mensal.py`) antes de Importar; impostos de filial (demonstrativo ICMS/IPI com uma aba por mês) podem ir inteiros — o sistema grava cada mês na unidade do CNPJ/arquivo. Conferir Compras/Vendas/Impostos **da unidade escolhida**; Todas só soma leitura. A JPG **não** importa planilha 5005: textos da Memória/Importar falam só de ICMS/IPI EXITO.

**JPG — IPI crédito:** após reimportar o IPI da filial, meses com saldo credor (ex. Asa Sul **Ago/2026**, R$ 1.914,98) mostram chip **Saldo credor** em Impostos/Memória e, se não houver ICMS no mês, KPI **Crédito IPI** na Visão Geral. Sem ICMS no mês, o KPI do topo usa **IPI a Recolher** ou **Crédito IPI**.

**JPG — IRPJ/CSLL da Matriz:** login `jpg` → unidade **Matriz Sede**. Chip **Mar/2026** (1º trimestre) e **Jun/2026** (2º trimestre): aba Impostos card IRPJ/CSLL e Memória com o livro. O chip de trimestre soma o valor do último mês. Use **Gravar** (`scripts/import_jpg_irpj_csll.py` ou aba Importar).

**JPG — LANNIC:** no dropdown escolha **LANNIC Dermocosméticos**. Meses **Mai–Jul/2026**: só Compras/Vendas (sem PGDAS). **Ago/2026**: Visão Geral receita 478.335,06 e KPI **DAS a Recolher** 28.398,35; Impostos card Simples Nacional; Memória com saídas PGDAS 557.733,52 e devoluções 79.398,46 (sem linha Base memória) + partilha; Compras 451.739,03 e Vendas 893.349,52 (NFs do Excel). DRE/Balancete vazios. Split: `python scripts/split_movimento_mensal.py` nos `144-Entradas`/`144-Saídas`; gravar com `import_jpg_lote.py` **sem** `--replace`. Fonte: `pasta temporaria/Nova pasta`.
