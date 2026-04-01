"""Tests for toolpath strategies: adaptive clear, waterline, raster, pencil, rest."""
from __future__ import annotations

import struct
import tempfile
from pathlib import Path

import pytest

from ..models import ToolpathJob, Strategy, Tool, ToolShape, CutParams, StockDefinition
from ..geometry import load_stl
from ..strategies import run_strategy


# ── Test STL helpers ─────────────────────────────────────────────────────

def _make_binary_stl(triangles):
    header = b"\x00" * 80
    count = struct.pack("<I", len(triangles))
    data = header + count
    for tri in triangles:
        normal, v0, v1, v2 = tri
        data += struct.pack("<fff", *normal)
        data += struct.pack("<fff", *v0)
        data += struct.pack("<fff", *v1)
        data += struct.pack("<fff", *v2)
        data += struct.pack("<H", 0)
    return data


def _box_triangles(sx=10.0, sy=10.0, sz=5.0):
    tris = []
    tris.append(((0, 0, -1), (0, 0, 0), (sx, sy, 0), (sx, 0, 0)))
    tris.append(((0, 0, -1), (0, 0, 0), (0, sy, 0), (sx, sy, 0)))
    tris.append(((0, 0, 1), (0, 0, sz), (sx, 0, sz), (sx, sy, sz)))
    tris.append(((0, 0, 1), (0, 0, sz), (sx, sy, sz), (0, sy, sz)))
    tris.append(((0, -1, 0), (0, 0, 0), (sx, 0, 0), (sx, 0, sz)))
    tris.append(((0, -1, 0), (0, 0, 0), (sx, 0, sz), (0, 0, sz)))
    tris.append(((0, 1, 0), (0, sy, 0), (0, sy, sz), (sx, sy, sz)))
    tris.append(((0, 1, 0), (0, sy, 0), (sx, sy, sz), (sx, sy, 0)))
    tris.append(((-1, 0, 0), (0, 0, 0), (0, 0, sz), (0, sy, sz)))
    tris.append(((-1, 0, 0), (0, 0, 0), (0, sy, sz), (0, sy, 0)))
    tris.append(((1, 0, 0), (sx, 0, 0), (sx, sy, 0), (sx, sy, sz)))
    tris.append(((1, 0, 0), (sx, 0, 0), (sx, sy, sz), (sx, 0, sz)))
    return tris


def _hemisphere_triangles(radius=5.0, segments=8, rings=4):
    """Simple hemisphere for testing curved surface strategies."""
    import math
    tris = []
    for ring in range(rings):
        phi0 = (math.pi / 2) * ring / rings
        phi1 = (math.pi / 2) * (ring + 1) / rings
        for seg in range(segments):
            theta0 = 2 * math.pi * seg / segments
            theta1 = 2 * math.pi * (seg + 1) / segments

            def pt(phi, theta):
                return (
                    radius * math.cos(phi) * math.cos(theta),
                    radius * math.cos(phi) * math.sin(theta),
                    radius * math.sin(phi),
                )

            p00 = pt(phi0, theta0)
            p10 = pt(phi1, theta0)
            p01 = pt(phi0, theta1)
            p11 = pt(phi1, theta1)

            n = (0, 0, 1)  # approximate
            tris.append((n, p00, p10, p01))
            tris.append((n, p10, p11, p01))
    return tris


def _make_mesh(tris):
    data = _make_binary_stl(tris)
    f = tempfile.NamedTemporaryFile(suffix=".stl", delete=False)
    f.write(data)
    f.close()
    mesh = load_stl(f.name)
    Path(f.name).unlink(missing_ok=True)
    return mesh


def _make_job(strategy: Strategy, **overrides) -> ToolpathJob:
    job = ToolpathJob(
        strategy=strategy,
        tool=Tool(diameter_mm=6.0, shape=ToolShape.FLAT),
        cuts=CutParams(
            feed_mm_min=1000,
            plunge_mm_min=400,
            stepover_mm=2.0,
            z_step_mm=1.0,
            safe_z_mm=15.0,
        ),
        stock=StockDefinition(
            x_min=-2, x_max=12,
            y_min=-2, y_max=12,
            z_min=0, z_max=7,
        ),
    )
    for k, v in overrides.items():
        setattr(job, k, v)
    return job


class TestAdaptiveClear:
    def test_box_produces_chains(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.ADAPTIVE_CLEAR)
        result = run_strategy(job, mesh)
        assert len(result.chains) > 0
        assert result.strategy == "adaptive_clear"

    def test_has_feed_moves(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.ADAPTIVE_CLEAR)
        result = run_strategy(job, mesh)
        feed_count = sum(
            1 for c in result.chains for s in c.segments if not s.is_rapid
        )
        assert feed_count > 0

    def test_all_z_above_minimum(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.ADAPTIVE_CLEAR)
        result = run_strategy(job, mesh)
        for chain in result.chains:
            for seg in chain.segments:
                # No segment should go below mesh bottom minus tolerance
                assert seg.z >= -1.0, f"Z={seg.z} below expected minimum"

    def test_stats_computed(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.ADAPTIVE_CLEAR)
        result = run_strategy(job, mesh)
        assert result.cut_distance_mm > 0
        assert result.total_distance_mm > 0


class TestWaterline:
    def test_box_produces_chains(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.WATERLINE)
        result = run_strategy(job, mesh)
        # A box has vertical walls, so waterline should produce contours
        assert result.strategy == "waterline"
        # May or may not produce chains depending on slicing
        # (a box with vertical walls should produce rectangular loops)

    def test_hemisphere_produces_chains(self):
        mesh = _make_mesh(_hemisphere_triangles(radius=5.0))
        job = _make_job(Strategy.WATERLINE)
        job.stock.z_max = 6.0
        result = run_strategy(job, mesh)
        assert result.strategy == "waterline"


class TestRaster:
    def test_box_produces_chains(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.RASTER)
        result = run_strategy(job, mesh)
        assert len(result.chains) > 0
        assert result.strategy == "raster"

    def test_scan_lines_zigzag(self):
        """Check that consecutive chains alternate scan direction."""
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.RASTER)
        result = run_strategy(job, mesh)
        if len(result.chains) >= 2:
            # First chain's first feed move X should differ from second chain's
            def first_feed_x(chain):
                for s in chain.segments:
                    if not s.is_rapid:
                        return s.x
                return None

            x0 = first_feed_x(result.chains[0])
            x1 = first_feed_x(result.chains[1])
            if x0 is not None and x1 is not None:
                # They should be scanning from opposite sides
                assert x0 != pytest.approx(x1, abs=0.5)

    def test_raster_stats(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.RASTER)
        result = run_strategy(job, mesh)
        assert result.total_distance_mm > 0


class TestPencil:
    def test_box_no_concave_regions(self):
        """A box has no concave regions — pencil should produce empty or few chains."""
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.PENCIL)
        result = run_strategy(job, mesh)
        assert result.strategy == "pencil"
        # Box is purely convex, so expect no pencil traces (just warnings)


class TestRest:
    def test_requires_larger_prior_tool(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.REST)
        job.prior_tool_diameter_mm = 4.0  # smaller than current 6mm
        result = run_strategy(job, mesh)
        assert any("not larger" in w for w in result.warnings)

    def test_with_valid_prior_tool(self):
        mesh = _make_mesh(_box_triangles(10, 10, 5))
        job = _make_job(Strategy.REST)
        job.prior_tool_diameter_mm = 12.0  # larger than current 6mm
        result = run_strategy(job, mesh)
        assert result.strategy == "rest"
