---
name: nova-versao-import-xls
description: >-
  Calibra e valida importação de planilhas EXITO (.xls/.xlsx) no nova-versao
  (Next.js :3000 + FastAPI :8001 + Postgres). Use quando o usuário enviar anexos
  ou caminhos de Entradas, Saídas, Apuração ICMS, APURAÇÃO 5005 (Memória), IPI,
  PIS/COFINS, ST, DRE, impostos anuais, ou pedir calibrar/subir dados mensais
  Baifer, Egaplast ou nova empresa. Fluxo: mapear CNPJ → probe extract →
  calibrar parser se falhar → pytest golden → usuário importa no dashboard.
  NÃO usar para EJS porta 4243.
---

# Nova-versão — Importar planilhas EXITO

Sistema isolado em `nova-versao/`. **Não** patchar `src/views/*.ejs` (porta 4243) — skill legada: `dashboard-movimento-xls`.

## Regras invioláveis

1. **CNPJ e aba/cabeçalho** definem empresa e tipo — **nunca** confiar só no nome do arquivo.
2. **Não inventar imposto** — sem planilha → `aRecolher: 0`, composição vazia, `hasDre: false`.
3. **Movimento:** `|delta| < 0,02` vs Total Geral — falhou → não dizer “pronto”.
4. **Agente calibra; usuário grava** — não commitar Postgres/API salvo pedido explícito.
5. **Um arquivo = uma competência** — multi-mês → `RANGE_ERROR`, pedir arquivos separados.
6. **Regressão Egaplast** — calibrar Baifer/nova empresa não pode quebrar fixtures `egaplast-padrao`.

## Quando acionar esta skill

| Usuário diz / envia | Ação |
|---------------------|------|
| Anexa `.xls` / pasta Drive / `Entradas MM-YYYY` | Fluxo completo abaixo |
| “Calibra”, “sobe”, “importa planilhas” + nova-versao | Idem |
| “Apuração icms 072026”, “pis e cofins” | Branch impostos + multi-aba |
| Empresa nova (CNPJ desconhecido) | `companies.py` + `seed.py` + testes |
| Só dashboard EJS / Unica / Loja / JPG | **Outra skill** (`dashboard-movimento-xls`) |

## Checklist obrigatório (copiar e marcar)

```
FASE A — Diagnóstico
- [ ] A.1 Listar todos os arquivos recebidos (nome, tamanho, pasta)
- [ ] A.2 Por arquivo: CNPJ, razão, competência, abas, tipo detectado
- [ ] A.3 Cruzar CNPJ com [companies.md](companies.md)
- [ ] A.4 Montar tabela arquivo → empresa → YYYY-MM → tipo

FASE B — Probe
- [ ] B.1 Rodar classify_and_extract em cada arquivo (script batch)
- [ ] B.2 Movimento: delta, nfs, totalCompras/cfopSaidasTotal
- [ ] B.3 Impostos: meta.aRecolher vs linha oficial da planilha
- [ ] B.4 Registrar errors[] e warnings[]

FASE C — Calibração (só se B falhar)
- [ ] C.1 Identificar sintoma → [troubleshooting.md](troubleshooting.md)
- [ ] C.2 Patch mínimo em classify / parse_* / pipeline / companies
- [ ] C.3 Re-probe até OK

FASE D — Testes
- [ ] D.1 Copiar 1 fixture representativa → fixtures/<empresa>-padrao/
- [ ] D.2 Criar/estender test_*.py com golden
- [ ] D.3 pytest -q (empresa + regressão completa)

FASE E — Entrega
- [ ] E.1 Tabela totais por mês (movimento + impostos)
- [ ] E.2 Passos UI import (login correto)
- [ ] E.3 Pendências explícitas (Saídas, DRE, etc.)
- [ ] E.4 Formato final-response-format
```

**Gate:** qualquer item de B com `errors` ou delta ≥ 0,02 → **não** entregar como concluído.

---

## Fase A — Inspecionar arquivos

### 1. Inventário rápido (PowerShell)

```powershell
Get-ChildItem "CAMINHO\*.xls" | Select-Object Name, Length, LastWriteTime
```

### 2. Probe por arquivo (Python)

```powershell
cd c:\Users\trind\Desktop\Dashboards\nova-versao\backend
$env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -c @"
from pathlib import Path
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import load_all_sheets

paths = [
    Path(r'CAMINHO\Entradas 01-2026.xls'),
    # ... todos os arquivos
]
for p in paths:
    if not p.exists():
        print('MISSING', p.name)
        continue
    sheets = load_all_sheets(p)
    r = classify_and_extract(p)
    print('---', p.name)
    print('  abas:', [s.sheet_name for s in sheets])
    print('  tipo:', r.get('tipo'), '| empresa:', r.get('company_id'), r.get('company_label'))
    print('  cnpj:', r.get('cnpj'), '| comp:', r.get('competencia'), '| unidade:', r.get('unidade'))
    print('  errors:', r.get('errors'))
    print('  warnings:', r.get('warnings'))
    m = r.get('meta') or {}
    if 'delta' in m:
        print('  delta:', m.get('delta'), 'total:', m.get('totalGeralExcel'), 'nfs:', m.get('nfs'))
    if r.get('pack_patch', {}).get('apuracao'):
        print('  apuracao:', r['pack_patch']['apuracao'])
"@
```

### 3. Tabela de mapeamento (preencher na entrega)

| Arquivo | CNPJ | Empresa | Competência | Tipo | Abas | Status |
|---------|------|---------|-------------|------|------|--------|
| Entradas 01-2026.xls | 52005382000140 | baifer | 2026-01 | entradas | Entradas | OK |

### 4. Competência — ordem de prioridade

1. Cabeçalho `Competência: DD/MM/YYYY` → `YYYY-MM`
2. Cabeçalho `Período: 01/MM/YYYY até …` → `YYYY-MM` (se **um** mês)
3. Nome do arquivo:
   - `072026` → `2026-07`
   - `Entradas 01-2026.xls` → `2026-01`
   - `Apuração icms 062026.xls` → `2026-06`
4. Lote: `_inherit_batch_competencia` herda competência entre arquivos do mesmo preview

Detalhes: [planilha-tipos.md](planilha-tipos.md#competência).

---

## Fase B — Validar extract

### Movimento (entradas / saídas)

Aceite:

- `result["tipo"]` ∈ `entradas`, `saidas`
- `result["company_id"]` bate CNPJ
- `not result["errors"]`
- `abs(meta["delta"]) < 0.02`
- `pack_patch["totalCompras"]` ou `cfopSaidasTotal` ≈ Total Geral

Probe detalhado:

```powershell
.\.venv\Scripts\python.exe -c @"
from pathlib import Path
from app.extract.workbook import load_workbook
from app.extract.parse_movimento import parse_movimento
from app.extract.aggregate import aggregate, validate_movimento

p = Path(r'...')
tipo = 'entradas'  # ou 'saidas'
g = load_workbook(p)
mov = parse_movimento(g, tipo)
party = 'fornecedores' if tipo == 'entradas' else 'clientes'
agg = aggregate(mov.lines, party)
print('lines', len(mov.lines), 'nfs', agg['nfs'], 'soma', agg['soma'])
print('total_geral', mov.total_geral, 'delta', round(agg['soma']-float(mov.total_geral or 0), 2))
print('errors', validate_movimento(mov, agg['soma']))
"@
```

Layout colunas: [layout-exito.md](layout-exito.md).

### Impostos

| Tipo | Conferir na planilha | Campo pack |
|------|---------------------|------------|
| `icms` | linha `ICMS a recolher` ou saldo credor | `apuracao.icms.aRecolher` |
| `apuracao_5005` | `ICMS A RECOLHER` + blocos Original/5005/Fora + subvenção | `memoriaCalculo`, `apuracao.icms.aRecolher`, `apuracao.subvencao` |
| `ipi` | `Saldo devedor de IPI` | `apuracao.ipi.aRecolher` |
| `pis` / `cofins` / `pis_cofins` | `… Não Cumulativa a Recolher` ou cumulativo | `apuracao.pis`, `apuracao.cofins` |
| `icms_st` | soma UF | `apuracao.icmsSt`, `porUfSt` |

**ICMS com saldo credor:** se `ICMS a recolher = 0` e `Saldo credor … > 0` → `aRecolher` negativo (crédito).

**Baifer Memória / ICMS oficial:** planilha `APURAÇÃO 5005` (padrão mensal). Sem CNPJ — importar com dashboard Baifer aberto. Detalhe: [planilha-tipos.md](planilha-tipos.md#apuração-5005--memória-de-cálculo-padrão-baifer).

**PIS/COFINS arquivo único com 2 abas:** pipeline usa `load_all_sheets` → `tipo: pis_cofins` → merge das duas abas; dedupe por maior score se abas duplicadas.

### Resultado de `classify_and_extract`

Contrato completo: [architecture.md](architecture.md#contrato-classify_and_extract).

---

## Fase C — Calibrar (só se probe falhar)

Árvore de decisão:

```
errors contém "CNPJ/razão não mapeados"?
  → companies.py + seed.py (+ testes)

errors contém "Tipo de planilha não reconhecido"?
  → classify.py detect_sheet_tipo

errors contém "Δ Total Geral"?
  → parse_movimento.py (header map, col valor, Total Geral)

errors contém "Planilha cobre mais de um mês"?
  → pedir arquivos mensais (não calibrar)

pack apuracao zerado mas planilha tem valor?
  → parse_impostos.py (labels do demonstrativo)

só 1 tributo de PIS+COFINS?
  → workbook load_all_sheets + pipeline _extract_pis_cofins_sheets
```

Matriz completa: [troubleshooting.md](troubleshooting.md).

### Arquivos do pipeline (não mexer sem motivo)

| Arquivo | Responsabilidade |
|---------|------------------|
| `workbook.py` | Ler `.xls` (xlrd/COM/html), `load_all_sheets` |
| `classify.py` | CNPJ, competência, `detect_sheet_tipo`, `resolve_company` |
| `parse_movimento.py` | Linhas detalhe + Total Geral |
| `aggregate.py` | CFOP, ranking, `merge_entradas/saidas`, `validate_movimento` |
| `parse_impostos.py` | ICMS, IPI, PIS/COFINS, ST, tabela anual |
| `parse_memoria_5005.py` | APURAÇÃO 5005 → `memoriaCalculo` + ICMS/subvenção |
| `parse_dre.py` | DRE / RESULTADO |
| `pipeline.py` | Orquestra tudo → `pack_patch` |
| `companies.py` | Catálogo estático Egaplast/Baifer |
| `routers/imports.py` | Preview/commit, merge no Postgres |

Mapa: [architecture.md](architecture.md).

### Nova empresa — passos

1. Confirmar CNPJ + razão no cabeçalho (não no filename)
2. `CompanyReg` em `companies.py` (`id`, `label`, `cnpj`, `name_re`, `username`, `theme`, `units`)
3. `KEEP_COMPANY_IDS`, `KEEP_USERNAMES`
4. `COMPANY_DESCRIPTIONS` em `scripts/seed.py`
5. `python scripts/seed.py`
6. Fixture + testes golden
7. README se relevante

Alternativa: empresa só no Postgres via `/empresas/nova` — `resolve_from_db` no preview **se** `db` passado (API sempre passa).

---

## Fase D — Testes

```powershell
cd nova-versao\backend
$env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -m pytest -q tests/test_baifer_entradas.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_apuracao_5005.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_demonstrativo_icms.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_demonstrativo_pis_cofins.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_egaplast_padrao.py
.\.venv\Scripts\python.exe -m pytest -q
```

Fixtures:

- `nova-versao/fixtures/egaplast-padrao/` — regressão Egaplast
- `nova-versao/fixtures/baifer-padrao/` — Baifer Entradas / Saídas / DRE / **APURAÇÃO 5005** jan/2026

Golden conhecidos: [validation.md](validation.md#valores-golden).

Padrão de teste movimento:

```python
result = classify_and_extract(path)
assert result["tipo"] == "entradas"
assert not result["errors"]
assert result["company_id"] == "baifer"
assert abs(result["meta"]["delta"]) < 0.02
assert result["pack_patch"]["totalCompras"] == pytest.approx(TOTAL, abs=0.02)
```

---

## Fase E — Usuário importa no sistema

### Pré-requisitos

```powershell
cd nova-versao
npm run dev   # API :8001 + web :3000
# Postgres localhost:5432
# Primeira vez: init_db.py → clear_fiscal_data.py → seed.py
```

### Fluxo UI

1. Login **da empresa do CNPJ** (`egaplast` ou `baifer` + `SEED_USER_PASSWORD`)
2. Dashboard → aba **Importar**
3. Selecionar **todos** os arquivos do mês (Entradas + Saídas + impostos)
4. **Extrair e validar** — cada linha deve mostrar `ok`, delta 0, sem errors
5. **Gravar**
   - **Sem** “substituir mês” se for **primeiro** arquivo da competência ou se quer **merge** (Entradas + Saídas + ICMS no mesmo mês)
   - **Com** “substituir mês” só para **reimportar tudo** do zero (zera pack + NfeLine)
6. Conferir abas **Compras**, **Vendas**, **Impostos** no seletor de mês

### Regras API (preview/commit)

- `company_id` do Form = empresa do dashboard aberto
- Planilha Baifer + dashboard Egaplast → **error** (correto)
- `duplicateHash` = mesmo SHA256 já importado → status `duplicata` (use replace)
- Vários arquivos **mesmo mês** → `_deep_merge` no mesmo `FiscalMonth.pack`
- Linhas NF → tabela `NfeLine` (dedupe por constraint)

Detalhes: [architecture.md](architecture.md#api-imports).

### Pacote mensal típico (Baifer/Egaplast)

Por competência `YYYY-MM`, idealmente:

| Arquivo | Tipo |
|---------|------|
| `Entradas MM-YYYY.xls` | entradas |
| `Saídas MM-YYYY.xls` ou `Entradas por Cliente.xls` | saidas |
| `Apuração icms MMYYYY.xls` | icms |
| `Apuração pis e cofins MMYYYY.xls` | pis_cofins (2 abas) |
| `Demonstrativo IPI …` | ipi |
| `ST …` | icms_st |

Pode enviar lote de **vários meses** de uma vez — cada arquivo vai para sua competência.

---

## Entrega ao usuário

Usar skill `final-response-format`:

1. **O que foi feito** — tabela arquivo → empresa → mês → total/`aRecolher` + arquivos de código alterados (se houve calibração)
2. **Por que** — ex.: “Baifer fora do catálogo”, “parser ICMS não lia demonstrativo EXITO”
3. **Como testar** — `pytest -q` + passos UI acima
4. **Riscos** — seed apaga empresas fora de `KEEP_*`; dashboard empresa errada; impostos pendentes
5. **Próximo passo** — ex.: “enviar Saídas jul/2026”

Exemplos de sessão real: [examples.md](examples.md).

---

## Escopo

| Dentro desta skill | Fora (até enviar planilha) |
|--------------------|----------------------------|
| Entradas, Saídas, CFOP, fornecedores, clientes | Valores inventados |
| ICMS, IPI, PIS, COFINS, ST demonstrativos | DRE/IRPJ sem calibração de linhas |
| Catálogo + seed empresa nova | Commit git (só se pedido) |
| Fixtures + pytest | Gravar Postgres via agente |
| Documentar totais por mês | Dashboard EJS 4243 |

---

## Referências

| Doc | Conteúdo |
|-----|----------|
| [architecture.md](architecture.md) | Pipeline, pack schema, API |
| [companies.md](companies.md) | CNPJ, logins, nova empresa |
| [planilha-tipos.md](planilha-tipos.md) | Detecção tipo, labels, pack keys |
| [layout-exito.md](layout-exito.md) | Colunas movimento EXITO |
| [validation.md](validation.md) | pytest, golden, asserts |
| [troubleshooting.md](troubleshooting.md) | Sintoma → causa → fix |
| [examples.md](examples.md) | Casos Baifer ICMS/PIS/Entradas |

Código: `nova-versao/backend/app/extract/`, `nova-versao/fixtures/`, `nova-versao/README.md`.
