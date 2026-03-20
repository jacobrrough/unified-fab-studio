# Assembly kinematics — research / future tier

This note scopes work **beyond** the current Phase 5 **preview stubs** in [`assembly-viewport-math.ts`](../src/shared/assembly-viewport-math.ts). It is **not** a commitment to ship a full solver.

## What ships today (preview-only)

- **Order of operations** in `computeAssemblyKinematicPreviewTransforms`: all **slider** rows (depth-sorted shallow-first), then **planar** (in-plane translation along **U**/**V** from the plane normal), then **revolute**, then **universal** (two sequential rotations about chosen axes), then **cylindrical** (slide along axis, then spin about the same axis through the post-slide pivot), then **ball** (three sequential rotations about world +X, +Y, +Z through the pivot).
- Axes can be interpreted in **world** or **parent local** Euler (see `assembly-schema` `*PreviewAxisFrame` fields).
- **Motion study** keyframes apply in the viewport **after** those transforms: whole-assembly rotation about world +Y (`AssemblyViewport3D`).
- **No** dynamics, **no** closed-loop constraint solving, **no** guarantee that joint limits are physically consistent across the graph.

## What a “real” kinematics tier would need

1. **Body / joint graph** — instances as nodes, mates as edges; cycle detection beyond today’s parent-chain checks.
2. **Degrees of freedom** — per joint kind, consistent world-frame or joint-frame conventions (Denavit–Hartenberg, screw theory, or equivalent).
3. **Solver** — iterative or analytic closure for loops; handling redundancies and singularities.
4. **Limits** — enforce min/max per DOF with propagation to children.
5. **UI honesty** — never imply machine-safe or manufacturing-valid motion without user verification (align with [`MACHINES.md`](MACHINES.md) tone for CAM).

## Suggested spike order

1. **Math harness** in `assembly-viewport-math` (or a sibling module): golden vectors for 2-DOF and 3-DOF toy assemblies; keep Vitest coverage.
2. **Schema** — optional solver-ready fields **only** with migration tests in [`assembly-schema.test.ts`](../src/shared/assembly-schema.test.ts).
3. **Renderer** — wire minimal visualization once a single closed chain works.

## Related docs

- Phase 5 stretch: [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) §Phase 5  
- Verification / mesh: [`VERIFICATION.md`](VERIFICATION.md)  
- Stream ownership: [`agents/STREAM-C-phase5-assembly.md`](agents/STREAM-C-phase5-assembly.md)
