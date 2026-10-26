import json

from app.db import SessionLocal
from app.models import ImportRecord

db = SessionLocal()
try:
    for row in (
        db.query(ImportRecord)
        .filter(
            ImportRecord.company_id == "baifer",
            ImportRecord.competencia.in_(["2026-07", "2026-08", "2026-09"]),
        )
        .order_by(ImportRecord.competencia, ImportRecord.id)
    ):
        print(
            json.dumps(
                {
                    "id": row.id,
                    "competencia": row.competencia,
                    "tipo": row.tipo,
                    "status": row.status,
                    "file_name": row.file_name,
                    "meta": row.meta,
                    "pack_keys": sorted((row.pack_patch or {}).keys()),
                },
                ensure_ascii=False,
                default=str,
            )
        )
finally:
    db.close()

