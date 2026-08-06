# Registro de empresas (movimento)

Identificação **sempre pelo CNPJ do cabeçalho**, nunca só pelo nome do arquivo.

| id | Razão (parcial) | CNPJ dígitos | Dashboard EJS | Unidade / observação |
|----|-----------------|--------------|---------------|----------------------|
| `unica` | UNICA COMERCIO ATACADISTA DE TINTAS | `36517206000130` | `src/views/UNICATINTAS.ejs` | único; pack em `DASHBOARD_DATA.fiscalPorMes["MM"]` |
| `egaplast` | EGAPLAST ARTEFATOS | `03185564000134` | `src/views/egaplast.ejs` | Matriz `37` → `unidades.matriz` + copiar movimento para `consolidado`. Filial `61` só se houver planilha própria |
| `loja` | LOJA DAS MAQUINAS | `13983066000190` | `src/views/loja-maquinas.ejs` | `FISCAL_POR_MES["YYYY-MM"]`; chave de mês diferente (`2026-07`) |
| `baifer` | BAIFER DISTRIBUIDORA | `52005382000140` | `src/views/baifer2trm.ejs` | `unidades.consolidado.fiscalPorMes.porMes["MM"]` (getPack lê `porMes`) |
| `jpg` | JPG - PRODUTOS FUNCIONAIS | ver filiais | `src/views/jpg.ejs` | `JPG_DATA.fiscalPorMes.porMes["YYYY-MM"].filiais[key]` — PR=`21051983000670` (81), MG=`…/0005-99` (90), SP=`…/0007-50` (82), ASA_SUL / Filial Asa Sul DF=`…/0003-27` (712, pasta `JPG\ASA SUL`), MATRIZ/Filial DF=`…/0003-27` (712, distinta na UI), SEDE/Matriz Sede=`…/0001-65` (711), LANNIC Dermocomestic=`48285395000142` (Simples Nacional — faturamento+DAS). Não confiar no nome da pasta (`ind`=Matriz DF; `matriz e filial`=SEDE). |

Rotas de autenticação (smoke):

| id | user / pass típicos | rota |
|----|---------------------|------|
| unica | `unicatintas` | `/auth/UNICATINTAS` |
| loja | `lojamaquinas` | `/auth/loja-maquinas` |
| egaplast | `egaplast` | `/auth/egaplast` |
| baifer | `baifer` | `/auth/baifer2trm` |
| jpg | `jpg` | `/auth/jpg` |

Credenciais em `src/data/users.json` (não expor na entrega ao usuário final se não precisar).

## Armadilhas de nome de arquivo

- `Entradas por Cliente ….xls` **pode ser SAÍDA** (já ocorreu com Baifer: aba `Saídas`).
- Arquivo sem nome da empresa no filename → abrir e ler CNPJ.
- `072026` no nome = competência `2026-07` (mês 07, ano 2026).
- Egaplast com código `37` = Matriz; `61` = Filial.

## Estrutura por dashboard

### Unica (`UNICATINTAS.ejs`)

- Atualizar `meta.meses`, `monthLabels`, `defaultMonth`, `periodoTotal`
- Injetar `fiscalPorMes["MM"]` com: `hasMovimentacao`, `hasDre`, `totalCompras`, `cfopSaidasTotal`, `nfsEntradas`, `nfsSaidas`, `cfopDados`, `cfopSaidas`, `fornecedores`, `clientes`, `clientesTop10`, `dtTintasTotal`
- Seletor: `Q2_MESES` já inclui meses `04–12` presentes em `meta.meses` (Jul entra no grupo “2º Trim” na UI Unica)

### Egaplast (`egaplast.ejs`)

- `unidades.matriz.fiscalPorMes.meses` + `porMes["MM"]`
- Idem `consolidado` (se só houver Matriz, consolidado = pack da matriz)
- Filial sem arquivo: mês vazio / zeros, não inventar movimento
- UI: `Q3_MESES` / `trimestres.q3` quando mês ≥ 07

### Loja (`loja-maquinas.ejs`)

- Arrays: `MONTHS`, `MONTH_KEYS`, `MONTH_LABELS_LONG`, `VENDAS`, `COMPRAS` (+ pad `null` em séries DRE/imposto se existirem)
- `FISCAL_POR_MES["YYYY-MM"]`
- HTML: `<select id="periodSel">` e `#mes-bar` precisam de botão/option do mês novo (`data-idx` = índice 0-based)
- `selectedMonthIdx` default = último mês

### Baifer (`baifer2trm.ejs`)

- Dados em `unidades.consolidado.fiscalPorMes.porMes["MM"]` (não só root flat)
- `meta.meses`, `trimestres.q3` para Jul+
- `getPack()` usa `porMes[state.month]` — sem isso a UI não mostra o mês
- UI: `Q3_MESES`, mes-bar, `monthSel`, supplier report period

## Novas empresas

Se aparecer CNPJ fora desta tabela:

1. Parar o patch
2. Confirmar com o usuário qual dashboard criar/usar
3. Só então estender este registro
