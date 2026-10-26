from app.db import SessionLocal
from app.models import FiscalMonth, ImportRecord, NfeLine
from sqlalchemy import func, text

db = SessionLocal()
try:
    print("MONTHS")
    for row in (
        db.query(FiscalMonth)
        .filter(FiscalMonth.company_id == "baifer")
        .order_by(FiscalMonth.competencia, FiscalMonth.unidade)
    ):
        print(row.competencia, row.unidade, row.updated_at, sorted((row.pack or {}).keys()))

    print("IMPORTS")
    for row in (
        db.query(ImportRecord)
        .filter(ImportRecord.company_id == "baifer")
        .order_by(ImportRecord.competencia, ImportRecord.id)
    ):
        print(
            row.id,
            row.competencia,
            row.unidade,
            row.tipo,
            row.status,
            row.created_at,
            row.file_name,
            "patch=", sorted((row.pack_patch or {}).keys()),
            "source=", bool(row.source_file_hash),
        )

    print("NFE_COUNTS")
    for row in (
        db.query(
            NfeLine.competencia,
            NfeLine.unidade,
            NfeLine.tipo,
            func.count(NfeLine.id),
            func.sum(NfeLine.valor),
        )
        .filter(NfeLine.company_id == "baifer")
        .group_by(NfeLine.competencia, NfeLine.unidade, NfeLine.tipo)
        .order_by(NfeLine.competencia, NfeLine.unidade, NfeLine.tipo)
    ):
        print(*row)

    print("DB_STATS")
    print(db.execute(text("select current_database(), current_user, version()")) .one())
    for row in db.execute(
        text(
            "select relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum "
            "from pg_stat_user_tables where relname in "
            "('fiscal_months','imports','nfe_lines') order by relname"
        )
    ):
        print(*row)
    print("EXTENSIONS")
    for row in db.execute(
        text(
            "select name, installed_version from pg_available_extensions "
            "where name in ('pageinspect','pg_dirtyread') order by name"
        )
    ):
        print(*row)
finally:
    db.close()
