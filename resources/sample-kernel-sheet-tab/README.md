# Sample project — kernel `sheet_tab_union` (Phase 4 sheet baseline)

Open this folder as a **project** in Unified Fab Studio. The design is a **thin plate** (1 mm extrude); `part/features.json` adds a **`sheet_tab_union`** post op: a rectangular boss on **+Z** from the top face of the sheet.

- **World frame:** sketch XY, extrusion **+Z** (same as other kernel samples).
- **Payload:** merged ops set kernel JSON **version 3** (extended postSolidOps).
- **Requirements:** Python + **CadQuery**; **Design → Build STEP (kernel)**.

See `part/features.tab-only.example.json` for a minimal `kernelOps` fragment to paste into another project.

**Manual QA:** [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — **Geometry kernel** → Phase 4 **sheet tab** row.
