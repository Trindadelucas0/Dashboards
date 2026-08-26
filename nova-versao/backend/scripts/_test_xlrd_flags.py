from pathlib import Path

import xlrd

p = Path("/tmp/a.xls")
for kwargs in (
    {},
    {"ignore_workbook_corruption": True},
    {"formatting_info": False, "ignore_workbook_corruption": True},
):
    try:
        book = xlrd.open_workbook(str(p), **kwargs)
        print("OK", kwargs, "nsheets", book.nsheets, book.sheet_by_index(0).name, book.sheet_by_index(0).nrows)
        book.release_resources()
    except Exception as exc:
        print("FAIL", kwargs, exc)
