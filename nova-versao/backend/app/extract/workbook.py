from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup

OLE_MAGIC = b"\xd0\xcf\x11\xe0"
ZIP_MAGIC = b"PK"


@dataclass
class WorkbookGrid:
    path: str
    sheet_name: str
    rows: list[list[str]] = field(default_factory=list)
    kind: str = "unknown"

    def cell(self, r: int, c: int) -> str:
        if r < 0 or r >= len(self.rows):
            return ""
        row = self.rows[r]
        if c < 0 or c >= len(row):
            return ""
        return str(row[c] or "").strip()

    def row(self, r: int) -> list[str]:
        if r < 0 or r >= len(self.rows):
            return []
        return [str(x or "").strip() for x in self.rows[r]]


def is_placeholder_bytes(data: bytes) -> bool:
    """OneDrive/cópia falha: arquivo presente no disco, conteúdo zerado."""
    if not data:
        return True
    return not any(data[:2048])


def sniff(data: bytes) -> str:
    if is_placeholder_bytes(data):
        return "empty"
    head = data[:16]
    if head.startswith(OLE_MAGIC):
        return "xls"
    if head.startswith(ZIP_MAGIC):
        return "xlsx"
    sample = data[:4000].lstrip().lower()
    if sample.startswith(b"<html") or sample.startswith(b"<!doctype") or b"<table" in sample:
        return "html"
    if b"<?xml" in sample[:200]:
        return "xml"
    return "unknown"


def _html_to_grid(html: str) -> list[list[str]]:
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    if not tables:
        return []
    best = max(tables, key=lambda t: len(t.find_all("tr")))
    grid: list[list[str]] = []
    for tr in best.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        grid.append([c.get_text(" ", strip=True) for c in cells])
    return grid


def safe_unlink(path: str | Path, attempts: int = 5) -> None:
    """Apaga arquivo temporário sem derrubar o preview se o Windows ainda o estiver usando."""
    p = Path(path)
    for i in range(attempts):
        try:
            p.unlink(missing_ok=True)
            return
        except OSError:
            time.sleep(0.12 * (i + 1))
    try:
        p.unlink(missing_ok=True)
    except OSError:
        pass


def _xlrd_grid(path: Path) -> tuple[str, list[list[str]]]:
    import xlrd

    book = xlrd.open_workbook(str(path), formatting_info=False)
    try:
        sheet = book.sheet_by_index(0)
        rows = []
        for r in range(sheet.nrows):
            row = []
            for c in range(sheet.ncols):
                val = sheet.cell_value(r, c)
                if isinstance(val, float) and val == int(val):
                    row.append(str(int(val)))
                else:
                    row.append(str(val).strip() if val is not None else "")
            rows.append(row)
        return sheet.name, rows
    finally:
        book.release_resources()


def _openpyxl_grid(path: Path, data: bytes | None = None) -> tuple[str, list[list[str]]]:
    from openpyxl import load_workbook

    src = BytesIO(data if data is not None else path.read_bytes())
    wb = load_workbook(src, data_only=True, read_only=True)
    try:
        ws = wb.worksheets[0]
        title = ws.title
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(["" if v is None else str(v).strip() for v in row])
        return title, rows
    finally:
        wb.close()
        src.close()


def _cell_to_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return str(val)
    if hasattr(val, "strftime"):
        try:
            return val.strftime("%d/%m/%Y")
        except Exception:  # noqa: BLE001
            return str(val)
    return str(val).strip()


_excel_lock = None
_excel_app = None


def _excel():
    global _excel_lock, _excel_app
    import threading
    import win32com.client  # type: ignore

    if _excel_lock is None:
        _excel_lock = threading.Lock()
    with _excel_lock:
        try:
            if _excel_app is not None:
                _excel_app.Visible
                return _excel_app
        except Exception:  # noqa: BLE001
            _excel_app = None
        app = win32com.client.Dispatch("Excel.Application")
        app.Visible = False
        app.DisplayAlerts = False
        app.ScreenUpdating = False
        _excel_app = app
        return _excel_app


def _com_grid(path: Path) -> tuple[str, list[list[str]]]:
    global _excel_app
    last: Exception | None = None
    for attempt in range(2):
        try:
            excel = _excel()
            wb = excel.Workbooks.Open(str(path.resolve()), ReadOnly=True)
            try:
                ws = wb.Worksheets(1)
                used = ws.UsedRange
                raw = used.Value
                rows: list[list[str]] = []
                if raw is None:
                    pass
                elif not isinstance(raw, tuple):
                    rows = [[_cell_to_str(raw)]]
                else:
                    for row in raw:
                        if not isinstance(row, tuple):
                            rows.append([_cell_to_str(row)])
                        else:
                            rows.append([_cell_to_str(c) for c in row])
                name = str(ws.Name)
                return name, rows
            finally:
                wb.Close(False)
        except Exception as exc:  # noqa: BLE001
            last = exc
            _excel_app = None
            if attempt == 0:
                time.sleep(0.4)
    raise last or RuntimeError("Excel COM falhou")


def load_workbook(path: str | Path, data: bytes | None = None) -> WorkbookGrid:
    path = Path(path)
    if data is None:
        data = path.read_bytes()
    kind = sniff(data)
    errors: list[str] = []

    if kind == "empty":
        raise RuntimeError(f"{path.name}: arquivo vazio ou não baixado")

    if kind == "html":
        try:
            text = data.decode("latin-1", errors="ignore")
            rows = _html_to_grid(text)
            sheet = "HTML"
            title_m = re.search(r"<title>([^<]+)</title>", text, re.I)
            if title_m:
                sheet = title_m.group(1).strip()[:80]
            return WorkbookGrid(str(path), sheet, rows, "html")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"html:{exc}")

    if kind == "xlsx":
        try:
            name, rows = _openpyxl_grid(path, data)
            return WorkbookGrid(str(path), name, rows, "xlsx")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"openpyxl:{exc}")

    if kind in ("xls", "unknown"):
        try:
            name, rows = _xlrd_grid(path)
            return WorkbookGrid(str(path), name, rows, "xls")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"xlrd:{exc}")
        try:
            name, rows = _com_grid(path)
            return WorkbookGrid(str(path), name, rows, "com")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"com:{exc}")
        try:
            text = data.decode("latin-1", errors="ignore")
            if "<table" in text.lower():
                rows = _html_to_grid(text)
                return WorkbookGrid(str(path), "HTML", rows, "html")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"html-fallback:{exc}")

    raise RuntimeError(f"Não foi possível ler {path.name}: {'; '.join(errors)}")
