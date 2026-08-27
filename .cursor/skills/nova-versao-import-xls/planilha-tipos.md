# Tipos de planilha — detecção, parser e pack

Código: `nova-versao/backend/app/extract/`. Entrada única: `classify_and_extract(path)`.

## Tabela resumo

| tipo | Detecção (`detect_sheet_tipo`) | Parser | Chaves principais no pack |
|------|-------------------------------|--------|---------------------------|
| `entradas` | aba/nome `entrada`; cabeço `Total Fornecedor` | `parse_movimento` + `merge_entradas` | `totalCompras`, `cfopDados`, `fornecedores`, `porUf` |
| `saidas` | aba `saída/saida`; cabeço `Total Cliente` | `parse_movimento` + `merge_saidas` | `cfopSaidasTotal`, `receitaBruta`, `clientes`, `porUfSaidas` |
| `icms` | `DEMONSTRATIVO DO ICMS`; filename `apura`+`icms` | `parse_demonstrativo_icms` | `apuracao.icms` |
| `apuracao_5005` | filename `5005` **ou** labels `DÉBITO ORIGINAL` + `DEBITOS 5005` | `parse_memoria_5005` | `memoriaCalculo`, `apuracao.icms.aRecolher`, `apuracao.subvencao` |
| `ipi` | `DEMONSTRATIVO DO IPI` | `parse_demonstrativo_ipi` | `apuracao.ipi` |
| `pis` | cabeço/aba PIS; EFD | `parse_demonstrativo_pis_cofins` | `apuracao.pis` |
| `cofins` | aba COF; cabeço COFINS | idem | `apuracao.cofins` |
| `pis_cofins` | 2+ abas pis+cof no mesmo arquivo | merge pipeline | `apuracao.pis` + `apuracao.cofins` |
| `icms_st` | `ST MENSAL`, filename `st ` | `parse_st_mensal` | `apuracao.icmsSt`, `porUfSt` |
| `dre` | filename `resultado`/`dre` | `parse_dre` | `dre`, `hasDre`, margens |
| `impostos` | tabela Empresa/Filial/Mês (JPG layout) | `parse_impostos_icms_ipi` | `impostos`, `apuracao` da linha do mês |
| `irpj` | filename `irpj`/`csll` | placeholder | `irpj` estrutural |
| `desconhecido` | nenhum match | — | error |

## Competência

### Funções

- `scan_period(grid)` — `Período: DD/MM/YYYY até DD/MM/YYYY` ou `Competência: DD/MM/YYYY`
- `competencia_from_filename(name)` — `MMYYYY`, `MM-YYYY`, trimestre, nome mês
- `period_span_months(grid)` — se > 1 → `is_multi_month_movimento` → **RANGE_ERROR**

### Padrões de filename

| Padrão | Exemplo | Resultado |
|--------|---------|-----------|
| MMYYYY | `072026` | `2026-07` |
| MM-YYYY | `Entradas 07-2026.xls` | `2026-07` |
| Apuração | `Apuração icms 012026.xls` | `2026-01` |
| Trimestre | `1º trimestre 2026` | `2026-03` (último mês do tri) |
| Mês por extenso | `janeiro 2026` | `2026-01` |

### Multi-mês (rejeitar movimento)

- Filename: `Janeiro a Março 2026`
- Período cabeçalho: `01/01/2026 até 31/03/2026`
- Mensagem: `Planilha cobre mais de um mês. Envie um arquivo por competência.`

Impostos/DRE podem ter competência herdada do lote no preview.

---

## Entradas / Saídas

Ver [layout-exito.md](layout-exito.md).

Validação:

```python
delta = soma(linhas detalhe) - Total Geral
|delta| < 0.02
```

Linha detalhe: coluna código = número inteiro (não `Total Fornecedor`, não cabeçalho).

Pack meta espelha extract:

```python
entradasMeta / saidasMeta: {
    "totalGeralExcel", "soma", "delta", "company", "cnpj", "period", "parser"
}
```

---

## ICMS — Demonstrativo EXITO

### Detecção

- Cabeçalho linhas 1–8: `DEMONSTRATIVO DO ICMS`
- Ou aba `Demonst. ICMS MM-YYYY (M)`
- Ou filename `Apuração icms MMYYYY.xls` (sem ST)

### Linhas lidas (`parse_demonstrativo_icms`)

Bloco **APURAÇÃO** (preferencial):

| Label (normalizado) | Uso |
|---------------------|-----|
| `ICMS a recolher` | `aRecolher` positivo |
| `Saldo credor de ICMS para o mês seguinte` | se recolher ≈ 0 → `aRecolher = -credor` |
| `Total de débitos` / `Total de créditos` | composição |
| `Débitos pelas saídas` | `apurado` (base composição) |
| `Saldo credor do período anterior` | meta |

**Não** usar débito bruto de saídas como imposto quando há saldo credor.

### Filename típico

`Apuração icms 012026.xls` … `072026.xls`

---

## APURAÇÃO 5005 — Memória de Cálculo (padrão Baifer)

Fonte oficial do **ICMS a recolher** e da aba **Memória de Cálculo** na Baifer (Decreto 5005). Preferir estes valores sobre o demonstrativo ICMS quando os dois forem importados.

### Detecção (`detect_sheet_tipo` — prioridade alta)

- Filename contém `5005` (ex. `012026 APURAÇÃO 5005.xlsx`)
- Ou labels nas primeiras linhas: `DÉBITO ORIGINAL` + (`DEBITOS 5005` ou `CREDITO OUTORGADO`)

### Sem CNPJ

Planilha não traz CNPJ/razão. No preview:

1. Abrir o dashboard da empresa (ex. Baifer) → aba Importar
2. `company_id` do FormData herda a empresa aberta
3. Warning esperado: `APURAÇÃO 5005 sem CNPJ — a empresa aberta no dashboard será usada ao gravar`

### Competência

Só no **nome do arquivo** (`MMYYYY` / `MM-YYYY`). O upload usa tempfile; a API passa `original_filename` para `classify_and_extract`.

| Exemplo | Competência |
|---------|-------------|
| `012026 APURAÇÃO 5005.xlsx` | `2026-01` |
| `072026-apuracao-5005.xlsx` | `2026-07` |

### Labels → pack (`parse_memoria_5005`)

| Label planilha | Campo `memoriaCalculo` |
|----------------|------------------------|
| DÉBITO ORIGINAL | `debitoOriginal` |
| CREDITO ORIGINAL | `creditoOriginal` |
| TOTAL (1º bloco) | `totalOriginal` (se `0` e há débitos/créditos → soma) |
| DEBITOS 5005 | `debitos5005` |
| CREDITOS 5005 | `creditos5005` |
| TOTAL (2º) | `total5005` |
| DÉBITO FORA | `debitoFora` |
| CREDITO FORA | `creditoFora` |
| CREDITO OUTORGADO | `creditoOutorgado` |
| TOTAL (3º) | `totalFora` |
| ICMS A RECOLHER | `icmsARecolher` → também `apuracao.icms.aRecolher` |
| GANHO RECEITA DE SUBVENÇÃO | `ganhoReceitaSubvencao` → `apuracao.subvencao` |

### Filename típico

`MMYYYY APURAÇÃO 5005.xlsx` (Baifer mensal).

Fixture CI: `fixtures/baifer-padrao/012026-apuracao-5005.xlsx`  
Testes: `tests/test_apuracao_5005.py`

### Relação com Demonstrativo ICMS

| Fonte | Uso |
|-------|-----|
| APURAÇÃO 5005 | Memória UI + **ICMS a recolher** Impostos + subvenção |
| Demonstrativo ICMS | Composição / debitos / créditos do demonstrativo; se importar depois da 5005, `deep_merge` pode sobrescrever `aRecolher` — para Baifer, **reimportar 5005 por último** ou só 5005 para o valor oficial |

---

## IPI — Demonstrativo

| Label | Campo |
|-------|-------|
| `Total de débitos` | debitos |
| `Total de créditos` | creditos |
| `Saldo devedor de IPI` | `aRecolher` |

---

## PIS / COFINS

### Dois layouts

1. **Demonstrativo da Apuração** (Baifer, regime não cumulativo)
2. **Consolidado EFD** — `Total Imposto` (Egaplast legacy no mesmo parser)

`parse_demonstrativo_pis_cofins` escolhe via `is_demonstrativo_apuracao_pis_cofins`.

### Regime não cumulativo — labels oficiais

| Label | Campo |
|-------|-------|
| `Valor Total da Contribuição Não Cumulativa Apurada no Período` | `apurado` |
| `Valor da Contribuição Não Cumulativa a Recolher` | **`aRecolher`** |
| `Total do Crédito para o Período Seguinte` | `credito` |
| `Saldo devedor da Contribuição PIS/PASEP` (ou COFINS) | `saldoDevedor` |

**Não** usar linha “com Diferimento” como recolher.

### Regime cumulativo (Egaplast)

| Label | Campo |
|-------|-------|
| `Valor Total da Contribuição Cumulativa Devida` | apurado |
| `Valor da Contribuição Cumulativa a Recolher` | aRecolher |
| `51.Contribuição Cumulativa Apurada a Alíquota Básica` | fallback apurado |

### Arquivo combinado (2 abas)

Filename: `Apuração pis e cofins MMYYYY.xls`

- Aba 1: `Demonstrativo de Apuração - PIS` → tipo `pis`
- Aba 2: `Demonstrativo de Apuração - COF` → tipo `cofins`

Pipeline:

1. `load_all_sheets`
2. `_extract_pis_cofins_sheets` filtra abas pis/cofins
3. Se ≥1 aba → branch especial (ignora detect da aba 1 só)
4. `tipo` final: `pis_cofins` se ambos presentes
5. Dedupe: se 2 abas mesmo tributo, fica a de maior `|aRecolher|+|apurado|`

### Arquivos separados

Um `.xls` só PIS ou só COFINS → `tipo` = `pis` ou `cofins` (fluxo normal aba 1).

---

## ICMS ST

- Filename: `ST …`, `ST MENSAL`
- Cabeço: UF + VALOR
- CNPJ pode faltar → warning ST; empresa do dashboard no commit

---

## Impostos (tabela anual JPG/Egaplast)

Layout: colunas Empresa, Filial, Mês, ICMS a recolher, IPI…

- `parse_impostos_icms_ipi`
- Competência pode ser inferida da última coluna mês na tabela
- Unidade ajustada para filial com valor se matriz zerada

Usado quando **não** é demonstrativo ICMS mensal.

---

## DRE / RESULTADO

- Estrutura de linhas gravada em `pack.dre`
- Se export sem números → warning; margens N/D
- IRPJ/CSLL: placeholder até calibração

---

## Nomes de arquivo confusos (EXITO real)

| Filename enganoso | Tipo real |
|-------------------|-----------|
| `Entradas por Cliente.xls` | **saidas** |
| `Apuração pis e cofins 012026.xls` | **pis** + **cofins** (2 abas) |
| `Entradas 01-2026.xls` | **entradas** |
| `Demonst. ICMS 06-2026 (M)` | **icms** |

Sempre validar com `load_all_sheets` + `detect_sheet_tipo` por aba.

---

## Ordem sugerida de import por mês

1. Entradas
2. Saídas
3. ICMS, IPI, PIS/COFINS, ST (qualquer ordem — merge)
4. DRE (se houver)

Todos no **mesmo** preview/commit ou commits separados — merge acumula no mesmo `FiscalMonth`.
