from pathlib import Path

from app.extract.classify import EMPTY_FILE_ERROR
from app.extract.pipeline import classify_and_extract
from app.extract.workbook import is_placeholder_bytes, safe_unlink


def test_safe_unlink_missing_file(tmp_path: Path):
    safe_unlink(tmp_path / "nao-existe.xls")


def test_safe_unlink_removes_file(tmp_path: Path):
    target = tmp_path / "tmp.xls"
    target.write_bytes(b"x")
    safe_unlink(target)
    assert not target.exists()


def test_safe_unlink_swallows_oserror(monkeypatch, tmp_path: Path):
    target = tmp_path / "locked.xls"
    target.write_bytes(b"x")

    def boom(*_args, **_kwargs):
        raise OSError(32, "locked")

    monkeypatch.setattr(Path, "unlink", boom)
    safe_unlink(target, attempts=2)


def test_placeholder_bytes():
    assert is_placeholder_bytes(b"")
    assert is_placeholder_bytes(b"\x00" * 4096)
    assert not is_placeholder_bytes(b"\x00" * 10 + b"PK")


def test_placeholder_file_returns_empty_error(tmp_path: Path):
    target = tmp_path / "Saida por cliente filial MG.xls"
    target.write_bytes(b"\x00" * 16384)
    result = classify_and_extract(target)
    assert EMPTY_FILE_ERROR in result["errors"]
    assert result["tipo"] == "saidas"
