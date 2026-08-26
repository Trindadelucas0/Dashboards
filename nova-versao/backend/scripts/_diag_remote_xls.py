import importlib.util
import sys
from pathlib import Path

print("platform", sys.platform)
print("xlrd", bool(importlib.util.find_spec("xlrd")))
print("win32com", bool(importlib.util.find_spec("win32com")))
print("olefile", bool(importlib.util.find_spec("olefile")))

# try reading a fixture if present
cands = list(Path("/app").rglob("*.xls"))[:5]
print("xls_found", len(cands), [str(p) for p in cands])
if cands:
    p = cands[0]
    data = p.read_bytes()[:16]
    print("magic", data.hex())
    try:
        from app.extract.workbook import load_all_sheets

        sheets = load_all_sheets(p)
        print("OK sheets", len(sheets), sheets[0].sheet_name, len(sheets[0].rows))
    except Exception as exc:
        print("FAIL", type(exc).__name__, exc)
