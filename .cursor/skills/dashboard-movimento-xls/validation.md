# Validação — movimento mensal

Não avançar para patch se qualquer assert de extract falhar.

## Extract (por empresa × competência)

| # | Assert | Critério |
|---|--------|----------|
| 1 | Empresa | Razão do cabeçalho casa com regex/CNPJ de `companies.md` |
| 2 | Tipo | `entradas`/`saidas` bate com a aba, não com o filename |
| 3 | Período | Mês/ano da competência pedida (ex. contém `07/2026`) |
| 4 | Total entradas | `|somaEntradas − TotalGeralExcel| < 0.02` |
| 5 | Total saídas | `|somaSaidas − TotalGeralExcel| < 0.02` |
| 6 | CFOP entradas | `sum(cfop.total) == totalCompras` |
| 7 | CFOP saídas | `sum(cfop.total) == cfopSaidasTotal` |
| 8 | Partes no CFOP | para cada CFOP com fornecedores/clientes: soma = total do CFOP |
| 9 | NFs | `nfsEntradas > 0` e `nfsSaidas > 0` |
| 10 | Pack | `pack.totalCompras` / `pack.cfopSaidasTotal` = somas |

## Dashboard (após patch)

| # | Assert | Critério |
|---|--------|----------|
| 1 | Mês existe | chave `MM` ou `YYYY-MM` presente no objeto fiscal |
| 2 | Totais | batem com JSON intermediário (±0.02) |
| 3 | NFs | batem com extract |
| 4 | Meta | `meta.meses` inclui o mês; `defaultMonth` apontando para o mês novo (quando o dashboard usa) |
| 5 | Regressão | totalCompras do mês imediatamente anterior **inalterado** |
| 6 | Syntax | todos os `<script>` inline passam em `vm.Script` |
| 7 | UI | seletor/mes-bar lista o mês (e Q3 se MM ≥ 07 em Baifer/Egaplast/Loja) |

## Smoke HTTP (quando `npm start` estiver up)

Porta padrão: `4243`.

Para cada empresa afetada:

1. POST `/auth/login` com user da empresa
2. GET da rota do dashboard
3. Body contém strings dos totais (compras e vendas) e marca do mês (`Jul` / `"07"` / `2026-07`)

## Comandos modelo (Jul/2026)

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/_export-jul2026-xls.ps1
node scripts/_extract-jul2026-movimento.js
node scripts/_validate-jul2026-extract.js
# só se validate extract OK:
node scripts/_patch-jul2026-dashboards.js
node scripts/_validate-jul2026-dashboards.js
node scripts/_smoke-jul2026.js
node scripts/_smoke-jul2026-auth.js
```

Para nova competência: copiar esses scripts trocando `jul2026` / `07` / `2026-07` e a pasta `relatorios/<comp>/`.

## Falhas comuns

| Sintoma | Causa | Ação |
|---------|-------|------|
| CNPJ vazio no raw | célula mesclada | validar por razão social + CNPJ esperado |
| Δ total grande | somou linha `Total Fornecedor` | filtrar só código numérico |
| UI sem mês | Baifer/Ega sem `porMes[MM]` ou sem Q3 no seletor | patch unidades + UI |
| Totais OK, impostos vazios | sem demonstrativo | esperado; documentar pendência |
| Rebuild apagou mês | `build-dashboards-ejs.js` | reaplicar patch nos EJS |
