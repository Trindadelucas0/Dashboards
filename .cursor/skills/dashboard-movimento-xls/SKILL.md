---
name: dashboard-movimento-xls
description: >-
  Extrai planilhas EXITO de entradas/saídas (.xls), identifica a empresa pelo CNPJ
  do cabeçalho, valida totais e injeta o mês no dashboard EJS correto. Use quando
  o usuário enviar planilhas de movimento, arquivos Entradas/Saídas, competência
  MMYYYY (ex. 072026), Unica, Egaplast, Loja das Máquinas, Baifer, ou pedir para
  adicionar/atualizar dados fiscais mensais nos dashboards.
---

# Dashboard Movimento XLS

Fluxo obrigatório para importar planilhas mensais de movimento no projeto Dashboards.

**Não confie no nome do arquivo.** Empresa e tipo (entrada/saída) vêm do cabeçalho e da aba.

## Checklist (copiar e marcar)

```
- [ ] 1. Mapear arquivos por CNPJ + tipo real da aba
- [ ] 2. Exportar raw das planilhas
- [ ] 3. Agregar packs por empresa/competência
- [ ] 4. Validar extract (Δ Total Geral = 0; CFOP consistente)
- [ ] 5. Patch nos EJS + UI do mês/trimestre
- [ ] 6. Validar dashboards embutidos + regressão mês anterior
- [ ] 7. Smoke syntax + login HTTP (se servidor disponível)
- [ ] 8. Entregar totais e pendências
```

Falhou o passo 4 → **não** patchar EJS.

## Passo 1 — Separar empresas

1. Abrir cada `.xls` e ler linha 1 (razão), CNPJ e período.
2. Mapear pelo registro em [companies.md](companies.md).
3. Tipo real:
   - aba `Entradas` → entradas (por fornecedor)
   - aba `Saídas` / `Saídas` → saídas (por cliente), mesmo se o nome do arquivo disser "Entradas por Cliente"
4. Gravar `relatorios/<competencia>/mapeamento.json` (`competencia` = `YYYY-MM`, ex. `2026-07`).

Competência no arquivo costuma ser `MMYYYY` no nome (`072026` = Jul/2026).

## Passo 2 — Extrair

Layout de colunas: [layout-exito.md](layout-exito.md).

Scripts de referência (generalizar para a competência pedida; os de Jul/2026 são o modelo):

| Etapa | Script modelo |
|-------|----------------|
| Export Excel → JSON raw | `scripts/_export-jul2026-xls.ps1` |
| Agregar packs | `scripts/_extract-jul2026-movimento.js` |
| Validar extract | `scripts/_validate-jul2026-extract.js` |
| Patch EJS | `scripts/_patch-jul2026-dashboards.js` |
| Validar EJS | `scripts/_validate-jul2026-dashboards.js` |
| Smoke | `scripts/_smoke-jul2026.js`, `scripts/_smoke-jul2026-auth.js` |

Regras de agregação:

- Somar só linhas detalhe (código numérico na col 1); ignorar `Total Fornecedor` / `Total Cliente` / cabeçalhos / rodapé.
- Total oficial = valor contábil na linha **após** `Total Geral`.
- `|soma detalhe − Total Geral| < 0,02` por arquivo.
- NFs = chaves únicas `(nota|série)`.
- Entradas → CFOP + `fornecedores[]`; saídas → CFOP + ranking de clientes.
- Impostos/DRE/Apuração/EFD: se não houver planilha, deixar pendente (`null`/`0` / `hasDre: false`). **Não inventar imposto.**

## Passo 3 — Onde injetar

Ver tabela completa em [companies.md](companies.md).

Resumo:

| Empresa | Arquivo | Chave do mês |
|---------|---------|--------------|
| Unica | `src/views/UNICATINTAS.ejs` | `fiscalPorMes["MM"]` |
| Egaplast | `src/views/egaplast.ejs` | `unidades.matriz` + `consolidado` → `porMes["MM"]` |
| Loja | `src/views/loja-maquinas.ejs` | `FISCAL_POR_MES["YYYY-MM"]` + arrays `MONTH_*` |
| Baifer | `src/views/baifer2trm.ejs` | `unidades.consolidado.fiscalPorMes.porMes["MM"]` |
| JPG | `src/views/jpg.ejs` | `JPG_DATA.fiscalPorMes.porMes["YYYY-MM"].filiais["PR"|"MG"|"SP"|"MATRIZ"]` |

Também atualizar:

- `meta.meses` / `monthLabels` / `defaultMonth` / `periodoTotal`
- Labels UI `Jan–…` até o mês novo
- Seletor / mes-bar / trimestres (Q3 para Jul+) se ainda não existir o mês

Preservar schema do mês anterior da mesma empresa (não inventar estrutura nova).

## Passo 4 — Validar (obrigatório)

Checklist detalhado: [validation.md](validation.md).

Mínimo:

1. Empresa do cabeçalho casa com CNPJ esperado
2. Δ entradas/saídas vs Total Geral = 0 (±0,02)
3. `soma(CFOP) == total` e `soma(fornecedores/clientes do CFOP) == CFOP`
4. Pack no EJS bate com JSON intermediário
5. Mês anterior (ex. 06) sem regressão de totais
6. `vm.Script` nos `<script>` embutidos sem erro de sintaxe

## Passo 5 — Smoke

```bash
node scripts/_validate-<comp>-extract.js
node scripts/_validate-<comp>-dashboards.js
npm start   # porta 4243
# login por empresa e conferir compras/vendas do mês no HTML
```

## Escopo / fora de escopo

**Dentro:** movimento (compras, vendas, CFOP, fornecedores, clientes, NFs), meta/UI do mês.

**Fora (até o usuário enviar):** DRE, balancete, Apuração 5005, EFD PIS/COFINS, impostos.

**Atenção:** `scripts/build-dashboards-ejs.js` pode sobrescrever EJS a partir de HTML externos — preferir patch direto no EJS servido e avisar esse risco.

## Entrega

Usar o formato da skill `final-response-format`:

- O que foi feito (mapa arquivo→empresa + totais)
- Por que
- Como testar
- Riscos/pendências (impostos, filial ausente, rebuild)
- Próximo passo

## Recursos

- [companies.md](companies.md) — CNPJ, dashboard, unidade
- [layout-exito.md](layout-exito.md) — colunas EXITO
- [validation.md](validation.md) — asserts
