# CAD-style command parity (not Autodesk Fusion)

Unified Fab Studio tracks **coverage** against workflows familiar from parametric CAD (sketch, constraints, solids, assemblies, CAM). **Autodesk Fusion** is a trademark; we do not ship or copy proprietary Fusion UI, binaries, or exact command behavior.

## What lives in the repo

| Artifact | Purpose |
|----------|---------|
| `src/shared/fusion-style-command-catalog.ts` | Typed list of commands with `implemented` / `partial` / `planned` |
| **Utilities → Commands** | Searchable browser + filters |

**Docs-only** updates to how the catalog is *described* (README, parity docs): **Stream G** — [`docs/agents/STREAM-G-docs-only.md`](agents/STREAM-G-docs-only.md). **Changing status bits** (`implemented` / `partial` / `planned`) is **not** Stream G — ship with the feature stream that changed behavior.

## Reality check

A “full” commercial CAD command set is **hundreds** of commands across:

- 2D sketch creation, modification, constraints, dimensions  
- Solid and surface modeling, sheet metal, plastic features  
- Assembly structure, joints, motion, drawings  
- Full manufacturing (2.5D–5-axis, turning, additive, simulation)

This app today is strongest on **local project workflow**, **sketch v2 + simple solver**, **extrude/revolve mesh preview**, **assembly/manufacture JSON**, and **slice/CAM hooks**. Manufacture adds structured op kinds (e.g. **`cnc_raster`** in `manufacture.json`: **OpenCAMLib PathDropCutter** raster when `opencamlib` is installed, else built-in **mesh height-field** raster + bounds fallback — see `engines/cam/ocl_toolpath.py` and `cam-runner.ts`). **Treat all emitted G-code as unverified** until machine posts and limits are checked (`MACHINES.md`). Most solid/surface commands stay **planned** until a real B-rep history stack (e.g. OCCT integration described in `GEOMETRY_KERNEL.md`) lands.

## Remaining work by phase

For **epic-level breakdown** of phases **2–7** (priorities, command IDs, key files, exit criteria, milestone graph), see [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md).

## How to extend

1. Add or adjust a row in `FUSION_STYLE_COMMAND_CATALOG`.  
2. Implement geometry/logic in `src/renderer/design` (or main process).  
3. Change `status` to `partial` or `implemented` and wire the **Design** ribbon (or other workspace).  
4. Prefer updating **one command** end-to-end (schema + solver + UI) over marking large areas “implemented” prematurely.

## Verification

After changing geometry, CAM, or assembly interference paths, use [`VERIFICATION.md`](VERIFICATION.md) so behavior still matches [`PARITY_PHASES.md`](PARITY_PHASES.md).
