# Rib / web / selective structural features — scope gate

**Status:** **No-go for kernel implementation in this stretch batch** (March 2026).

**Formal deferral (program exit):** Rib/web kernel ops remain **out of scope** until the **Go criteria** below are executed in a **dedicated** batch. This document is the **explicit** deferral record (no silent gap vs [`PARITY_PHASES.md`](PARITY_PHASES.md) Phase 11 / [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) `so_rib` / `so_web` rows). **Revisit:** product decision or unblock when go criteria are scheduled.

## Why gate

- **CadQuery / OCC** rib and web workflows need stable reference geometry (mid-plane, wall normals, draft, thickness caps) beyond the current `kernelOps` pattern.
- **Fusion-style rib/web** often implies pattern-on-face, boundary selection, and failure modes (self-intersection, minimum wall) that are not yet modeled in `part-features-schema` or Design UI.
- Parallel merge risk: touches `build_part.py`, `part-features-schema.ts`, Design ribbon (**Stream A**), and samples — should be a **dedicated** batch after a short design doc + sample contract.

## Go criteria (future)

1. Pick **one** bounded primitive (e.g. “rectangular web between two parallel planar faces” or “rib thickness + single sketch normal”) with explicit non-goals.
2. Prototype in **isolated** `engines/occt/` branch with golden STEP/STL from one sample project.
3. Zod op + `kernel-manifest` diagnostic tag + `resources/sample-kernel-solid-ops` example + `GEOMETRY_KERNEL.md` limits.

Until then, deferrals stay in [`GEOMETRY_KERNEL.md`](GEOMETRY_KERNEL.md) (*Stretch deferrals*).
