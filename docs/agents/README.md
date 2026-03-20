# Agent briefs (copy into a new Cursor chat)

Each **STREAM-*.md** file is a **standalone prompt** for one agent. Start a **new chat** per stream, paste the brief as the first message (or attach the file). Every brief starts with **§ Parity queue** → link to [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) *Stream status & todos* for that stream’s row.

**All-in-one copy-paste blocks** (coordinator + A–T): [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — includes **§ Stream status & todos** (baseline vs next work per stream, synced to [`PARITY_PHASES.md`](../PARITY_PHASES.md)).

**Coordinator lead-chat playbook** (when to use short vs Aggressive pasteable, merge order, conflict checks, gates): [`COORDINATOR_PARALLEL_WORKFLOW.md`](COORDINATOR_PARALLEL_WORKFLOW.md).

**Docs-only / Markdown lane:** [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md) — compact pasteable also under **Stream G** in [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md); no `src/**`; **`npm run build`** usually skipped; **`npm test`** when docs assert IPC or test paths (see aggressive coordinator rule 6 in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md)).

| Brief | Phase | Parallel with |
|-------|-------|----------------|
| [`STREAM-A-phase2-sketch.md`](STREAM-A-phase2-sketch.md) | 2 | C, D, E (not B) |
| [`STREAM-B-phase3-solid-kernel.md`](STREAM-B-phase3-solid-kernel.md) | 3 | After A merges |
| [`STREAM-C-phase5-assembly.md`](STREAM-C-phase5-assembly.md) | 5 | A, D, E |
| [`STREAM-D-phase6-manufacture.md`](STREAM-D-phase6-manufacture.md) | 6 | A, C, E |
| [`STREAM-E-phase7-product.md`](STREAM-E-phase7-product.md) | 7 | A, C, D |
| [`STREAM-F-resources-only.md`](STREAM-F-resources-only.md) | — | G, H, I, J, K, L (watch file overlap with K/L) |
| [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) | — | G, H, I, J, L, F (narrower than F — no samples/slicer) |
| [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) | — | G, H, I, J, K, F (narrower than F — no samples/posts/machines) |
| [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md) | — | F, H, I, J, K, L (avoid same `docs/*.md` as F in one batch) |
| [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md) | — | F, G, I, J, K, L, M, P, S (pick one H island; avoid same `*.test.ts` as another H chat; serialize H2 with P on same `src/main/*.ts`) |
| [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) | — | F, G, I, J, K, L, M, N, O, Q (not `index.ts`/preload; not R import files unless coordinated; serialize with H2, S) |
| [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) | — | F, G, H, I, J, K, L, M when **only one** chat touches `main/index.ts` + `preload`; **not** paired with another S or conflicting main/preload edits |
| [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) | — | F, G, H, I, J, K, L (report-only or one cold-file fix; do not pair with **T** on **VERIFICATION_DRIFT.md**) |
| [`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md) | — | G (consume drift after T), M (no **VERIFICATION_DRIFT.md** edits); **T** owns [`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md) |
| [`STREAM-I-python-cam.md`](STREAM-I-python-cam.md) | — | J (OCCT), F, G, H, K, L; coordinate D if cam-runner JSON contract changes |
| [`STREAM-J-python-occt.md`](STREAM-J-python-occt.md) | 3–4 (Python side) | I (cam), F, G, H, K, L; coordinate B on payload/schema |
| [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) | — (design 3D shell) | C, D, E, F, G, H, I, J, K, L, M; coordinate **A** on `DesignWorkspace`; **C** if editing global `.viewport-3d` |
| [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) | — (Utilities workspace) | F, G, H, I, J, K, L, M, N, O, P, R, S; coordinate **E** on `App.tsx` / command catalog; coordinate **R** on import/history panels |
| [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) | — (import / mesh / tools) | I, J (disjoint `engines/*`), F, G, H, K, L, M; coordinate **B** on STEP, **S** on IPC, **Q** on Utilities layout, **D** on `tool-schema` semantics |

**Master plan:** [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).

**Many ready-to-paste prompts** (Coordinator + streams **A–T**, conflict matrix, IPC note): [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md). **Aggressive** blocks (forced tests, `Shipped:` one-liner, App.tsx caps, **Streams F/K/L/G/H/I/J/M/N/P/Q/R/S/T**) live in the same file under **“Aggressive pastables”**.

| Aggressive stream | Use when |
|-------------------|----------|
| **F** | Bundled `resources/**` (machines, posts, slicer, samples); optional `docs/` that describe those paths |
| **K** | `resources/posts/` + `resources/machines/` only — see [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) and **Aggressive — Stream K** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) |
| **L** | `resources/slicer/` + Cura-only docs — see [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) and **Aggressive — Stream L** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) |
| **G** | Markdown-only parity/agent docs; drift fixes; onboarding copy — **`npm run build` not required** unless full gate; **`npm test`** when docs assert IPC/paths |
| **H** | Vitest-only; one island (H1–H4); no IPC registration |
| **P** | `src/main/**` except `index.ts`; islands P1–P4; tests next to code — [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) |
| **I** | `engines/cam/*.py` + `engines/cam/README.md`; optional `cam-runner` hint with D |
| **J** | `engines/occt/*.py` + optional `GEOMETRY_KERNEL.md` kernel/python rows; no `src/**` |
| **R** | Mesh/tool import registry, `engines/mesh`, `importHistory`, parsers — [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) + **Aggressive — Stream R** |
| **S** | Single owner for `main/index.ts` + `preload/index.ts` IPC batch — [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) |
| **T** | Owns **[`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md)** — gates logged, IPC inventory, typecheck debt, handoffs — [`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md) |
| **M** | Smoke + typecheck + **in-chat** report; optional ≤1 micro-fix — [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) |
| **N** | Design `Viewport3D`, `viewport3d-bounds*`, `.design-3d*` CSS — see [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) |
| **Q** | Utilities workspace tabs (`utilities/*`, tab strip) — see [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) and **Aggressive — Stream Q** |

**Stream F** is [`resources/`](../resources/README.md) only (machines, posts, slicer stubs, samples) — see [`STREAM-F-resources-only.md`](STREAM-F-resources-only.md). **Stream K** is **posts + machines** only — see [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) and **Aggressive — Stream K** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md). **Stream L** is **`resources/slicer/`** + Cura-only docs — [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) and **Aggressive — Stream L** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) (narrower than **F**; no posts/machines/samples in the same chat). **Stream G** is docs-only — see [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md), the **Stream G** block in [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md), and **Aggressive — Stream G** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md). **Stream H** is tests-only — see [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md) and **Aggressive — Stream H**; pick one island (H1–H4) so F/G/H stay merge-friendly. **Stream P** is **main-process helpers** (not `main/index.ts`) — [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) and **Aggressive — Stream P**; pick one island (P1–P4); defer import-registry files to **Stream R**; hand new IPC to **Stream S**. **Stream S** is **main + preload IPC** only — [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) and **Aggressive — Stream S** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md); at most **one** S chat per batch on `main/index.ts` + `preload`. **Stream O** is shared TypeScript (non-sketch) — see [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md) and **Aggressive — Stream O**. **Stream I** is Python CAM only — see [`STREAM-I-python-cam.md`](STREAM-I-python-cam.md) and **Aggressive — Stream I**. **Stream J** is Python OCCT only — see [`STREAM-J-python-occt.md`](STREAM-J-python-occt.md) and **Aggressive — Stream J** (disjoint from **Stream I** `engines/cam/`). **Stream M** is post-batch **smoke + verification report** — [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) and **Aggressive — Stream M**; pairs with **`fab-verifier`**; only **Stream T** should refresh **`docs/agents/VERIFICATION_DRIFT.md`** in the same parallel plan. **Stream N** is the design **3D preview** lane — [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) and **Aggressive — Stream N** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — narrow slice so **A** keeps sketch/schema/solver while **N** improves R3F viewport and scoped layout CSS. **Stream Q** is the **Utilities** workspace lane — [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) and **Aggressive — Stream Q** — Project / Settings / Slice / CAM / Tools / Commands / Shortcuts panels; coordinate **E** if **`App.tsx`** or global command catalog rows must move. **Stream R** is **unified mesh import**, **`engines/mesh`**, **tool library parsers**, and **`importHistory`** — [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) and **Aggressive — Stream R**; coordinate **S** for IPC, **Q** for Utilities import UI, **B**/**J** for STEP.

**After risky merges:** [`../VERIFICATION.md`](../VERIFICATION.md) (kernel / CAM / assembly mesh). **`npm test`** includes [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts) — preload `invoke` channels must have matching `ipcMain.handle`.

**Troubleshooting index:** [`../VERIFICATION.md`](../VERIFICATION.md#troubleshooting) and the **Troubleshooting** table in [`../../README.md`](../../README.md#troubleshooting-local-dev).
