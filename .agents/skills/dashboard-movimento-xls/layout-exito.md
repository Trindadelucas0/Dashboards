# Layout planilha EXITO (Entradas / Saídas)

Formato `.xls` (Excel legado). Preferir Excel COM no Windows para export; alternativa: `xlrd` se disponível.

## Cabeçalho

| Linha | Conteúdo |
|-------|----------|
| 1 | Código + razão social (ex. `46 - UNICA …`) |
| 2 | `CNPJ:` + valor (célula mesclada — CNPJ pode vir vazio no export; cruzar com razão e `companies.md`) |
| 4 | `Período:` `01/MM/YYYY até DD/MM/YYYY` |
| 6 | Cabeçalho de colunas |
| 7+ | Linhas detalhe / totais de parceiro / blocos repetidos |

## Entradas (aba Entradas)

| Campo | Coluna (1-based) |
|-------|------------------|
| Código lançamento | 1 |
| Nota | 6 |
| Série | 8 |
| Fornecedor | 11 |
| CNPJ/CPF | 13 |
| CFOP | 17 |
| UF | 19 |
| Valor Contábil | 20 |

CFOP no Excel pode vir como `2-102`, `2.102` ou número `2102` → normalizar para `D-DDD`.

## Saídas (aba Saídas)

| Campo | Coluna (1-based) |
|-------|------------------|
| Código lançamento | 1 |
| Nota | 5 |
| Série | 6 |
| Cliente | 12 |
| CNPJ/CPF | 16 |
| CFOP | 18 |
| UF | 22 |
| Valor Contábil | 23 (às vezes total em 24 após Total Geral) |

## Linhas a ignorar

- `Total Fornecedor` / `Total Cliente` (têm valor na col de total, mas **não** somar junto com detalhe)
- `ACOMPANHAMENTO DE …`
- Linha de cabeçalho repetida (`Código`, `Data Emissão`…)
- `Sistema licenciado para …`
- Linha vazia / código não numérico

## Total Geral

1. Achar linha com col1 = `Total Geral`
2. Nas linhas seguintes (até +3), ler Valor Contábil (entradas col 20; saídas col 23/24)
3. Esse é o total oficial da planilha
4. Gate: `|soma(valores das linhas detalhe) − Total Geral| < 0.02`

## Agregação sugerida

```
por CFOP:
  qtd = NFs únicas (nota|série)
  total = soma valor
  fornecedores[] ou clientes[]:
    nome limpo, cnpj formatado, uf, qtd NFs, total

ranking global = same aggregate sem CFOP
porUf = soma por UF (quando o dashboard usa)
```

Limpeza de nome: remover prefixo tipo `39.597.087 ` ou CNPJ colado no início.

## Raw JSON intermediário

Pasta: `relatorios/<YYYY-MM>/raw/<empresa>-entradas.json` e `…-saidas.json`.

Campos mínimos por arquivo:

- `company`, `cnpj`, `period`, `tipo` (`entradas`|`saidas`)
- `totalGeral`, `lines[]` com `{nota,serie,nome,doc,uf,cfop,valor}`

Pack final: `relatorios/<YYYY-MM>/<empresa>-MM.json` com `meta` (deltas) + `pack` (schema do dashboard).
