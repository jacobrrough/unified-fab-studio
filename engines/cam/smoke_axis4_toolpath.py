"""
Smoke-test axis4_toolpath.py with minimal JSON configs (exit 0 / non-zero).
Run from repo root: python engines/cam/smoke_axis4_toolpath.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).resolve().parent / "axis4_toolpath.py"


def run_cfg(cfg: dict) -> int:
    with tempfile.TemporaryDirectory() as td:
        tdir = Path(td)
        cfg_path = tdir / "cfg.json"
        out_path = tdir / "out.json"
        cfg = {**cfg, "toolpathJsonPath": str(out_path)}
        cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
        r = subprocess.run(
            [sys.executable, str(SCRIPT), str(cfg_path)],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        return r.returncode


def main() -> None:
    if not SCRIPT.is_file():
        print("missing axis4_toolpath.py", file=sys.stderr)
        sys.exit(2)
    parallel = run_cfg(
        {
            "strategy": "4axis_wrapping",
            "cylinderDiameterMm": 50,
            "cylinderLengthMm": 80,
            "stockLengthMm": 80,
            "zPassMm": -1,
            "wrapMode": "parallel",
            "stepoverDeg": 30,
        }
    )
    if parallel != 0:
        print("parallel wrap failed", parallel, file=sys.stderr)
        sys.exit(1)
    idx = run_cfg(
        {
            "strategy": "4axis_indexed",
            "cylinderDiameterMm": 40,
            "cylinderLengthMm": 60,
            "stockLengthMm": 60,
            "zPassMm": -0.5,
            "indexAnglesDeg": [0, 180],
        }
    )
    if idx != 0:
        print("indexed failed", idx, file=sys.stderr)
        sys.exit(1)
    sil = run_cfg(
        {
            "strategy": "4axis_wrapping",
            "cylinderDiameterMm": 50,
            "cylinderLengthMm": 80,
            "stockLengthMm": 80,
            "zPassMm": -1,
            "wrapMode": "silhouette_rough",
            "stepoverDeg": 5,
        }
    )
    if sil != 0:
        print("silhouette_rough failed", sil, file=sys.stderr)
        sys.exit(1)
    print("axis4 smoke OK")


if __name__ == "__main__":
    main()
