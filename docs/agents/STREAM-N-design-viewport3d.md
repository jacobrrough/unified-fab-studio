# Agent brief — Stream N: Design 3D viewport (R3F)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **N** (design `Viewport3D`). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve the **design workspace** extrude/preview **Three.js viewport** — lighting, grid, navigation, materials, clipping, measure/face-pick UX, and layout — **without** owning sketch schema, 2D canvas, solver, or kernel bridges.

## Mission

Ship **one** visible slice per chat so parallel work stays merge-friendly:

- **Visual quality** — lights, background, grid (`@react-three/drei`), default material read in dark UI.
- **Navigation** — `OrbitControls` tuning (damping, limits, touch), fit behavior via `Bounds`.
- **Performance** — stable geometry refs, DPR, avoid unnecessary Canvas remounts; profile if you change hot paths.
- **Correctness** — section clip plane, measure markers, face-pick ray behavior stay consistent with `DesignWorkspace` call sites.

## Allowed paths

| Primary | Notes |
|---------|--------|
| [`src/renderer/design/Viewport3D.tsx`](../../src/renderer/design/Viewport3D.tsx) | Main ownership: `Canvas`, scene graph, controls, mesh interaction. |
| [`src/renderer/design/viewport3d-bounds.ts`](../../src/renderer/design/viewport3d-bounds.ts) | Pure helpers used by the design 3D shell (e.g. extrude height range). Extend only when the viewport or its callers need new bounds math. |
| [`src/renderer/design/viewport3d-bounds.test.ts`](../../src/renderer/design/viewport3d-bounds.test.ts) | Add/update tests when `viewport3d-bounds.ts` behavior changes. |
| [`src/renderer/src/styles.css`](../../src/renderer/src/styles.css) | **Only** rules clearly scoped to **design** 3D layout — prefer selectors under `.design-3d`, `.design-3d--fill`, `.design-3d--solo`, or `.design-3d .viewport-3d`. |

**Global `.viewport-3d`:** the same class name is reused under assembly ([`AssemblyViewport3D.tsx`](../../src/renderer/assembly/AssemblyViewport3D.tsx)). Do **not** change the base `.viewport-3d { ... }` block in ways that would surprise assembly unless you coordinate **Stream C** and verify both viewports.

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| New internal components **inside** `Viewport3D.tsx` or colocated `Viewport3D*.tsx` next to it | [`Sketch2DCanvas`](../../src/renderer/design/Sketch2DCanvas.tsx), sketch tools, constraint UI |
| `useMemo` / `memo` for Three objects and callbacks | [`design-schema.ts`](../../src/shared/design-schema.ts), [`sketch-profile.ts`](../../src/shared/sketch-profile.ts) |
| Export **types** already used by parents if you split a subcomponent | [`solver2d.ts`](../../src/renderer/design/solver2d.ts) and solver-driven preview **logic** (Stream **A**) |
| | [`engines/occt/`](../../engines/occt/), [`src/main/cad/`](../../src/main/cad/) (Stream **B**) |

### `DesignWorkspace.tsx` and `App.tsx`

- **Default:** do **not** edit [`DesignWorkspace.tsx`](../../src/renderer/design/DesignWorkspace.tsx). If the viewport needs new props, prefer optional props with defaults inside `Viewport3D` first.
- **If unavoidable** (e.g. wiring a new callback): keep the diff **≤15 lines** in `DesignWorkspace.tsx`, declare it in your **Shipped:** line, and avoid the same merge batch as a large **Stream A** `DesignWorkspace` refactor.
- **`App.tsx`:** same cap as global pastables — **≤25 lines** or extract; prefer **zero** `App.tsx` in Stream **N**.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **A** | Owns sketch canvas, schema, solver, most of `DesignWorkspace` behavior. **N** must not fight A on 2D or schema. |
| **B** | Owns kernel mesh **production**; **N** only **displays** `BufferGeometry` passed in. |
| **C** | Owns assembly 3D viewport; avoid global `.viewport-3d` changes without checking `AssemblyViewport3D`. |
| **H (H3)** | May extend `viewport3d-bounds.test.ts` or tests that import `Viewport3D` — coordinate if both touch **`viewport3d-bounds.ts`** in one batch. |
| **E** | Owns broad **`styles.css`** / shell — coordinate if **E** is touching the same **`.design-3d*`** / viewport blocks in one batch; prefer **scoped** selectors and existing CSS variables. |

## Verification

From **`unified-fab-studio/`**:

```bash
npm test
npm run build
```

Focused test while editing bounds helpers:

```bash
npx vitest run src/renderer/design/viewport3d-bounds.test.ts
```

## Success criteria (pick one slice)

- One shipped theme: e.g. “clearer grid fade + section contrast”, “orbit limits feel better on trackpad”, “measure markers scale with `Bounds` margin”, “design-only CSS fixes flex height in solo mode”.
- **No** catalog row requirement unless you change a **user-visible** command surface (rare for **N** — then sync **Stream A/E** and `fusion-style-command-catalog.ts` honestly).

## Final reply format

End with a single line:

`Shipped: Viewport3D — <files> — <designer-visible outcome>.`

---

## See also

- Pasteables: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — **Stream N**, **Aggressive — Stream N**, **MICRO-SPRINT (attach to Stream N)**.
- Master plan: [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md) — **Stream N** row in the ownership table.
- Phase sketch ownership: [`STREAM-A-phase2-sketch.md`](STREAM-A-phase2-sketch.md) — **A** vs **N** carve-out on `design/*`.
