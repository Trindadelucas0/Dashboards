from app.db import SessionLocal
from app.models import FiscalMonth
from app.routers.companies import _is_empty

db = SessionLocal()
print("comp empty_dre empty_bal hasDre linhas lucLiq contas ativo")
for m in db.query(FiscalMonth).filter(FiscalMonth.company_id == "baifer").order_by(FiscalMonth.competencia):
    pack = m.pack or {}
    dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
    bal = pack.get("balancete") if isinstance(pack.get("balancete"), dict) else {}
    print(
        m.competencia,
        _is_empty("dre", pack, m),
        _is_empty("balancete", pack, m),
        bool(pack.get("hasDre")),
        len(dre.get("linhas") or []),
        pack.get("lucLiq"),
        len(bal.get("contas") or []),
        (bal.get("totais") or {}).get("ativo"),
    )
db.close()
