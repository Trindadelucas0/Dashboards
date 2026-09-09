"""Upsert LANNIC (JPG unidade) 08/2026 — PGDAS Simples Nacional.

Sem planilha EXITO na pasta temporária: números oficiais da memória
(saídas − devoluções = base) e do DAS. Não copia movimento de outras filiais.
Não grava linhas NF, DRE nem Balancete.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.extract.parse_impostos import composicao_from_apuracao, deducoes_from_apuracao  # noqa: E402
from app.models import Company, FiscalMonth  # noqa: E402

COMPANY_ID = "jpg"
UNIDADE = "lannic"
COMPETENCIA = "2026-08"
CNPJ = "48285395000142"

TOTAL_SAIDAS = 557733.52
DEVOLUCOES = 79398.46
BASE_MEMORIA = 478335.06  # total saídas − devoluções
RBT12 = 560212.54
RBA = 1038547.60
ALIQUOTA = 5.9369184503617  # %
DAS = 28398.35
PARTILHA = {
    "irpj": 1848.41,
    "csll": 1176.26,
    "cofins": 0.0,
    "pis": 0.0,
    "inss": 14115.16,
    "icms": 11258.52,
}


def build_lannic_agosto_2026() -> dict:
    apuracao = {
        "das": {"aRecolher": DAS, "apurado": DAS, "aliquota": ALIQUOTA},
        "fonte": "pgdas_simples_nacional",
    }
    pack = {
        "hasMovimentacao": False,
        "hasDre": False,
        "hasBalancete": False,
        "receitaBruta": BASE_MEMORIA,
        "cfopSaidasTotal": BASE_MEMORIA,
        "totalCompras": 0,
        "nfsEntradas": 0,
        "nfsSaidas": 0,
        "apuracao": apuracao,
        "memoriaSimples": {
            "regime": "Simples Nacional",
            "competencia": COMPETENCIA,
            "cnpj": CNPJ,
            "anexo": "I Comércio",
            "secao": "II ST",
            "tabela": "7 PIS/COFINS monofásicos",
            "faixa": "360000.01 a 720000.00",
            "fatorR": 1.0,
            "rbt12": RBT12,
            "rba": RBA,
            "totalSaidas": TOTAL_SAIDAS,
            "devolucoes": DEVOLUCOES,
            "baseMemoria": BASE_MEMORIA,
            "aliquota": ALIQUOTA,
            "das": DAS,
            "partilha": dict(PARTILHA),
            "fonte": "pgdas_simples_nacional",
        },
    }
    pack["composicao"] = composicao_from_apuracao(apuracao)
    pack["deducoes"] = deducoes_from_apuracao(apuracao)
    rb = float(pack["receitaBruta"] or 0)
    pack["dedPct"] = round(100 * float(pack["deducoes"]) / rb, 2) if pack["deducoes"] is not None and rb else None
    return pack


def upsert_lannic(db) -> str:
    company = db.query(Company).filter(Company.id == COMPANY_ID).first()
    if not company:
        raise SystemExit("Empresa jpg ausente. Rode scripts/seed.py antes.")
    pack = build_lannic_agosto_2026()
    row = (
        db.query(FiscalMonth)
        .filter(
            FiscalMonth.company_id == COMPANY_ID,
            FiscalMonth.competencia == COMPETENCIA,
            FiscalMonth.unidade == UNIDADE,
        )
        .first()
    )
    if row is None:
        row = FiscalMonth(
            company_id=COMPANY_ID,
            competencia=COMPETENCIA,
            unidade=UNIDADE,
            pack=pack,
        )
        db.add(row)
        return "INSERT"
    row.pack = pack
    flag_modified(row, "pack")
    return "UPDATE"


def main() -> None:
    db = SessionLocal()
    try:
        action = upsert_lannic(db)
        db.commit()
        print(f"{action} jpg/{UNIDADE}/{COMPETENCIA} DAS={DAS}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
