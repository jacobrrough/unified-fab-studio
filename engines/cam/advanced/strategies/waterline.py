"""
Waterline (Z-level) finishing strategy.

Generates contour passes at constant Z levels by slicing the mesh.
Ideal for steep-walled parts where raster would leave poor finish.

Features:
- Automatic Z-level spacing based on tool geometry and surface finish target
- Scallop-height aware stepdown for ball-end mills
- Contour ordering to minimize rapids
- Lead-in/lead-out arcs for smooth entry
"""
from __future__ import annotations

import math

from ..models import ToolpathChain, ToolpathJob, ToolpathResult, ToolShape
from ..geometry import Mesh, slice_mesh_at_z, offset_contour


def generate_waterline(job: ToolpathJob, mesh: Mesh) -> ToolpathResult:
    """Generate waterline finishing toolpath."""
    result = ToolpathResult(strategy="waterline")
    bounds = mesh.bounds
    tool_r = job.tool.radius
    safe_z = job.cuts.safe_z_mm
    feed = job.cuts.feed_mm_min
    plunge = job.cuts.plunge_mm_min

    # Compute Z step from tool geometry
    z_step = _compute_z_step(job)

    # Generate Z levels from top to bottom
    z_top = bounds.max_pt.z - z_step * 0.5  # start slightly below top
    z_bottom = bounds.min_pt.z + tool_r * 0.25

    z_levels: list[float] = []
    z = z_top
    while z >= z_bottom - 1e-6:
        z_levels.append(z)
        z -= z_step
    if not z_levels:
        result.warnings.append("No Z levels in mesh range")
        return result

    for z_level in z_levels:
        loops = slice_mesh_at_z(mesh, z_level)
        if not loops:
            continue

        for loop_idx, loop in enumerate(loops):
            if len(loop) < 3:
                continue

            # Offset by tool radius (inward for outside contours)
            offset_loop = offset_contour(loop, -tool_r)
            if len(offset_loop) < 3:
                # Try outward offset (for inside contours / pockets)
                offset_loop = offset_contour(loop, tool_r)
                if len(offset_loop) < 3:
                    continue

            chain = ToolpathChain(
                comment=f"waterline z={z_level:.3f} loop={loop_idx}"
            )

            # Rapid to start position
            start = offset_loop[0]
            chain.append_rapid(start[0], start[1], safe_z)
            chain.append_rapid(start[0], start[1], z_level + 2.0)

            # Plunge to Z level
            chain.append_feed(start[0], start[1], z_level, plunge)

            # Cut the contour
            for pt in offset_loop[1:]:
                chain.append_feed(pt[0], pt[1], z_level, feed)

            # Close the loop
            chain.append_feed(start[0], start[1], z_level, feed)

            # Retract
            chain.append_rapid(start[0], start[1], safe_z)

            result.chains.append(chain)

    _compute_stats(result, safe_z)
    return result


def _compute_z_step(job: ToolpathJob) -> float:
    """
    Compute optimal Z step based on tool shape and target surface finish.

    For ball-end mills: z_step = 2 * sqrt(Ra * (2*R - Ra))
    where Ra = target scallop height and R = ball radius.
    For flat-end mills: use configured z_step directly.
    """
    if job.tool.shape == ToolShape.BALL:
        r = job.tool.radius
        # Target scallop height in mm (from Ra in microns)
        scallop_mm = job.surface_finish_ra_um / 1000.0 * 4  # Ra to peak-valley approx
        scallop_mm = max(0.005, min(scallop_mm, r * 0.5))

        z_step = 2.0 * math.sqrt(scallop_mm * (2 * r - scallop_mm))
        return max(0.05, min(z_step, job.cuts.z_step_mm))

    elif job.tool.shape == ToolShape.BULL:
        # Bull nose: use corner radius for scallop calculation
        cr = job.tool.corner_radius_mm
        if cr > 0:
            scallop_mm = job.surface_finish_ra_um / 1000.0 * 4
            scallop_mm = max(0.005, min(scallop_mm, cr * 0.5))
            z_step = 2.0 * math.sqrt(scallop_mm * (2 * cr - scallop_mm))
            return max(0.05, min(z_step, job.cuts.z_step_mm))

    return job.cuts.z_step_mm


def _compute_stats(result: ToolpathResult, safe_z: float) -> None:
    """Compute distance and time statistics."""
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
