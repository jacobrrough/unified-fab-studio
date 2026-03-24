# Verification drift log (Stream T artifact)

**Owner:** Stream **T** ([`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md)). Do not rewrite in the same batch as Stream **M** — see [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md).

**Purpose:** Track gaps between **docs**, **`npm test`**, **`npm run typecheck`**, and **IPC** reality. **Stream G** (or feature streams) closes items by editing targets — not by deleting rows here until fixed.

**Last gate run:** 2026-03-20 (automated; refresh when merging risky batches).

---

## 1. Automated gates (from `unified-fab-studio/`)

| Gate | Result | Notes |
|------|--------|--------|
| `npm test` | **PASS** | Includes `src/main/ipc-contract.test.ts` (preload `invoke` ⊆ main `handle`). |
| `npm run build` | **PASS** | `electron-vite build` + electron-builder; does not prove `tsc --noEmit` clean. |
| `npm run typecheck` | **FAIL** | `tsc --noEmit` reports **7** errors in **3** files — **release bar incomplete** until green. See §3. |

**Optional (not run in last sweep):** `python engines/cam/smoke_ocl_toolpath.py` when CAM Python changes; manual **Build STEP (kernel)** when `engines/occt/` changes.

---

## 2. IPC channel inventory (renderer ↔ main)

Contract enforced by **`ipc-contract.test.ts`**: every `ipcRenderer.invoke('…')` in `src/preload/index.ts` has a matching `ipcMain.handle('…')` somewhere in non-test `src/main/**/*.ts` (registrars include [`ipc-core.ts`](../../src/main/ipc-core.ts), [`ipc-modeling.ts`](../../src/main/ipc-modeling.ts), [`ipc-fabrication.ts`](../../src/main/ipc-fabrication.ts), plus any future `ipc-*.ts` modules). Duplicate channel names across files fail the test.

**Channels in use (alphabetical):**

`assembly:exportBom`, `assembly:exportBomHierarchical`, `assembly:exportBomHierarchyJson`, `assembly:interferenceCheck`, `assembly:load`, `assembly:readStlBase64`, `assembly:save`, `assembly:saveInterferenceReport`, `assembly:summary`, `assets:importMesh`, `cad:comparePreviewKernel`, `cad:importStep`, `cad:importStl`, `cad:kernelBuild`, `cam:run`, `design:exportParameters`, `design:load`, `design:mergeParameters`, `design:save`, `dialog:openFile`, `dialog:openFiles`, `drawing:export`, `drawing:load`, `drawing:save`, `features:load`, `features:save`, `file:readText`, `machines:list`, `manufacture:load`, `manufacture:save`, `model:exportStl`, `project:create`, `project:openDir`, `project:read`, `project:save`, `settings:get`, `settings:set`, `shell:openPath`, `slice:cura`, `stl:stage`, `tools:import`, `tools:importFile`, `tools:read`, `tools:save`.

**Doc alignment:** [`VERIFICATION.md`](../VERIFICATION.md) should name channels exactly as above (e.g. `file:readText` for text reads, not a fictional `readTextFile` channel).

---

## 3. Typecheck failures (P0 — assign Stream E / A / shared owners)

The following were reported by `npm run typecheck` on last refresh. **Fix in dedicated PRs** (not necessarily Stream T).

| Area | File(s) | Summary |
|------|---------|---------|
| Design constraints | `src/renderer/design/DesignWorkspace.tsx` | Access to `parameterKey` on sketch constraint union without narrowing (`coincident` et al. lack `parameterKey`) — ~lines 3133–3203. |
| Schema | `src/shared/assembly-schema.ts` | Implicit `any` / self-referential initializer for `p` (~line 250). |
| Tests | `src/shared/sketch-profile.test.ts` | Wrong sketch entity passed where `kind: "arc"` expected (~line 445). |

**Error count:** **7** `tsc` diagnostics (above rows).

**Resolved since prior drift (2026-03-19):** `assembly-mesh-interference.test.ts` transform fixture; `drawing-export-service.ts` `PrintToPDFOptions` (`marginsType` → `margins.marginType`); `useShellResizableColumns.ts` DOM vs React `PointerEvent` (Stream T micro-fixes, 2026-03-20).

**Coordinator action:** Until `typecheck` is green, treat **`npm test` + `npm run build`** as **necessary but not sufficient** for release.

**Suggested handoffs**

| Item | Stream |
|------|--------|
| `DesignWorkspace.tsx` `parameterKey` narrowing | **A** |
| `assembly-schema.ts` implicit `any` | **C** or **O** |
| `sketch-profile.test.ts` arc fixture | **A** or **H** (H1 shared) |

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
