# Empresas — nova-versao

Identificação **obrigatória pelo CNPJ do cabeçalho** (primeiras ~12 linhas). Razão social é fallback via `name_re`.

## Catálogo estático (`companies.py`)

| id | Label | CNPJ | name_re | Login | Theme | Unidades |
|----|-------|------|---------|-------|-------|----------|
| `egaplast` | Egaplast | `03185564000134` | `EGAPLAST` | `egaplast` | green | matriz + filial (mesmo CNPJ) |
| `baifer` | Baifer | `52005382000140` | `BAIFER` | `baifer` | blue | matriz |
| `loja-maquinas` | Loja das Máquinas | `13983066000190` | `LOJA DAS MAQUINAS` / `LOJA MÁQUINAS` | `loja-maquinas` | green | matriz |
| `unica` | Única | `36517206000130` | `\b[UÚ]NICA\b` | `unica` | blue | matriz |

**Única (UNICA COMERCIO ATACADISTA DE TINTAS):** fonte mensal é a planilha padrão v2 (9 abas + ENTRADAS/SAÍDAS no mesmo `.xlsx`), competências 01–07/2026. Fixtures: `fixtures/unica-padrao/`. Testes: `tests/test_unica_padrao.py`.

### Senhas (seed)

Definidas no `.env` de `nova-versao`:

- Admin: `ADMIN_SEED_PASSWORD` → user `admin`
- Empresas: `SEED_USER_PASSWORD` → `egaplast`, `baifer`

Rodar seed:

```powershell
cd nova-versao\backend
.\.venv\Scripts\python.exe scripts\seed.py
```

**Atenção:** o `seed.py` só faz **upsert** do catálogo e usuários seed. **Não apaga** empresas criadas na UI nem `fiscal_months`. Limpeza fiscal manual: `clear_fiscal_data.py --i-know-what-im-doing` (não apaga empresas).

## Resolução de empresa

Ordem em `pipeline.py`:

1. `find_by_cnpj(cnpj)` — match em `CompanyReg.units` ou `company.cnpj`
2. `find_by_name(razao)` ou `find_by_name(filename)` — regex `name_re`
3. Se `db` presente: `resolve_from_db(db, cnpj, razao)` — Postgres `Company` / `CompanyCnpj`

### Unidade (matriz vs filial)

- Default: `matriz`
- Egaplast: filename com `\b61\b` ou `filial` → `filial`
- Tabela impostos anual: pipeline pode ajustar unidade para filial com valor no mês

### Egaplast — filial

Matriz e filial compartilham CNPJ `03185564000134`. Import separado por unidade quando aplicável.

## Empresa nova — checklist completo

### 1. Coletar dados da planilha

- CNPJ 14 dígitos (com ou sem máscara)
- Razão social linha 1–3
- Confirmar layout EXITO igual Egaplast/Baifer (probe delta 0)

### 2. Editar `companies.py`

```python
CompanyReg(
    id="slug-empresa",           # kebab, único
    label="Nome Curto",
    cnpj="12345678000199",
    name_re=r"RAZAO_PARCIAL",    # regex case-insensitive
    username="slug-empresa",     # login
    theme="green",               # ou blue
    units=(Unit("matriz", "Matriz", "12345678000199", r"RAZAO"),),
),
```

Atualizar:

```python
KEEP_COMPANY_IDS = frozenset(COMPANY_BY_ID)  # automático se usar COMPANY_BY_ID
KEEP_USERNAMES = frozenset({"admin", "egaplast", "baifer", "loja-maquinas", "unica"})
```

### 3. Editar `scripts/seed.py`

Adicionar em `COMPANY_DESCRIPTIONS`:

```python
"slug-empresa": "Descrição para UI / ImportTab",
```

Seed cria user com `username` e associa à company.

### 4. Frontend (opcional)

- `ImportTab.tsx` — texto de ajuda se listar empresas
- `routers/companies.py` — descrição API se houver endpoint de meta

### 5. Testes

- `fixtures/<slug>-padrao/` — mínimo 1 `.xls`
- `tests/test_<slug>_entradas.py` (ou `_icms`, etc.)
- Golden parametrizado se usuário tiver pasta Downloads local (`skipif`)

### 6. README

Uma linha na tabela de empresas/fixtures se for empresa permanente.

## Empresa só via UI (`/empresas/nova`)

Cadastro dinâmico no Postgres **não** exige `companies.py` se:

- CNPJ cadastrado em `Company.cnpj` ou `CompanyCnpj`
- `name_re` bate razão da planilha

Preview com `db` resolve via `resolve_from_db`.

**Limitação:** `_apply_session_company` compara planilha vs dashboard:

- Catálogo estático: mismatch = **error** (bloqueia)
- Só Postgres: mismatch = **warning** (permite gravar)

Para UX consistente, preferir catálogo estático para empresas recorrentes.

## Armadilhas por empresa

| Situação | Comportamento |
|----------|---------------|
| Planilha Baifer, login Egaplast | Error: empresa errada |
| Filename `Entradas por Cliente.xls` | Tipo **saidas** (aba Saídas) |
| Filename `Apuração pis e cofins` | Classificar por **aba** (PIS / COF) |
| CNPJ vazio no export HTML | `find_by_name` ou empresa do dashboard (warning) |
| ST sem CNPJ | Warning; usa empresa do dashboard ao gravar |

## Legacy EJS (porta 4243)

Empresas no dashboard antigo **não** estão todas no nova-versao:

| Empresa EJS | nova-versao |
|-------------|-------------|
| Egaplast | ✅ egaplast |
| Baifer | ✅ baifer |
| Loja das Máquinas | ✅ loja-maquinas |
| Unica | ✅ unica (planilha padrão v2) |
| JPG | ❌ usar skill dashboard-movimento-xls |

Migrar empresa EJS → nova-versao = registrar no catálogo + calibrar parsers (layout EXITO costuma ser igual).

## Fixtures por empresa

| Empresa | Pasta | Arquivos típicos |
|---------|-------|------------------|
| Egaplast | `fixtures/egaplast-padrao/` | Entradas.xls, Saídas.xls, PIS, EFD, IPI, ST |
| Baifer | `fixtures/baifer-padrao/` | Entradas 01-2026.xls, Saídas 01-2026.xls, DRE, Balancete, 5005 |
| Loja das Máquinas | `fixtures/loja-maquinas-padrao/` | D. R. E. 01-2026.xls, Balancete 01-2026.xls |
| Única | `fixtures/unica-padrao/` | planilha-padrao-012026.xlsx (abas plurais), planilha-padrao-042026.xlsx (abas singulares) |

Copiar do usuário **1 arquivo por tipo** para CI; golden completo pode usar `@pytest.mark.skipif` na pasta Downloads.
