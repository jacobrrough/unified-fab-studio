# Agent brief — Stream S: IPC integration (main + preload)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **S** (IPC registration). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Be the **single owner** per merge batch for **`ipcMain.handle`** registration and the **`contextBridge`** API so parallel feature streams (C, D, E, R, B, …) do not fight over the same hot files.

## Mission

Ship **additive** Electron IPC that:

- **Matches end-to-end** — every `ipcRenderer.invoke('channel', …)` in preload has a matching `ipcMain.handle('channel', …)` in main (enforced by [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts)).
- **Stays thin at the boundary** — handler bodies live in `src/main/<module>.ts` (or existing helpers); `src/main/index.ts` wires imports and one-line registrations where possible.
- **Types the renderer surface** — extend the preload `Api` type and `contextBridge.exposeInMainWorld` payload; [`src/renderer/src/vite-env.d.ts`](../../src/renderer/src/vite-env.d.ts) picks up `Api` via `window.fab` — no duplicate channel string literals in the renderer if you expose a typed method instead.

## Allowed paths (primary)

| File / area | Notes |
|-------------|--------|
| `src/main/index.ts` | Register handlers; keep bulky logic out |
| `src/preload/index.ts` | `invoke` wrappers, `Api` type, `exposeInMainWorld` |
| `src/main/**/*.ts` | New or extended modules that handlers call — **preferred** place for logic |
| `src/shared/**/*.ts` | Only when a stream agreed on payloads/schemas and you need a shared type imported by preload |

**Avoid** in the same batch unless unavoidable for one call site: `src/renderer/**` business logic, `App.tsx` — hand UI work to **A–E** and limit yourself to what’s needed to invoke the new API.

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| New channels + typed preload methods | Drive-by refactors unrelated to the new IPC |
| Delegating to existing main modules (`cam-local`, `slicer`, `cad/*`, …) | Registering handlers **without** a preload `invoke` (contract test assumes preload is source of truth for “used” channels) |
| Small fixes inside `main/index.ts` / `preload` needed for wiring | Multiple parallel chats editing **`main/index.ts` + `preload/index.ts`** without coordination |

**Contract test behavior:** [`ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts) scans **`src/preload/index.ts`** for `ipcRenderer.invoke('…')` and requires each name in **`src/main/index.ts`** `ipcMain.handle('…')`. If you add a handler that is only for internal/main use, either expose it through preload for the contract test or coordinate **Stream H** to evolve the test — default path is **preload + main together**.

- **`npm test`** and **`npm run build`** from **`unified-fab-studio/`** before claiming done (same bar as **Aggressive — Stream S** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md)).

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **H (tests)** | **H4** extends `ipc-contract.test.ts` for **existing** channels only; new channels ⇒ **S** wires preload + main first, then **H** can add focused tests. |
| **P (main helpers)** | **P** refactors `src/main/**/*.ts` **except** `index.ts` — **S** adds `ipcMain.handle` + preload; keep handler bodies delegated to **P** modules. |
| **D (manufacture)** | CAM/slicer invokes often need **S** when adding or renaming channels; D owns `cam-*` modules, **S** owns registration. |
| **C (assembly)** | Assembly IPC batches should go through **S** when touching `main/index.ts` / preload. |
| **G (docs)** | After new channels, **G** may document names — ground truth is preload + main + contract test. |
| **I / J (Python)** | No Python in **S**; if only main module changes, D/B own the module — **S** only if registration or preload API changes. |
| **R (import / tools)** | **`assets:importMesh`**, **`tools:import`**, **`tools:importFile`** — **R** owns handler **bodies** in `mesh-import-registry`, `tools-import`; **S** batches **registration** + preload **`Api`** when channels are added or renamed ([`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md)). |

## Checklist (new channel)

1. Pick a stable channel string (consistent with existing naming: `camelCase` segments, domain prefix if helpful).
2. Add `ipcMain.handle` in `src/main/index.ts` → delegate to a function in `src/main/...`.
3. Add `ipcRenderer.invoke` in `src/preload/index.ts` and extend **`Api`**.
4. Run **`npm test`** (includes IPC contract) and **`npm run build`**.
5. Tell feature-stream owners they can call `window.fab.<method>()` from the renderer.

## Success criteria (one batch)

- **Shipped slice:** one logical feature’s IPC surface (one or more related channels) fully wired.
- **Green:** `npm test` + `npm run build`.
- **No orphan invokes** and no duplicate/conflicting handler names.

## Final reply format

End with a single line:

`Shipped: IPC — <channel name(s)> — <consumer or feature>.`

---

## Focused Vitest run

From **`unified-fab-studio/`** after touching preload or main registration:

```bash
npx vitest run src/main/ipc-contract.test.ts
```

Use the full **`npm test`** suite before claiming done (contract test is included).

---

## See also

- Pasteables: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — **Stream S** (standard block), **Aggressive — Stream S**, **MICRO-SPRINT (Stream S)**.
- Parallel plan: [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md) — hot files, merge order.
- Manual QA pointers: [`../VERIFICATION.md`](../VERIFICATION.md).
