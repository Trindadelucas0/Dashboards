from pathlib import Path

from app.extract.workbook import load_all_sheets

paths = [
    Path("/tmp/a.xls"),
    Path("/tmp/e.xls"),
    Path("/app/fixtures/egaplast-padrao/Entradas.xls"),
    Path("/app/fixtures/baifer-padrao/Entradas 01-2026.xls"),
]
for p in paths:
    if not p.exists():
        print("MISSING", p)
        continue
    try:
        sheets = load_all_sheets(p)
        print("OK", p.name, "sheets", len(sheets), sheets[0].sheet_name, "rows", len(sheets[0].rows))
    except Exception as exc:
        print("FAIL", p.name, exc)
