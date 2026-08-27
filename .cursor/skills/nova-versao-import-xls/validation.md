# Validação e testes — nova-versao import

## Ambiente

```powershell
cd c:\Users\trind\Desktop\Dashboards\nova-versao\backend
$env:PYTHONPATH='.'
# Python 3.11 no .venv (psycopg2/lxml)
```

## Comandos pytest

```powershell
# Por empresa/tipo
.\.venv\Scripts\python.exe -m pytest -q tests/test_baifer_entradas.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_egaplast_padrao.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_demonstrativo_icms.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_demonstrativo_pis_cofins.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_classify.py

# Regressão completa (obrigatório antes de entregar calibração)
.\.venv\Scripts\python.exe -m pytest -q
```

Meta: **74+ testes** passando (número sobe com novos golden).

## Script batch — validar pasta inteira

```powershell
.\.venv\Scripts\python.exe -c @"
from pathlib import Path
from app.extract.pipeline import classify_and_extract

folder = Path(r'c:\Users\trind\Downloads\SUA_PASTA')
rows = []
for p in sorted(folder.glob('*.xls')):
    r = classify_and_extract(p)
    ok = not r.get('errors') and (abs((r.get('meta') or {}).get('delta', 0)) < 0.02 if 'delta' in (r.get('meta') or {}) else True)
    rows.append((p.name, r.get('tipo'), r.get('company_id'), r.get('competencia'), ok, r.get('errors')))
for row in rows:
    print(row)
fail = [r for r in rows if not r[4]]
print('--- FAIL:', len(fail), 'OK:', len(rows)-len(fail))
"@
```

## Asserts mínimos por tipo

### entradas / saidas

```python
result = classify_and_extract(path)
assert result["tipo"] in ("entradas", "saidas")
assert not result["errors"], result["errors"]
assert result["company_id"] == "baifer"  # ou egaplast
assert result["competencia"] == "2026-07"
assert abs(result["meta"]["delta"]) < 0.02
assert result["meta"]["nfs"] == EXPECTED_NFS  # opcional golden
if result["tipo"] == "entradas":
    assert result["pack_patch"]["totalCompras"] == pytest.approx(TOTAL, abs=0.02)
else:
    assert result["pack_patch"]["cfopSaidasTotal"] == pytest.approx(TOTAL, abs=0.02)
```

### Slice dashboard (compras/vendas)

```python
from app.routers.companies import _slice

pack = result["pack_patch"]
pack["hasMovimentacao"] = True
compras = _slice("compras", pack)
assert compras["totalCompras"] == pytest.approx(TOTAL, abs=0.02)
assert len(compras["fornecedores"]) > 0
```

### icms

```python
assert result["tipo"] == "icms"
icms = result["pack_patch"]["apuracao"]["icms"]
assert icms["aRecolher"] == pytest.approx(EXPECTED, abs=0.02)
# Saldo credor:
assert icms["aRecolher"] == pytest.approx(-1901.16, abs=0.02)
```

### pis_cofins

```python
assert result["tipo"] == "pis_cofins"
ap = result["pack_patch"]["apuracao"]
assert ap["pis"]["aRecolher"] == pytest.approx(0, abs=0.02)
assert ap["pis"]["apurado"] == pytest.approx(6568.32, abs=0.02)
assert ap["cofins"]["apurado"] == pytest.approx(30254.08, abs=0.02)
```

### impostos (aba dashboard)

```python
imp = _slice("impostos", result["pack_patch"])
assert imp["apuracao"]["icms"]["aRecolher"] == pytest.approx(...)
```

## Valores golden — Baifer Entradas 2026

Fonte: calibração jan–jul/2026 (`test_baifer_entradas.py`).

| Competência | totalCompras | NFs |
|-------------|--------------|-----|
| 2026-01 | 606.046,53 | 209 |
| 2026-02 | 214.452,03 | 119 |
| 2026-03 | 511.638,88 | 207 |
| 2026-04 | 430.266,41 | 189 |
| 2026-05 | 360.186,94 | 143 |
| 2026-06 | 652.075,55 | 208 |
| 2026-07 | 608.942,57 | 233 |

CNPJ: `52005382000140`. Filename: `Entradas MM-2026.xls`.

Fixture CI: `fixtures/baifer-padrao/Entradas 01-2026.xls`.

## Valores golden — Baifer Saídas 2026

Fonte: calibração jan–jul/2026 (`test_baifer_saidas.py`).

| Competência | cfopSaidasTotal | NFs |
|-------------|-----------------|-----|
| 2026-01 | 515.051,89 | 378 |
| 2026-02 | 479.928,01 | 335 |
| 2026-03 | 603.306,81 | 489 |
| 2026-04 | 562.728,17 | 458 |
| 2026-05 | 430.254,72 | 421 |
| 2026-06 | 659.485,00 | 422 |
| 2026-07 | 702.124,58 | 498 |

CNPJ: `52005382000140`. Filename: `Saídas MM-2026.xls`.

Fixture CI: `fixtures/baifer-padrao/Saídas 01-2026.xls`.

## Valores golden — Baifer PIS/COFINS jan/2026

| Tributo | apurado | aRecolher | credito |
|---------|---------|-----------|---------|
| PIS | 6.568,32 | 0 | 18.080,71 |
| COFINS | 30.254,08 | 0 | 83.280,93 |

Arquivo: `Apuração pis e cofins 012026.xls` (2 abas).

## Valores golden — ICMS (exemplos)

Demonstrativo EXITO — conferir por mês na planilha:

| Mês | aRecolher | Nota |
|-----|-----------|------|
| 2026-01 Baifer | −1.901,16 | saldo credor (demonstrativo) |
| 2026-06 Baifer | 14.834,69 | a recolher |
| 2026-07 Baifer | 17.806,44 | a recolher |

Egaplast fixture `test_demonstrativo_icms.py` — grid sintético jun/2026: `14834.69`.

## Valores golden — Baifer APURAÇÃO 5005 (Memória / ICMS oficial)

Fonte: `MMYYYY APURAÇÃO 5005.xlsx`. Tipo `apuracao_5005`. Sem CNPJ — `company_id` do dashboard.

Fixture CI: `fixtures/baifer-padrao/012026-apuracao-5005.xlsx`  
Testes: `tests/test_apuracao_5005.py`

### Janeiro/2026 (completo)

| Campo | Valor |
|-------|------:|
| Débito original | 85.763,18 |
| Crédito original | 38.536,92 |
| Total original | 124.300,10 |
| Débitos 5005 | 56.756,77 |
| Créditos 5005 | 54.601,50 |
| Total 5005 | 2.155,27 |
| Débito fora | 168,16 |
| Crédito fora | 3.970,56 |
| Crédito outorgado | 254,15 |
| Total fora | −4.056,55 |
| ICMS a recolher | −1.901,28 |
| Ganho receita subvenção | 45.070,99 |

### ICMS a recolher jan–jul/2026

| Competência | icmsARecolher |
|-------------|--------------:|
| 2026-01 | −1.901,28 |
| 2026-02 | 28.441,58 |
| 2026-03 | 17.592,90 |
| 2026-04 | 21.349,29 |
| 2026-05 | 13.105,44 |
| 2026-06 | 14.834,69 |
| 2026-07 | 17.806,44 |

**UI:** aba Memória de Cálculo + Impostos (`aRecolher` alinhado à 5005).

## Valores golden — Egaplast (regressão)

Fixture `egaplast-padrao/` — **não regredir** ao calibrar outras empresas:

| Tributo | Valor referência (fixtures) |
|---------|----------------------------|
| PIS aRecolher | 6.448,85 |
| COFINS aRecolher | 29.763,91 |

Rodar: `pytest -q tests/test_egaplast_padrao.py`.

## Fixtures — política

1. **CI:** pelo menos 1 arquivo real por empresa/tipo em `nova-versao/fixtures/`
2. **Golden completo:** `@pytest.mark.skipif(not DOWNLOADS.exists())` apontando pasta local do usuário
3. **Não commitar** `.xls` gigantes desnecessários — 1 mês representativo basta
4. Atualizar golden **só** se planilha oficial mudou ou bug fix correto

## Validação CFOP (integridade)

Opcional em testes avançados:

```python
cfops = result["pack_patch"]["cfopDados"]
soma_cfop = sum(c["total"] for c in cfops)
assert soma_cfop == pytest.approx(result["pack_patch"]["totalCompras"], abs=0.02)
for c in cfops:
    soma_p = sum(f["total"] for f in c.get("fornecedores", []))
    assert soma_p == pytest.approx(c["total"], abs=0.02)
```

## UI smoke (manual)

Pré: `npm run dev` em `nova-versao`.

1. Login empresa correta
2. Importar → selecionar arquivos calibrados
3. Preview: todos `ok`, delta 0, sem errors vermelhos
4. Gravar sem replace (merge) ou com replace (reimport total)
5. Seletor mês → Compras / Vendas / Impostos populados

**Não** afirmar “testado no UI” se só rodou pytest.

## Validação pós-grava (API opcional)

Se backend rodando e token disponível:

```powershell
# Listar meses da empresa (endpoint companies router)
# Conferir pack do slot YYYY-MM tem totalCompras / apuracao
```

Preferir inspeção visual no dashboard para entrega ao usuário.

## Checklist antes de “pronto”

- [ ] pytest -q verde
- [ ] Tabela totais conferida com planilha Excel (amostra 2+ meses)
- [ ] Nenhum `errors` no batch script
- [ ] Empresa correta no catálogo
- [ ] README/skill não obrigatório — só se pedido
- [ ] Usuário sabe login e passos Importar
