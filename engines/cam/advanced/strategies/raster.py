"""
Raster (parallel) finishing strategy.

Generates zigzag passes across the part surface, riding the heightfield.
Best for gently curved surfaces where waterline would produce sparse paths.

Features:
- Zigzag scan pattern to minimize retracts
- Heightfield-based Z tracking (tool follows surface)
- Configurable scan direction (X or Y primary)
- Lift detection: retracts only over air gaps, not continuous surface
"""
from __future__ import annotations

import math

from ..models import ToolpathChain, ToolpathJob, ToolpathResult
from ..geometry import Mesh, Heightfield, build_heightfield


def generate_raster(job: ToolpathJob, mesh: Mesh) -> ToolpathResult:
    """Generate raster finishing toolpath following mesh surface."""
    result = ToolpathResult(strategy="raster")
    bounds = mesh.bounds
    tool_r = job.tool.radius
    stepover = job.cuts.stepover_mm
    safe_z = job.cuts.safe_z_mm
    feed = job.cuts.feed_mm_min
    plunge = job.cuts.plunge_mm_min

    # Build heightfield with tool compensation
    resolution = max(0.1, min(stepover / 2, job.tolerance_mm * 10))
    hf = build_heightfield(mesh, resolution_mm=resolution, tool_radius=tool_r)

    # Stock bounds
    x_min = job.stock.x_min
    x_max = job.stock.x_max
    y_min = job.stock.y_min
    y_max = job.stock.y_max

    # Clamp to mesh bounds + tool radius
    x_min = max(x_min, bounds.min_pt.x - tool_r)
    x_max = min(x_max, bounds.max_pt.x + tool_r)
    y_min = max(y_min, bounds.min_pt.y - tool_r)
    y_max = min(y_max, bounds.max_pt.y + tool_r)

    # Generate scan lines along Y, stepping in X
    y_positions = _generate_positions(y_min, y_max, stepover)
    x_positions = _generate_positions(x_min, x_max, resolution)

    gap_threshold = 2.0 * resolution  # threshold for detecting air gaps

    flip = False
    for y_idx, y in enumerate(y_positions):
        chain = ToolpathChain(comment=f"raster y={y:.3f}")
        x_scan = x_positions if not flip else list(reversed(x_positions))

        # Collect surface points for this scan line
        points: list[tuple[float, float]] = []
        for x in x_scan:
            z = hf.sample_z(x, y)
            if z > bounds.min_pt.z - 1.0:  # valid surface point
                points.append((x, z))

        if not points:
            flip = not flip
            continue

        # Emit scan line with gap detection
        in_cut = False
        for i, (x, z) in enumerate(points):
            if not in_cut:
                # Start new cut segment
                chain.append_rapid(x, y, safe_z)
                chain.append_rapid(x, y, z + 2.0)
                chain.append_feed(x, y, z, plunge)
                in_cut = True
            else:
                # Check for gap (large Z jump = air)
                prev_x, prev_z = points[i - 1]
                x_dist = abs(x - prev_x)
                z_diff = abs(z - prev_z)

                if z_diff > gap_threshold and z < prev_z - gap_threshold:
                    # Steep drop — might be an edge. Just follow it.
                    chain.append_feed(x, y, z, feed)
                elif z < bounds.min_pt.z - 0.5:
                    # Below mesh — air gap, retract
                    chain.append_rapid(prev_x, y, safe_z)
                    chain.append_rapid(x, y, safe_z)
                    chain.append_rapid(x, y, z + 2.0)
                    chain.append_feed(x, y, z, plunge)
                else:
                    chain.append_feed(x, y, z, feed)

        if chain.segments:
            # Final retract
            chain.append_rapid(chain.segments[-1].x, y, safe_z)
            result.chains.append(chain)

        flip = not flip

    _compute_stats(result, safe_z)
    return result


def _generate_positions(start: float, end: float, step: float) -> list[float]:
    """Generate evenly spaced positions from start to end."""
    positions: list[float] = []
    pos = start
    while pos <= end + 1e-6:
        positions.append(pos)
        pos += step
    return positions


def _compute_stats(result: ToolpathResult, safe_z: float) -> None:
    total_cut = 0.0
    total_rapid = 0.0
    prev_x, prev_y, prev_z = 0.0, 0.0, safe_z

    for chain in result.chains:
        for seg in chain.segments:
            d = math.sqrt(
                (seg.x - prev_x) ** 2 + (seg.y - prev_y) ** 2 + (seg.z - prev_z) ** 2
            )
            if seg.is_rapid:
                total_rapid += d
            else:
                total_cut += d
            prev_x, prev_y, prev_z = seg.x, seg.y, seg.z

    result.cut_distance_mm = total_cut
    result.rapid_distance_mm = total_rapid
    result.total_distance_mm = total_cut + total_rapid

    rapid_time = total_rapid / 5000.0 if total_rapid > 0 else 0
    avg_feed = 1000.0
    for chain in result.chains:
        for seg in chain.segments:
            if seg.feed > 0:
                avg_feed = seg.feed
                break
        break
    cut_time = total_cut / avg_feed if total_cut > 0 else 0
    result.estimated_time_s = (rapid_time + cut_time) * 60
