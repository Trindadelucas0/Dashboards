from __future__ import annotations

import json
from pathlib import Path

from app.db import SessionLocal
from app.extract.aggregate import merge_entradas, merge_saidas
from app.extract.parse_movimento import ExtractedMovimento, Line
from app.extract.pipeline import classify_and_extract
from app.imports_revert import deep_merge
from app.models import FiscalMonth, ImportRecord, NfeLine


COMPANY = "baifer"
UNIT = "matriz"


def load(path: str):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def patch_for(db, import_id: int) -> dict:
    row = db.get(ImportRecord, import_id)
    if row is None or not row.pack_patch:
        raise RuntimeError(f"Importação {import_id} sem pack_patch")
    return row.pack_patch


def merge_many(*patches: dict) -> dict:
    out: dict = {}
    for patch in patches:
        out = deep_merge(out, patch or {})
    return out


def movement_patch(raw: dict, tipo: str) -> dict:
    lines = [
        Line(
            codigo=str(item.get("codigo") or ""),
            nota=str(item.get("nota") or ""),
            serie=str(item.get("serie") or ""),
            nome=str(item.get("nome") or ""),
            doc=str(item.get("doc") or ""),
            uf=str(item.get("uf") or ""),
            cfop=str(item.get("cfop") or ""),
            valor=float(item.get("valor") or 0),
        )
        for item in raw.get("lines") or []
    ]
    mov = ExtractedMovimento(
        tipo=tipo,
        company=str(raw.get("company") or ""),
        cnpj=str(raw.get("cnpj") or ""),
        period=str(raw.get("period") or ""),
        total_geral=float(raw.get("totalGeral") or 0),
        lines=lines,
        sheet=str(raw.get("sheet") or ""),
        parser="snapshot-restaurado",
    )
    return merge_entradas({}, mov) if tipo == "entradas" else merge_saidas({}, mov)


def month_row(db, competencia: str) -> FiscalMonth:
    row = (
        db.query(FiscalMonth)
        .filter_by(company_id=COMPANY, competencia=competencia, unidade=UNIT)
        .one()
    )
    return row


def mark_active(db, competencia: str, active_ids: list[int]) -> None:
    db.query(ImportRecord).filter_by(
        company_id=COMPANY, competencia=competencia, unidade=UNIT
    ).update({ImportRecord.status: "replaced"}, synchronize_session=False)
    db.query(ImportRecord).filter(ImportRecord.id.in_(active_ids)).update(
        {ImportRecord.status: "ok"}, synchronize_session=False
    )


def add_lines(db, raw: dict, tipo: str, import_id: int) -> int:
    count = 0
    for item in raw.get("lines") or []:
        db.add(
            NfeLine(
                company_id=COMPANY,
                competencia="2026-07",
                unidade=UNIT,
                tipo=tipo,
                nota=str(item.get("nota") or ""),
                serie=str(item.get("serie") or ""),
                cfop=str(item.get("cfop") or ""),
                valor=float(item.get("valor") or 0),
                nome=str(item.get("nome") or ""),
                doc=str(item.get("doc") or ""),
                uf=str(item.get("uf") or ""),
                import_id=import_id,
            )
        )
        count += 1
    return count


def main() -> None:
    jul_snapshot = load("/tmp/baifer-07.json")["pack"]
    jul_ent = load("/tmp/baifer-entradas.json")
    jul_sai = load("/tmp/baifer-saidas.json")
    st_rows = load("/tmp/baifer-icms-st.json")
    jul_st = next(row["pack_patch"] for row in st_rows if row["competencia"] == "2026-07")

    august_standard = classify_and_extract(
        Path("/app/fixtures/baifer-padrao/planilha-padrao-baifer-082026.xlsx")
    )
    august_tax_patches = [
        part.get("pack_patch") or {}
        for part in august_standard.get("parts") or []
        if part.get("tipo") in {"apuracao_5005", "pis_cofins", "icms_st"}
    ]

    db = SessionLocal()
    try:
        before = {
            month: month_row(db, month).pack
            for month in ("2026-07", "2026-08", "2026-09")
        }
        Path("/tmp/baifer-before-restore.json").write_text(
            json.dumps(before, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        jul_pack = merge_many(
            jul_snapshot,
            movement_patch(jul_ent, "entradas"),
            movement_patch(jul_sai, "saidas"),
            jul_st,
            patch_for(db, 512),
            patch_for(db, 515),
        )
        # O snapshot fiscal preserva os valores de ICMS/PIS/COFINS; a importação
        # 5005 posterior acrescentou a subvenção, cujo total ficou no histórico.
        jul_pack.setdefault("apuracao", {})["subvencao"] = 59266.56
        jul_pack["subvencao"] = 59266.56
        month_row(db, "2026-07").pack = jul_pack
        mark_active(db, "2026-07", [4, 9, 16, 22, 77, 128, 512, 515])

        august_movement = {
            "hasMovimentacao": True,
            "totalCompras": 392921.03,
            "nfsEntradas": 216,
            "entradasMeta": {
                "totalGeralExcel": 392921.03,
                "soma": 392921.03,
                "delta": 0.0,
                "parser": "historico-restaurado",
            },
            "cfopSaidasTotal": 574674.96,
            "nfsSaidas": 440,
            "saidasMeta": {
                "totalGeralExcel": 574674.96,
                "soma": 574674.96,
                "delta": 0.0,
                "parser": "historico-restaurado",
            },
        }
        aug_pack = merge_many(
            august_movement,
            *august_tax_patches,
            patch_for(db, 513),
            patch_for(db, 516),
        )
        month_row(db, "2026-08").pack = aug_pack
        mark_active(db, "2026-08", [319, 320, 324, 325, 326, 513, 516])

        sep_pack = merge_many(
            patch_for(db, 500),
            patch_for(db, 501),
            patch_for(db, 495),
            patch_for(db, 514),
            patch_for(db, 517),
        )
        month_row(db, "2026-09").pack = sep_pack
        mark_active(db, "2026-09", [495, 500, 501, 514, 517])

        db.query(NfeLine).filter(
            NfeLine.company_id == COMPANY,
            NfeLine.competencia == "2026-07",
            NfeLine.unidade == UNIT,
        ).delete(synchronize_session=False)
        line_count = add_lines(db, jul_ent, "entradas", 16)
        line_count += add_lines(db, jul_sai, "saidas", 22)

        db.commit()
        print(
            json.dumps(
                {
                    "restored": ["2026-07", "2026-08", "2026-09"],
                    "july_nfe_lines": line_count,
                    "july": {
                        "totalCompras": jul_pack.get("totalCompras"),
                        "cfopSaidasTotal": jul_pack.get("cfopSaidasTotal"),
                        "hasBalancete": jul_pack.get("hasBalancete"),
                        "hasDre": jul_pack.get("hasDre"),
                    },
                    "august": {
                        "totalCompras": aug_pack.get("totalCompras"),
                        "cfopSaidasTotal": aug_pack.get("cfopSaidasTotal"),
                        "hasBalancete": aug_pack.get("hasBalancete"),
                        "hasDre": aug_pack.get("hasDre"),
                    },
                    "september": {
                        "totalCompras": sep_pack.get("totalCompras"),
                        "cfopSaidasTotal": sep_pack.get("cfopSaidasTotal"),
                        "hasBalancete": sep_pack.get("hasBalancete"),
                        "hasDre": sep_pack.get("hasDre"),
                    },
                },
                ensure_ascii=False,
            )
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
