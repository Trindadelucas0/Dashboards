# Exemplos de sessão — nova-versao import

Casos reais calibrados neste projeto. Usar como referência quando usuário enviar pacotes similares.

---

## Exemplo 1 — Baifer Entradas jan–jul/2026

### Input usuário

Pasta Drive com 7 arquivos:

```
Entradas 01-2026.xls … Entradas 07-2026.xls
CNPJ: 52.005.382/0001-40 — BAIFER DISTRIBUIDORA DE FERRAMENTAS LTDA
```

### Diagnóstico

- Parser movimento **já OK** (delta 0 todos os meses)
- Bloqueio: Baifer **fora** do catálogo → `CNPJ/razão não mapeados`

### Ação agente

1. `companies.py` — registro Baifer
2. `seed.py` — user `baifer`, descrição
3. `test_baifer_entradas.py` — golden 7 meses
4. Fixture `fixtures/baifer-padrao/Entradas 01-2026.xls`
5. `pytest -q` — 74 testes OK

### Entrega totais

| Mês | Total compras | NFs |
|-----|---------------|-----|
| Jan | 606.046,53 | 209 |
| Fev | 214.452,03 | 119 |
| Mar | 511.638,88 | 207 |
| Abr | 430.266,41 | 189 |
| Mai | 360.186,94 | 143 |
| Jun | 652.075,55 | 208 |
| Jul | 608.942,57 | 233 |

### Usuário

Login `baifer` → Importar → 7 arquivos → Extrair → Gravar (sem replace entre tipos).

---

## Exemplo 2 — Baifer Apuração ICMS jan–jul/2026

### Input

```
Apuração icms 012026.xls … 072026.xls
```

### Diagnóstico inicial

- Classificado `impostos` ou `icms` mas `apuracao.icms` **vazio**
- Parser antigo esperava tabela JPG anual, não demonstrativo EXITO

### Ação agente

1. `parse_demonstrativo_icms()` — bloco APURAÇÃO
2. `is_demonstrativo_icms()` + branch pipeline
3. `classify.py` — filename `apura` + `icms`
4. `test_demonstrativo_icms.py`

### Regras aplicadas

- `ICMS a recolher` → valor positivo
- Jan/2026: recolher 0, saldo credor 1.901,16 → `aRecolher = -1901.16`

### Usuário

Mesmo lote jul/2026: Entradas + Saídas + ICMS no **mesmo** commit → merge impostos.

---

## Exemplo 3 — Baifer PIS/COFINS jan–jul/2026

### Input

```
Apuração pis e cofins 012026.xls (e demais meses)
2 abas: Demonstrativo de Apuração - PIS | Demonstrativo de Apuração - COF
```

### Diagnóstico inicial

1. `load_workbook` só aba 1 → COFINS perdida
2. Filename `pis e cofins` → tipo `desconhecido` na aba 1 isolada
3. Parser buscava `Total Imposto` (layout Egaplast EFD)

### Ação agente

1. `load_all_sheets()` em `workbook.py`
2. Pipeline `_extract_pis_cofins_sheets` + `_apply_pis_cofins_extract`
3. `parse_demonstrativo_apuracao_pis_cofins()` — labels não cumulativos
4. Fallback cumulativo Egaplast preservado
5. `test_demonstrativo_pis_cofins.py`

### Jan/2026 conferido

| | apurado | aRecolher | crédito |
|---|---------|-----------|---------|
| PIS | 6.568,32 | 0 | 18.080,71 |
| COFINS | 30.254,08 | 0 | 83.280,93 |

### Usuário

1 arquivo = PIS + COFINS; preview `tipo: pis_cofins`.

---

## Exemplo 4 — Pacote mensal completo (jul/2026 Baifer)

### Arquivos ideais num commit

```
Entradas 07-2026.xls
Saídas 07-2026.xls          (ou Entradas por Cliente.xls)
Apuração icms 072026.xls
Apuração pis e cofins 072026.xls
Demonstrativo IPI …         (se existir)
ST …                        (se existir)
```

### Ordem agente

1. Batch probe — tabela status
2. Calibrar só o que falhar
3. pytest
4. Entregar mapa + instrução UI

### Commit

- **Primeira** importação do mês: Gravar **sem** replace
- **Reimport** total: replace uma vez, todos os arquivos de novo

---

## Exemplo 5 — Egaplast regressão

### Contexto

Fixtures `egaplast-padrao/` com Entradas, Saídas, PIS EFD, IPI, ST.

### Regra

Qualquer patch em `parse_impostos.py` ou `classify.py` **deve** manter:

```powershell
pytest -q tests/test_egaplast_padrao.py
```

Valores referência PIS 6448,85 / COFINS 29763,91 (layout consolidado).

---

## Exemplo 6 — Empresa nova (template)

### Input usuário

```
"Tenho planilhas da empresa XYZ, CNPJ 12.345.678/0001-99"
+ Entradas 01-2026.xls anexo
```

### Fluxo agente

1. Probe → delta OK? tipo entradas?
2. Se OK: só catálogo + seed + testes
3. Se delta ≠ 0: calibrar movimento primeiro
4. Fixture mínima + golden jan
5. Entrega: login `xyz`, passos import

### Não fazer

- Inventar Saídas/ICMS sem planilha
- Gravar no Postgres sem pedido
- Commit git sem pedido

---

## Exemplo 7 — Mensagens típicas do usuário

| Mensagem | Interpretação |
|----------|---------------|
| "Calibra essas planilhas" | Fase A–D completa, usuário importa |
| "Sube jan a jul Baifer" | Batch 7 meses × tipos enviados |
| "Só entradas por enquanto" | Escopo entradas; impostos pendente explícito |
| "Importa no sistema" | **Só** se pedido explícito gravar; senão instruir UI |
| Anexo sem texto | Assumir pacote mensal EXITO, probe all |

---

## Anti-padrões (evitar)

1. Dizer "pronto" com delta 0,05
2. Mapear empresa pelo nome do arquivo `Baifer` sem CNPJ
3. Usar skill EJS para nova-versao
4. Quebrar Egaplast ao adicionar Baifer
5. `load_workbook` para arquivo PIS+COFINS dual-aba
6. Preencher ICMS manualmente no pack
