# Agent brief — Stream A: Phase 2 (Sketch depth)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **A** (Phase 2 sketch). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

## Mission
Extend parametric **2D sketch** toward CAD parity: more entities, modify tools, constraints, and/or dimensions — without breaking existing `design/sketch.json` v2 consumers.

## Hard rules
- Own **`src/shared/design-schema.ts`**, **`src/shared/sketch-profile.ts`**, **`src/renderer/design/*`**, **`src/renderer/design/solver2d.ts`**.
- **Parallel with Stream N:** when another chat is **Stream N** (design 3D preview), **do not** edit **`Viewport3D.tsx`** or **`viewport3d-bounds.ts`** in the same batch — coordinate or serialize. **N** does not own sketch schema, **`Sketch2DCanvas`**, or the solver.
- Do **not** change **`engines/occt/build_part.py`** unless you coordinate a **kernel payload version bump** with Stream B; prefer extending `sketch-profile` + payload in a backward-compatible way.
- Do **not** edit **`src/renderer/src/App.tsx`** except if unavoidable; prefer new components under `design/`.
- Run **`npm test`** and **`npx electron-vite build`** before claiming done.
- Update **`docs/PARITY_PHASES.md`** when Phase 2 milestones complete; bump **`fusion-style-command-catalog.ts`** statuses for commands you implement.

## Suggested order
1. Schema + migration strategy for new entity/constraint kinds (Zod: avoid `discriminatedUnion` with `.superRefine` on members — use plain unions per existing polyline fix).
2. Solver: extend `energy()` / gradients for new constraint types (or document why a constraint is UI-only until solver lands).
3. `Sketch2DCanvas`: tools and hit-testing for new geometry.
4. `DesignWorkspace` ribbon: wire tools; keep mobile-friendly controls where possible.

## Success criteria (pick a slice per PR)
- At least **one** new sketch **create** or **modify** tool **or** **two** new constraint types with solver support.
- Existing projects still load (`normalizeDesign`).

**Shipped slice:** **Arc (center)** — `sk_arc_center` / sketch tool `arc_center`: center → start (radius) → end defines the **minor** arc; committed as v2 `arc` (start/via/end) so trim, kernel loops, and solver stay aligned.

**Shipped slice:** **Circle (two point)** — `sk_circle_2pt` / `circle_2pt`: two picks define a **diameter**; `circleFromDiameterEndpoints` in `sketch-profile` → normal `circle` entity.

**Shipped slice:** **Circle (three point)** — `sk_circle_3pt` / `circle_3pt`: circumcircle via `circleThroughThreePoints` → normal `circle` entity.

**Shipped slice:** **Rectangle (three point)** — `sk_rect_3pt` / `rect_3pt`: edge A–B + third point for height → `rectFromThreePoints` + standard `rect` (`worldCornersFromRectParams` shared with kernel loop).

**Shipped slice:** **Point** — `sk_point` / sketch tool `point`: each click adds a new UUID entry in `design.points` (no sketch entity); rendered like other sketch vertices; usable for constraints and dimensions.

**Shipped slice:** **Regular polygon** — `sk_polygon` / sketch tool `polygon`: `regularPolygonVertices` in `sketch-profile`; center then corner sets circumradius and orientation; toolbar side count 3–128; committed as closed point-ID `polyline`.

**Shipped slice:** **Slot (center–center)** — `sk_slot_center` / sketch tool `slot_center`: two cap-center picks + third pick sets width (`2×` perp. distance to axis); `slot` entity; `slotCapsuleLoopWorld` for kernel loop + Three `Shape`.

**Shipped slice:** **Slot (overall)** — `sk_slot_overall` / sketch tool `slot_overall`: two tip picks (overall length along axis) + width; `slotParamsFromOverallTips` → stored `length` = overall − width (same `slot` entity).

## Context files
- `docs/GEOMETRY_KERNEL.md` — sketch vs kernel split.
- `src/shared/sketch-profile.ts` — kernel payload extraction must stay consistent with solid preview.
- If you change **`buildKernelBuildPayload`** or kernel-facing profiles, run **`npm test`** and the **Geometry kernel** steps in **[`../VERIFICATION.md`](../VERIFICATION.md)**.
