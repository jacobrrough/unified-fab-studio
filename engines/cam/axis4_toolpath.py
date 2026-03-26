"""
4-axis (A rotary) toolpath engine for Unified Fab Studio.

No external dependencies — pure Python (stdlib + json/math).
Reads a JSON config, generates G-code with X Z A words for cylindrical
wrapping or indexed rotation ops, and writes the result to a JSON file.

IPC contract
------------
- argv: python axis4_toolpath.py <config.json>
- config keys (required): stlPath | contourPoints, toolpathJsonPath,
  strategy ('4axis_wrapping' | '4axis_indexed')
- config keys (optional, with defaults):
    cylinderDiameterMm  (float, default 50) — stock cylinder outer diameter
    aAxisOrientation    ('x'|'y', default 'x') — rotation axis
    wrapMode            ('contour'|'raster'|'parallel', default 'parallel')
    zPassMm             (float, default -1.0) — depth below cylinder surface
    stepoverDeg         (float, default 5.0) — angular stepover for parallel
    feedMmMin           (float, default 800)
    plungeMmMin         (float, default 300)
    safeZMm             (float, default 10.0) — radial clearance above stock
    toolDiameterMm      (float, default 3.175)
    indexAnglesDeg      (list[float]) — for 4axis_indexed: A stops to machine
    cylinderLengthMm    (float, default 100) — axial length for parallel passes
- Success: exit 0; write toolpathJsonPath with
    {"ok": true, "toolpathLines": [...], "strategy": "..."}
- Failure: non-zero exit; print {"ok": false, "error": "...", "detail": "..."}
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ALLOWED_STRATEGIES = frozenset({"4axis_wrapping", "4axis_indexed"})


# ─── helpers ──────────────────────────────────────────────────────────────────

def _die(error: str, detail: str | None = None, code: int = 2) -> None:
    payload: dict[str, Any] = {"ok": False, "error": error}
    if detail is not None:
        payload["detail"] = detail
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def _float_param(cfg: dict[str, Any], key: str, default: float) -> float:
    v = cfg.get(key, default)
    if v is None:
        v = default
    try:
        v = float(v)
    except (TypeError, ValueError):
        _die("invalid_numeric_params", f"{key} must be a finite number")
    if not math.isfinite(v):
        _die("invalid_numeric_params", f"{key} must be finite")
    return v


def _load_cfg() -> dict[str, Any]:
    if len(sys.argv) < 2:
        _die("usage", "axis4_toolpath.py <config.json>", code=2)
    p = Path(sys.argv[1])
    try:
        raw = p.read_text(encoding="utf-8")
    except FileNotFoundError:
        _die("config_not_found", str(p), code=2)
    except OSError as e:
        _die("config_read_error", str(e), code=2)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        _die("invalid_config_json", f"{e.msg} at line {e.lineno}", code=2)
    if not isinstance(data, dict):
        _die("invalid_config_shape", "root must be a JSON object", code=2)
    return data


# ─── strategy: 4-axis wrapping (cylindrical) ─────────────────────────────────

def _wrap_linear_to_a_deg(linear_mm: float, cylinder_diameter_mm: float) -> float:
    """
    Map a linear distance (mm) along the cylinder circumference to an A-axis
    angle (degrees).

    circumference = π × D
    angle = (linear_mm / circumference) × 360°
    """
    circ = math.pi * cylinder_diameter_mm
    if circ <= 0:
        return 0.0
    return (linear_mm / circ) * 360.0


def _gen_parallel_wrapping(
    *,
    cylinder_diameter_mm: float,
    cylinder_length_mm: float,
    z_pass_mm: float,
    stepover_deg: float,
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
    a_axis_orientation: str,
) -> list[str]:
    """
    Generate cylindrical parallel finishing passes.

    The strategy makes constant-Z (depth) passes along the X axis, stepping
    the A axis by stepover_deg between passes. This produces a "barber pole"
    pattern suitable for relief carving and general surface finishing on
    cylindrical stock.

    X = axial position (0 → cylinder_length_mm)
    Z = radial depth (0 = surface, negative = into material)
    A = rotation angle in degrees

    Coordinate convention (Carvera 4th-axis, A rotates around X):
      - X travel covers cylinder length
      - Z is radial (tool moves in/out of the cylinder surface)
      - A rotates the workpiece
    """
    radius = cylinder_diameter_mm / 2.0
    cut_z = radius + z_pass_mm   # z_pass_mm is negative (cuts into surface)
    clear_z = radius + safe_z_mm

    # clamp stepover to sensible range
    step = max(1.0, min(float(stepover_deg), 90.0))

    lines: list[str] = []
    lines.append(f"; 4-axis cylindrical parallel — D={cylinder_diameter_mm:.1f}mm, "
                 f"L={cylinder_length_mm:.1f}mm, step={step:.1f}°")
    lines.append(f"; A-axis orientation: rotation around {a_axis_orientation.upper()}")
    lines.append(f"; VERIFY: cylinder diameter, stock zero (top of cylinder), A WCS home")

    a_angle = 0.0
    pass_num = 0
    direction = 1  # 1 = X+, -1 = X-  (bidirectional for efficiency)

    while a_angle <= 360.0 + 1e-6:
        lines.append(f"; Pass {pass_num + 1}  A={a_angle:.2f}°")
        # Retract to clearance
        lines.append(f"G0 Z{clear_z:.3f}")
        # Rotate to angle
        lines.append(f"G0 A{a_angle:.3f}")

        if direction == 1:
            x_start, x_end = 0.0, cylinder_length_mm
        else:
            x_start, x_end = cylinder_length_mm, 0.0

        # Move to start X at clearance
        lines.append(f"G0 X{x_start:.3f}")
        # Plunge to cut depth
        lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}")
        # Cut pass
        lines.append(f"G1 X{x_end:.3f} F{feed_mm_min:.0f}")

        a_angle += step
        pass_num += 1
        direction *= -1  # alternate direction

    # Final retract
    lines.append(f"G0 Z{clear_z:.3f}")
    lines.append("G0 A0 ; return A to home")
    return lines


def _gen_contour_wrapping(
    *,
    contour_points: list[tuple[float, float]],
    cylinder_diameter_mm: float,
    z_pass_mm: float,
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
) -> list[str]:
    """
    Wrap a 2D contour (X, linear_Y) onto the cylinder surface.

    contour_points: list of (x_mm, y_mm) where y_mm is the linear wrap
    position on the cylinder circumference. y_mm is converted to A degrees.

    Generates a single wrapped contour pass.
    """
    radius = cylinder_diameter_mm / 2.0
    cut_z = radius + z_pass_mm
    clear_z = radius + safe_z_mm

    lines: list[str] = []
    lines.append(f"; 4-axis contour wrapping — D={cylinder_diameter_mm:.1f}mm, "
                 f"{len(contour_points)} pts")
    lines.append(f"G0 Z{clear_z:.3f}  ; safe clearance")

    if not contour_points:
        return lines

    first_x, first_y = contour_points[0]
    first_a = _wrap_linear_to_a_deg(first_y, cylinder_diameter_mm)

    lines.append(f"G0 X{first_x:.3f} A{first_a:.3f}  ; rapid to contour start")
    lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}  ; plunge to cut depth")

    for x_mm, y_mm in contour_points[1:]:
        a_deg = _wrap_linear_to_a_deg(y_mm, cylinder_diameter_mm)
        lines.append(f"G1 X{x_mm:.3f} A{a_deg:.3f} F{feed_mm_min:.0f}")

    lines.append(f"G0 Z{clear_z:.3f}")
    lines.append("G0 A0 ; return A to home")
    return lines


# ─── strategy: 4-axis indexed ─────────────────────────────────────────────────

def _gen_indexed_passes(
    *,
    index_angles_deg: list[float],
    cylinder_diameter_mm: float,
    cylinder_length_mm: float,
    z_pass_mm: float,
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
) -> list[str]:
    """
    4-axis indexed: lock A at each discrete angle and run a 3-axis XZ facing
    pass across the cylinder length. Useful for milling flat faces on round
    stock (flats, keyways, etc.).

    Between angle changes the tool retracts to safe_z_mm (radial clearance).
    """
    radius = cylinder_diameter_mm / 2.0
    cut_z = radius + z_pass_mm
    clear_z = radius + safe_z_mm

    lines: list[str] = []
    lines.append(f"; 4-axis indexed — {len(index_angles_deg)} index positions")
    lines.append(f"; D={cylinder_diameter_mm:.1f}mm, L={cylinder_length_mm:.1f}mm")
    lines.append("; VERIFY: A zero, stock zero, each index angle before running")

    for i, angle in enumerate(index_angles_deg):
        lines.append(f"; Index {i + 1} of {len(index_angles_deg)}  A={angle:.2f}°")
        lines.append(f"G0 Z{clear_z:.3f}  ; retract before rotation")
        lines.append(f"G0 A{angle:.3f}   ; rotate to index — confirm spindle is OFF if needed")
        lines.append(f"; Confirm workpiece is locked / spindle re-enabled before proceeding")
        lines.append(f"G0 X0.000  ; move to start")
        lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}")
        lines.append(f"G1 X{cylinder_length_mm:.3f} F{feed_mm_min:.0f}")
        lines.append(f"G0 Z{clear_z:.3f}")

    lines.append("G0 A0 ; return A to home position")
    return lines


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:  # noqa: C901
    cfg = _load_cfg()

    if "toolpathJsonPath" not in cfg or not cfg["toolpathJsonPath"]:
        _die("config_missing_keys", "toolpathJsonPath", code=2)

    out_json = Path(str(cfg["toolpathJsonPath"]))
    raw_strategy = cfg.get("strategy", "4axis_wrapping")
    if raw_strategy not in ALLOWED_STRATEGIES:
        _die("invalid_strategy",
             f"must be one of {sorted(ALLOWED_STRATEGIES)}, got {raw_strategy!r}", code=2)

    strategy = str(raw_strategy)

    # common params
    cyl_d = _float_param(cfg, "cylinderDiameterMm", 50.0)
    cyl_l = _float_param(cfg, "cylinderLengthMm", 100.0)
    z_pass = _float_param(cfg, "zPassMm", -1.0)
    feed = _float_param(cfg, "feedMmMin", 800.0)
    plunge = _float_param(cfg, "plungeMmMin", 300.0)
    safe_z = _float_param(cfg, "safeZMm", 10.0)
    tool_d = _float_param(cfg, "toolDiameterMm", 3.175)
    a_orient = str(cfg.get("aAxisOrientation", "x")).lower()
    if a_orient not in ("x", "y"):
        a_orient = "x"

    if cyl_d <= 0:
        _die("invalid_numeric_params", "cylinderDiameterMm must be > 0")
    if tool_d <= 0:
        _die("invalid_numeric_params", "toolDiameterMm must be > 0")
    if feed <= 0:
        _die("invalid_numeric_params", "feedMmMin must be > 0")

    try:
        if strategy == "4axis_wrapping":
            wrap_mode = str(cfg.get("wrapMode", "parallel")).lower()
            stepover_deg = _float_param(cfg, "stepoverDeg", 5.0)

            if wrap_mode == "contour":
                # Expect contourPoints: [[x, y], ...]
                raw_pts = cfg.get("contourPoints", [])
                if not isinstance(raw_pts, list) or len(raw_pts) < 2:
                    _die("invalid_contour_points",
                         "contourPoints must be a list of ≥2 [x, y] pairs for contour wrapping")
                try:
                    pts = [(float(p[0]), float(p[1])) for p in raw_pts]
                except (TypeError, IndexError, ValueError) as e:
                    _die("invalid_contour_points", str(e))
                lines = _gen_contour_wrapping(
                    contour_points=pts,
                    cylinder_diameter_mm=cyl_d,
                    z_pass_mm=z_pass,
                    feed_mm_min=feed,
                    plunge_mm_min=plunge,
                    safe_z_mm=safe_z,
                )
            else:
                # Default: parallel passes
                lines = _gen_parallel_wrapping(
                    cylinder_diameter_mm=cyl_d,
                    cylinder_length_mm=cyl_l,
                    z_pass_mm=z_pass,
                    stepover_deg=stepover_deg,
                    feed_mm_min=feed,
                    plunge_mm_min=plunge,
                    safe_z_mm=safe_z,
                    a_axis_orientation=a_orient,
                )

        elif strategy == "4axis_indexed":
            raw_angles = cfg.get("indexAnglesDeg", [0, 90, 180, 270])
            if not isinstance(raw_angles, list) or len(raw_angles) == 0:
                _die("invalid_index_angles",
                     "indexAnglesDeg must be a non-empty list of angles (degrees)")
            try:
                angles = [float(a) for a in raw_angles]
            except (TypeError, ValueError) as e:
                _die("invalid_index_angles", str(e))
            lines = _gen_indexed_passes(
                index_angles_deg=angles,
                cylinder_diameter_mm=cyl_d,
                cylinder_length_mm=cyl_l,
                z_pass_mm=z_pass,
                feed_mm_min=feed,
                plunge_mm_min=plunge,
                safe_z_mm=safe_z,
            )
        else:
            _die("invalid_strategy", strategy)

    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        _die("runtime_error", str(e), code=3)

    if not lines:
        _die("empty_toolpath", f"strategy {strategy!r} produced no toolpath lines", code=4)

    payload = {"ok": True, "toolpathLines": lines, "strategy": strategy}
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "lines": len(lines), "strategy": strategy}, ensure_ascii=False))


if __name__ == "__main__":
    main()
