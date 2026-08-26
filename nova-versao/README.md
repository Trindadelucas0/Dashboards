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
| Baifer | `fixtures/baifer-padrao/` (Entradas, Saídas e DRE jan/2026) |

Todo mês o layout EXITO é o mesmo; só mudam os números.

## Calibração

```bash
cd nova-versao/backend
pytest -q tests/test_egaplast_padrao.py tests/test_baifer_entradas.py tests/test_baifer_saidas.py
```
