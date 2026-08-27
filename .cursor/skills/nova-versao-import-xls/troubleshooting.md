# Troubleshooting — sintoma → causa → fix

## Erros no preview / extract

### `CNPJ/razão não mapeados para nenhuma empresa cadastrada`

| Causa | Fix |
|-------|-----|
| Empresa nova | Adicionar `CompanyReg` em `companies.py`, `seed.py`, testes |
| CNPJ vazio no export | Verificar `scan_cnpj`; fallback `find_by_name(razao)` |
| CNPJ errado na planilha | Pedir planilha correta ao usuário — **não** forçar empresa |
| Empresa só Postgres | Cadastrar via `/empresas/nova` ou catálogo estático |

### `Planilha é da empresa X e não de Y`

| Causa | Fix |
|-------|-----|
| Dashboard Egaplast aberto, planilha Baifer | Usuário trocar login/dashboard |
| Comportamento correto | Não remover validação |

### `Competência não identificada`

| Causa | Fix |
|-------|-----|
| Filename atípico | Adicionar padrão em `competencia_from_filename` |
| Cabeçalho sem período | Pedir arquivo com `Competência:` ou renomear `MMYYYY` |
| ST/imposto anual | Enviar no lote com arquivos que têm competência (herda batch) |
| APURAÇÃO 5005 via tempfile sem `original_filename` | `imports.py` deve passar `original_filename=UploadFile.filename` |

### `Planilha cobre mais de um mês`

| Causa | Fix |
|-------|-----|
| Período trimestral no cabeçalho | Exportar mês a mês no EXITO |
| Filename `Jan a Mar` | Separar arquivos — **não** alterar `RANGE_ERROR` |

### `Tipo de planilha não reconhecido (desconhecido)`

| Causa | Fix |
|-------|-----|
| Aba sem keyword | Estender `detect_sheet_tipo` (head 8 linhas + sheet_name + filename) |
| Filename `pis e cofins` mas aba genérica | Verificar `load_all_sheets` — branch PIS/COFINS |
| Extensão `.xlsx` raro | `workbook.py` openpyxl path |

### `Δ Total Geral = X (limite 0,02)`

| Causa | Fix |
|-------|-----|
| Coluna valor = ICMS não contábil | `_header_map` priorizar `valor contábil` |
| Somando totais parciais | `_skip_row`, `_is_detail_code` |
| Total Geral col errada | `_find_total_geral` + cols saídas 22/23 |
| Header não detectado | Fallback cols entradas/saídas em `parse_movimento` |
| Excel HTML mal exportado | Tentar COM/xlrd; re-export usuário |

### `Nenhuma linha de detalhe encontrada`

| Causa | Fix |
|-------|-----|
| Aba errada (só aba 1 lida) | Movimento OK com `load_workbook`; conferir aba ativa no Excel |
| Arquivo placeholder | `EMPTY_FILE_ERROR` — re-download |
| Planilha só totais | Arquivo incompleto |

### `Total Geral não encontrado`

| Causa | Fix |
|-------|-----|
| Label diferente | Buscar string na grid; estender `_find_total_geral` |
| Total em merged cell | COM export ou scan mais linhas após label |

---

## Impostos zerados / errados

### `apuracao.icms` vazio ou zero com planilha cheia

| Causa | Fix |
|-------|-----|
| Classificado como `impostos` tabela anual | `is_demonstrativo_icms` + branch `parse_demonstrativo_icms` |
| Labels sem acento | `_fold()` normalização em `parse_impostos` |
| Bloco APURAÇÃO não encontrado | Scan `apuracao` row index |
| Usando débito saídas como recolher | Regra saldo credor quando `icms a recolher = 0` |
| Baifer: falta Memória / valor ≠ planilha 5005 | Importar `*APURAÇÃO 5005*.xlsx` (tipo `apuracao_5005`); ver `parse_memoria_5005.py` |

### Memória de Cálculo vazia (Baifer)

| Causa | Fix |
|-------|-----|
| Só importou Demonstrativo ICMS | Enviar `APURAÇÃO 5005` no dashboard Baifer |
| Preview recusou competência | Nome deve ter `MMYYYY` (ex. `012026`) |
| Empresa não herdada | Abrir Baifer antes de Importar (`company_id` no FormData) |

### Só PIS ou só COFINS no pack

| Causa | Fix |
|-------|-----|
| `load_workbook` 1 aba | Usar `load_all_sheets` + pipeline `_extract_pis_cofins_sheets` |
| Segunda aba tipo desconhecido | `detect_sheet_tipo` para aba `COF` / COFINS head |
| Filename classifica errado | Branch tax_sheets antes de tipo aba1 |

### PIS `aRecolher` = apurado (errado)

| Causa | Fix |
|-------|-----|
| Lendo linha cumulativa errada | Usar label **Não Cumulativa a Recolher** |
| Fallback Total Imposto Egaplast | Separar paths demonstrativo vs consolidado |

### COFINS duplicado / valor menor

| Causa | Fix |
|-------|-----|
| 2 abas COFINS | `_pis_cofins_score` dedupe |

---

## API / UI

### Preview expirado

Preview UUID em memória — refazer upload. Não é bug.

### `duplicata` no commit

Mesmo SHA256 já importado. Usuário marcar **substituir mês** ou ignorar se intencional.

### Gravou mas aba vazia

| Causa | Fix |
|-------|-----|
| Mês/unidade errado no seletor | `goToSlot(competencia, unidade)` |
| Só entradas, falta impostos | Normal — importar restante |
| `_slice` não mapeia chave | Verificar pack keys vs router |

### Merge sobrescreveu dado errado

| Causa | Fix |
|-------|-----|
| `replace: true` no segundo arquivo | Usar replace só no primeiro commit de reimport total |
| Mesmo tipo 2x | Segundo merge sobrescreve chaves mesmo nível |

---

## Seed / banco

### Empresa sumiu após seed

Fora de `KEEP_COMPANY_IDS` — readicionar ao catálogo antes de seed.

### Postgres connection refused

Subir Docker/local `:5432`; conferir `.env`.

---

## Calibração — ordem de debug

1. `load_all_sheets` → quantas abas? nomes?
2. `detect_sheet_tipo` por aba
3. `scan_cnpj`, `scan_period`
4. `classify_and_extract` completo
5. Se movimento: `parse_movimento` isolado + `validate_movimento`
6. Se imposto: parser isolado + comparar labels na grid (print primeiras 30 linhas)

### Dump grid para debug

```python
from app.extract.workbook import load_workbook
g = load_workbook(path)
for i, row in enumerate(g.rows[:35]):
    print(i, row[:8])
```

---

## Quando NÃO calibrar

| Situação | Ação |
|----------|------|
| Planilha multi-mês | Pedir split |
| Empresa errada | Usuário corrigir fonte |
| Arquivo corrompido/0 bytes | Re-download |
| Layout não EXITO | Escopo novo — avaliar parser separado |
| Pedido EJS 4243 | Outra skill |
