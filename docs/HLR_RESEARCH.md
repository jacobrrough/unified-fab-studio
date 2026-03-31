# Hidden-line removal (HLR) — research notes

**Status:** Not shipped (true HLR). Drawing export uses **Tier A** mesh-edge soup plus optional **convex hull** outline merge; **Tier B** adds **bbox-center mesh section** polylines per view axis when `meshProjectionTier: B` — still **not** OCCT HLR or B-rep section (see `VERIFICATION.md`).

## Goal

Improve drawing views beyond “edge soup” toward views where **occluded** geometry is suppressed or shown as **hidden** (dashed), aligned with operator expectations for mechanical drawings.

## Candidate directions

1. **OpenCascade HLR / HLRBRep** — use OCCT hidden-line algorithms on tessellated or B-rep input; highest fidelity, heaviest integration and performance cost.
2. **Silhouette / section cuts** — compute section polylines or outer silhouette from mesh or solid; partial win, easier to bound than full HLR.
3. **Depth-buffer render** — rasterize depth from orthographic views and vectorize edges; fast approximations, not B-rep–exact.

## Constraints

- Must not break golden PDF/DXF expectations in `src/main/drawing-export-service.test.ts` without explicit fixture updates.
- Python stdout remains the JSON channel for `project_views.py`; avoid noisy prints.
- Document **approximate** behavior in `VERIFICATION.md` when any new tier ships.

## Next steps (implementation batch)

1. Spike OCCT API availability in the same environment as `project_views.py` (version, symbols).
2. Prototype one view axis with mesh input; compare output segment count vs Tier A.
3. Gate behind a manifest/export flag until stable.

This file satisfies the **HLR research spike** stretch item as documentation; shipping code is tracked in `docs/STRETCH_PHASES_8-11_PLAN.md` and phase rows in `PARITY_PHASES.md`.
