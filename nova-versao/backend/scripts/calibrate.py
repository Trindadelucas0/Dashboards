from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import get_settings  # noqa: E402
from app.extract.pipeline import classify_and_extract  # noqa: E402


def main() -> None:
    settings = get_settings()
    folder = settings.planilhas_path
    files = sorted(folder.rglob("*.xls")) + sorted(folder.rglob("*.xlsx"))
    report = []
    for path in files:
        try:
            result = classify_and_extract(path)
            report.append(
                {
                    "file": str(path.relative_to(folder)),
                    "ok": not result["errors"],
                    "tipo": result.get("tipo"),
                    "company_id": result.get("company_id"),
                    "competencia": result.get("competencia"),
                    "unidade": result.get("unidade"),
                    "delta": (result.get("meta") or {}).get("delta"),
                    "soma": (result.get("meta") or {}).get("soma"),
                    "errors": result.get("errors"),
                    "parser": result.get("parser"),
                }
            )
            flag = "OK" if not result["errors"] else "ERRO"
            print(f"{flag:4} {path.name} -> {result.get('company_id')} {result.get('competencia')} {result.get('tipo')}")
            for err in result.get("errors") or []:
                print("     ", err)
        except Exception as exc:  # noqa: BLE001
            report.append({"file": str(path), "ok": False, "errors": [str(exc)]})
            print("FAIL", path.name, exc)
    out = ROOT / "tmp"
    out.mkdir(exist_ok=True)
    (out / "calibrate-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Relatório em backend/tmp/calibrate-report.json")


if __name__ == "__main__":
    main()
