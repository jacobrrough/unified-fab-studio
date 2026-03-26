# Verification drift log (Stream T artifact)

**Owner:** Stream **T** ([`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md)). Do not rewrite in the same batch as Stream **M** — see [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md).

**Purpose:** Track gaps between **docs**, **`npm test`**, **`npm run typecheck`**, and **IPC** reality. **Stream G** (or feature streams) closes items by editing targets — not by deleting rows here until fixed.

**Last gate run:** 2026-03-25 (automated; refresh when merging risky batches).

---

## 1. Automated gates (from `unified-fab-studio/`)

| Gate | Result | Notes |
|------|--------|--------|
| `npm test` | **PASS** | Includes `src/main/ipc-contract.test.ts` (preload `invoke` ⊆ main `handle`). |
| `npm run build` | **PASS** | `electron-vite build` + electron-builder; does not prove `tsc --noEmit` clean. |
| `npm run typecheck` | **PASS** | `tsc --noEmit` clean (2026-03-25). Prior §3 rows (DesignWorkspace / assembly-schema / sketch-profile test) were stale; see §6 resolution log. |

**Optional (not run in last sweep):** `python engines/cam/smoke_ocl_toolpath.py` when CAM Python changes; manual **Build STEP (kernel)** when `engines/occt/` changes.

---

## 2. IPC channel inventory (renderer ↔ main)

Contract enforced by **`ipc-contract.test.ts`**: every `ipcRenderer.invoke('…')` in `src/preload/index.ts` has a matching `ipcMain.handle('…')` somewhere in non-test `src/main/**/*.ts` (registrars include [`ipc-core.ts`](../../src/main/ipc-core.ts), [`ipc-modeling.ts`](../../src/main/ipc-modeling.ts), [`ipc-fabrication.ts`](../../src/main/ipc-fabrication.ts), plus any future `ipc-*.ts` modules). Duplicate channel names across files fail the test.

**Channels in use (alphabetical):**

`assembly:exportBom`, `assembly:exportBomHierarchical`, `assembly:exportBomHierarchyJson`, `assembly:interferenceCheck`, `assembly:load`, `assembly:readStlBase64`, `assembly:save`, `assembly:saveInterferenceReport`, `assembly:summary`, `assets:importMesh`, `cad:comparePreviewKernel`, `cad:importStep`, `cad:importStl`, `cad:kernelBuild`, `cam:run`, `design:exportParameters`, `design:load`, `design:mergeParameters`, `design:save`, `dialog:openFile`, `dialog:openFiles`, `drawing:export`, `drawing:load`, `drawing:save`, `features:load`, `features:save`, `file:readText`, `machines:list`, `manufacture:load`, `manufacture:save`, `model:exportStl`, `project:create`, `project:openDir`, `project:read`, `project:save`, `settings:get`, `settings:set`, `shell:openPath`, `slice:cura`, `stl:stage`, `tools:import`, `tools:importFile`, `tools:read`, `tools:save`.

**Doc alignment:** [`VERIFICATION.md`](../VERIFICATION.md) should name channels exactly as above (e.g. `file:readText` for text reads, not a fictional `readTextFile` channel).

---

## 3. Typecheck failures (P0 — assign Stream E / A / shared owners)

**Current status:** **no open `tsc` debt** as of **2026-03-25** (`npm run typecheck` passes).

**Previous drift (2026-03-20)** listed `DesignWorkspace.tsx`, `assembly-schema.ts`, and `sketch-profile.test.ts`; a fresh `tsc` run no longer reported those — actual **Shop** renderer issues were fixed instead: duplicate `border` in [`src/renderer/src/ShopApp.tsx`](../../src/renderer/src/ShopApp.tsx), and `HTMLCanvasElement | null` closure narrowing in [`src/renderer/src/ShopModelViewer.tsx`](../../src/renderer/src/ShopModelViewer.tsx) via `canvasEl` / `wrapEl` after guard. **`machine-cps-import.test.ts`** expectation updated to `cnc_grbl.hbs` to match [`machine-cps-import.ts`](../../src/main/machine-cps-import.ts) `postTemplateMap` for `grbl`.

**Coordinator action:** If `typecheck` regresses, restore a table here with file paths and error counts; treat **`npm test` + `npm run build` + `npm run typecheck`** as the **release bar** when all three pass.

---

## 3b. Historical (resolved prior to 2026-03-25)

| Area | File(s) | Summary | Resolved |
|------|---------|---------|----------|
| Design constraints | `DesignWorkspace.tsx` | `parameterKey` narrowing (drift note) | **Superseded** — not reproduced in 2026-03-25 `tsc` |
| Schema | `assembly-schema.ts` | Implicit `any` for `p` (drift note) | **Superseded** — not reproduced in 2026-03-25 `tsc` |
| Tests | `sketch-profile.test.ts` | Arc fixture (drift note) | **Superseded** — not reproduced in 2026-03-25 `tsc` |

**Resolved since prior drift (2026-03-19):** `assembly-mesh-interference.test.ts` transform fixture; `drawing-export-service.ts` `PrintToPDFOptions` (`marginsType` → `margins.marginType`); `useShellResizableColumns.ts` DOM vs React `PointerEvent` (Stream T micro-fixes, 2026-03-20).

---

## 4. Doc vs `PARITY_PHASES.md` (spot checks)

| Topic | Risk | Suggested owner |
|-------|------|-----------------|
| Phase rows are dense; **VERIFICATION** tables may lag new IPC (e.g. BOM hierarchy, interference save). | Manual steps missing new buttons/paths | **G** after feature merge |
| **Epic 7.E** (import/tools) in roadmap vs Utilities copy | Stale extension lists | **R** + **G** |
| **Stream M** claims parity with **T** | M must not edit this file when T runs | **Coordinator** |

---

## 5. Handoff checklist (Stream T → others)

When refreshing this file, end the Stream T chat with:

1. **Gates:** test / build / typecheck table (§1).
2. **New drift rows:** §3–4 updates.
3. **Owners:** which stream fixes each P0 (E, A, P, H, …).
4. **Shipped line:** `Shipped: Verifier — VERIFICATION_DRIFT.md — <what changed>.`

**Stream G** follow-up: apply prose/link fixes in [`VERIFICATION.md`](../VERIFICATION.md), [`PARITY_PHASES.md`](../PARITY_PHASES.md), README — **do not** delete §3 rows until code is fixed (mark “resolved in PR #…” instead).

---

## 6. Resolution log (append-only)

| Date | Change |
|------|--------|
| 2026-03-19 | Initial artifact; documented typecheck debt; IPC inventory; gate results. |
| 2026-03-19 | `CommandCatalogPanel` `resetFilters` P0 fix (Stream T micro-fix). |
| 2026-03-20 | Refreshed gates (test/build pass; typecheck 7 errors). IPC list unchanged vs preload. §3 trimmed to remaining debt; micro-fixes: assembly test identity `transform`; PDF `margins` for Electron `PrintToPDFOptions`; shell resize listeners use DOM `PointerEvent`. |
| 2026-03-24 | Stream S: §2 contract description updated — `ipc-contract.test.ts` scans all non-test `src/main/**/*.ts`; core IPC moved to `ipc-core.ts`; duplicate `ipcMain.handle` channels fail tests. |
| 2026-03-25 | Regression recovery: gate **test / build / typecheck** all **PASS**; §1 updated; §3 cleared with **Shop** `tsc` fixes + `machine-cps-import` test expectation; prior §3 Design/assembly/sketch rows marked historical (not reproduced by current `tsc`). |
