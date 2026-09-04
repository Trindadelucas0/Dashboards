# Nova versão — Dashboards Êxito

Sistema isolado (Next.js + Python + Postgres). **Não altera** o dashboard antigo da porta 4243.

Empresas no catálogo: **Egaplast** e **Baifer**. Upload do pacote mensal EXITO (Entradas, Saídas, IPI, PIS/COFINS, ICMS, ST) grava no mês certo e preenche as abas.

Use **Python 3.11** no venv (3.14 ainda não tem wheels de psycopg2/lxml).

## Subir local

Na pasta `nova-versao` (não na raiz do Dashboards, nem em `frontend`):

```bash
cd nova-versao
npm install
npm run dev
```

Isso sobe a API (`8001`) e o site (`http://localhost:3000`) juntos. Postgres precisa estar em `localhost:5432`.

Na primeira vez, se o banco ainda não existir:

```bash
cd backend
.\.venv\Scripts\python.exe scripts\init_db.py
.\.venv\Scripts\python.exe scripts\clear_fiscal_data.py
.\.venv\Scripts\python.exe scripts\seed.py
```

Login inicial:

- Admin: `admin` + senha de `ADMIN_SEED_PASSWORD` no `.env`
- Egaplast: `egaplast` + senha de `SEED_USER_PASSWORD`
- Baifer: `baifer` + senha de `SEED_USER_PASSWORD`

## Pacotes padrão

| Empresa | Fixture |
|---------|---------|
| Egaplast | `fixtures/egaplast-padrao/` |
| Baifer | `fixtures/baifer-padrao/` (Entradas, relatório por fornecedor ago/2026, Saídas, DRE jan/2026) |
| **Planilha padrão (9 abas)** | `fixtures/baifer-padrao/planilha-padrao-modelo.xlsx` |

O import principal é o **workbook padrão** (DRE, Balancete, 5005, PIS/COFINS, ST, DIFAL, IPI, IRPJ, CSLL). Planilhas EXITO soltas (Entradas/Saídas) continuam válidas para movimento.

Todo mês o layout EXITO legado é o mesmo; a planilha padrão só muda os números nas colunas de mês.

## Calibração

```bash
cd nova-versao/backend
pytest -q tests/test_egaplast_padrao.py tests/test_baifer_entradas.py tests/test_baifer_saidas.py
```
