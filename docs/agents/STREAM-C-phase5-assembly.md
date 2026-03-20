# Agent brief — Stream C: Phase 5 (Assembly)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **C** (assembly). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

### Shipped baseline (do not re-implement)

Phase 5 row in [`PARITY_PHASES.md`](../PARITY_PHASES.md): BOM exports + preview **Thumb** (cache + lazy-load), interference save/download, revolute/slider/**planar**/universal/cylindrical/**ball** **viewport preview** stubs (world / parent-local frames where applicable), motion study **after** joint previews (see Assembly 3D section), **Duplicate row**, **Insert from project…**, motion-link stubs + DOF copy. Math: [`src/shared/assembly-viewport-math.ts`](../../src/shared/assembly-viewport-math.ts). IPC thumbnail for BOM is **not** required (renderer `assembly:readStlBase64`) — [`VERIFICATION.md`](../VERIFICATION.md).

### Remaining stretch

True **multibody kinematics** and **joint limits as a system** (beyond per-row preview clamps) — see [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) §Phase 5 and [`ASSEMBLY_KINEMATICS_RESEARCH.md`](../ASSEMBLY_KINEMATICS_RESEARCH.md).

## Mission
Deepen **assembly** workflow: component references, more joint types, constraints/isolation hooks, BOM enhancements — without coupling to sketch internals.

## Hard rules
- Own **`src/shared/assembly-schema.ts`**, **`src/renderer/assembly/*`**, assembly-related **`ipcMain.handle`** blocks in **`src/main/index.ts`** (additive handlers preferred).
- Do **not** modify **`design-schema.ts`** or **`sketch-profile.ts`**.
- Touch **`BrowserPanel` / `PropertiesPanel`** only if assembly browser needs new nodes; coordinate if another stream edits same file — prefer **props** from `App.tsx` over deep refactors.
- Run **`npm test`** + **`npm run build`** from **`unified-fab-studio/`** (see workspace `AGENTS.md`).

## Suggested order
1. Schema extensions (versioned; default old fields for backward compatibility).
2. `AssemblyWorkspace` UI for new fields.
3. Optional: IPC `assembly:*` for export/analysis stubs.

## Success criteria (pick a slice per PR)
- At least one **new joint type** or **component reference** field persisted in `assembly.json`.
- Load/save round-trip for old projects.
- Where meshes matter: follow **[`../VERIFICATION.md`](../VERIFICATION.md)** — **Assembly mesh + interference** (STL paths, `assembly:interferenceCheck`, BOM `meshPath` column).

## Parallel note
Safe to run **alongside Stream A, D, E**. Merge **`App.tsx`** carefully if multiple streams touch it.

**Stream N** edits the design **`Viewport3D`** and sometimes **`styles.css`**. The **`.viewport-3d`** class is also used by **`AssemblyViewport3D`** — coordinate if either stream changes the **global** `.viewport-3d { … }` block (prefer **design-only** `.design-3d .viewport-3d` overrides for **N**).
