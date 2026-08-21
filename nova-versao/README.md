# Nova versão — Dashboards Êxito (Egaplast)

Sistema isolado (Next.js + Python + Postgres). **Não altera** o dashboard antigo da porta 4243.

Por enquanto a nova-versão opera **somente com Egaplast**. Upload do pacote mensal padrão (Entradas, Saídas, IPI, PIS, EFD/COFINS, ST) grava no mês certo e preenche as abas.

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
- Empresa: `egaplast` + senha de `SEED_USER_PASSWORD`

## Pacote padrão Egaplast

Fixture: `fixtures/egaplast-padrao/` (cópia do pacote Drive). Todo mês o layout é o mesmo; só mudam os números.

## Calibração

```bash
cd nova-versao/backend
pytest -q tests/test_egaplast_padrao.py
```
