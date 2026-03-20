"""
Optional STEP → STL: pip install cadquery
Used by the OCCT import bridge from the Electron main process.

Stdout contract: emit exactly one JSON object on the last line (Node parses the final
non-empty line from combined stdout/stderr). Do not print other stdout lines.
Success: {"ok": true, "out": "<absolute or as-passed stl path>"}
Failure: {"ok": false, "error": "<code>", "detail": "<message>"?}

Error codes: usage, step_file_not_found, step_stat_failed, step_file_empty,
cadquery_not_installed, stl_output_dir_failed, stl_path_is_directory,
step_import_failed, stl_export_failed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _emit(obj: dict, code: int) -> None:
    print(json.dumps(obj), file=sys.stdout, flush=True)
    sys.exit(code)


def main() -> None:
    if len(sys.argv) < 3:
        _emit(
            {
                "ok": False,
                "error": "usage",
                "detail": "step_to_stl.py <file.step> <out.stl>",
            },
            2,
        )
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    if not src.is_file():
        _emit(
            {
                "ok": False,
                "error": "step_file_not_found",
                "detail": str(src.resolve()),
            },
            1,
        )

    try:
        st = src.stat()
    except OSError as e:
        _emit(
            {
                "ok": False,
                "error": "step_stat_failed",
                "detail": str(e),
            },
            1,
        )

    if st.st_size == 0:
        _emit(
            {
                "ok": False,
                "error": "step_file_empty",
                "detail": str(src.resolve()),
            },
            1,
        )

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        _emit(
            {
                "ok": False,
                "error": "stl_output_dir_failed",
                "detail": str(e),
            },
            1,
        )

    if dst.exists() and dst.is_dir():
        _emit(
            {
                "ok": False,
                "error": "stl_path_is_directory",
                "detail": str(dst.resolve()),
            },
            1,
        )

    try:
        import cadquery as cq  # type: ignore
    except Exception as e:  # noqa: BLE001
        _emit({"ok": False, "error": "cadquery_not_installed", "detail": str(e)}, 1)

    try:
        wp = cq.importers.importStep(str(src.resolve()))
    except Exception as e:  # noqa: BLE001
        _emit({"ok": False, "error": "step_import_failed", "detail": str(e)}, 1)

    try:
        cq.exporters.export(wp, str(dst.resolve()), exportType="STL")
    except Exception as e:  # noqa: BLE001
        _emit({"ok": False, "error": "stl_export_failed", "detail": str(e)}, 1)

    _emit({"ok": True, "out": str(dst.resolve())}, 0)


if __name__ == "__main__":
    main()
