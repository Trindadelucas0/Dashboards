from pathlib import Path

from app.extract.pipeline import classify_and_extract

for p in (Path("/tmp/a.xls"), Path("/tmp/e.xls")):
    r = classify_and_extract(p)
    print(
        p.name,
        "tipo=",
        r.get("tipo"),
        "emp=",
        r.get("company_id"),
        "comp=",
        r.get("competencia"),
        "errors=",
        r.get("errors"),
        "ok=",
        not r.get("errors"),
    )
