from app.db import SessionLocal
from app.models import FiscalMonth
from app.routers.companies import build_dre_por_mes, _is_empty, _slice

db = SessionLocal()
months = (
    db.query(FiscalMonth)
    .filter(FiscalMonth.company_id == "baifer", FiscalMonth.unidade == "matriz")
    .order_by(FiscalMonth.competencia)
    .all()
)
por = build_dre_por_mes(months, "2026")
print("porMes", len(por), [m["competencia"] for m in por])
row = next((m for m in months if m.competencia == "2026-01"), None)
pack = row.pack if row else {}
print("empty_jan", _is_empty("dre", pack, row), "linhas", len((_slice("dre", pack).get("dre") or {}).get("linhas") or []))
print("kpi_jan_rb", por[0]["receitaBruta"] if por else None, "lucLiq", por[0]["lucLiq"] if por else None)
db.close()
