from pathlib import Path

p = Path("/tmp/a.xls")
try:
    from python_calamine import CalamineWorkbook

    wb = CalamineWorkbook.from_path(str(p))
    print("calamine OK", wb.sheet_names)
    rows = wb.get_sheet_by_index(0).to_python()
    print("rows", len(rows), "sample", rows[:3])
except Exception as exc:
    print("calamine FAIL", type(exc).__name__, exc)
