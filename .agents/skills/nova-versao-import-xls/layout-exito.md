# Layout planilha EXITO — movimento (Entradas / Saídas)

Formato `.xls` Excel legado. Leitura: xlrd → COM Excel → HTML fallback (`workbook.py`).

Parser: `parse_movimento.py` — detecta header dinâmico nas primeiras 40 linhas; fallback colunas fixas.

## Cabeçalho do relatório

| Linha ~ | Conteúdo |
|---------|----------|
| 1 | Código + razão social |
| 2 | `CNPJ:` + valor (pode vir vazio em export HTML — usar razão) |
| 3–5 | `Período:` ou `Competência:` |
| 6+ | Cabeçalho colunas + dados |

CNPJ: regex `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}` ou 14 dígitos após label CNPJ (`classify.scan_cnpj`).

## Relatório de entrada por fornecedor

Mesmo layout de Entradas, agrupado por fornecedor. Filename: `Relatorio de entrada por fornecedor MMYYYY.xls`. Cabeçalho traz dois `Código` (lançamento e código do fornecedor) e um `Valor` de ICMS depois de **Valor Contábil** — o parser usa o primeiro código e **Valor Contábil**.

## Entradas (aba Entradas)

### Colunas fallback (0-based) se header não detectado

| Campo | Índice col |
|-------|------------|
| Código lançamento | 0 |
| Nota | 5 |
| Série | 7 |
| Fornecedor | 10 |
| CNPJ/CPF | 12 |
| CFOP | 16 |
| UF | 18 |
| **Valor Contábil** | **19** |

### Colunas típicas EXITO (1-based referência legado)

| Campo | Col 1-based |
|-------|-------------|
| Código | 1 |
| Nota | 6 |
| Série | 8 |
| Fornecedor | 11 |
| CNPJ | 13 |
| CFOP | 17 |
| UF | 19 |
| Valor Contábil | 20 |

### CFOP

Formatos: `2-102`, `2.102`, número `2102` → normalizar `D-DDD` (`format_cfop`).

## Saídas (aba Saídas)

### Colunas fallback (0-based)

| Campo | Índice |
|-------|--------|
| Código | 0 |
| Nota | 4 |
| Série | 5 |
| Cliente | 11 |
| CNPJ | 15 |
| CFOP | 17 |
| UF | 21 |
| Valor Contábil | 22 |

Também tenta cols 22, 23 para valor se header ambíguo.

### Colunas típicas (1-based)

| Campo | Col |
|-------|-----|
| Nota | 5 |
| Série | 6 |
| Cliente | 12 |
| CNPJ | 16 |
| CFOP | 18 |
| UF | 22 |
| Valor Contábil | 23 (total às vezes col 24) |

## Linhas a IGNORAR (`_skip_row`)

- `Total Fornecedor` / `Total Cliente`
- `Total Geral` (usado só para total oficial, não somar como detalhe)
- `ACOMPANHAMENTO DE …`
- Cabeçalho repetido (`Código`, `Data Emissão`, …)
- `Sistema licenciado para …`
- Código col 1 **não numérico**

## Linhas DETALHE

- Coluna código = número inteiro (regex `^\d+$` aproximado via `_is_detail_code`)
- Valor = **Valor Contábil** — não coluna ICMS/IPI zerada
- Se valor None: scan cols configuradas + últimas cols da linha

## Total Geral

1. Achar linha com col1 ≈ `Total Geral`
2. Nas linhas seguintes (até +3), ler valor contábil nas cols de valor
3. Esse número = `mov.total_geral`
4. Gate: `|aggregate.soma - total_geral| < 0.02`

## Agregação (`aggregate.py`)

Por CFOP:

```python
{
    "cfop": "2-102",
    "qtd": int,      # NFs únicas (nota|série)
    "total": float,
    "fornecedores" | "clientes": [
        {"nome", "doc", "uf", "qtd", "total"}
    ]
}
```

Global:

- `ranking` — top parceiros todos CFOPs
- `byUf` — soma por UF
- `nfs` — count chaves únicas nota|série
- `soma` — soma valores detalhe

Limpeza nome:

- Remove prefixo `39.597.087 ` (código fornecedor)
- Remove CNPJ colado no início

## Erros comuns de calibração

| Sintoma | Causa provável | Fix |
|---------|----------------|-----|
| delta grande positivo | Somando Total Fornecedor | `_skip_row` / `_is_detail_code` |
| delta grande negativo | Coluna valor errada (ICMS) | header map `valor contábil` |
| 0 linhas | Header não encontrado | ajustar fallback cols ou `_header_map` |
| total_geral None | Total Geral em col diferente | `_find_total_geral` cols |
| CFOP vazio | CFOP numérico em col errada | `_find_cfop` scan linha |

## Raw vs pack

Extract retorna:

- `lines[]` — cada NF (gravado em `NfeLine` no commit)
- `pack_patch` — agregados para dashboard

Não é necessário JSON intermediário em `relatorios/` (isso é fluxo EJS legado).
