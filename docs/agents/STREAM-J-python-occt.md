# Agent brief — Stream J: Python OCCT / CadQuery (`engines/occt/`)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **J** (Python OCCT). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve the **optional CadQuery sidecar** that builds kernel solids and converts STEP → STL — **without** owning TypeScript kernel wiring, IPC, or sketch schema.

## Mission

Ship **Python-only** improvements so that:

- **Kernel builds** (`build_part.py`) stay reliable: clearer `error` codes, safer handling of edge-case profiles, better docstrings, honest “partial” behavior notes in code comments.
- **STEP import** (`step_to_stl.py`) stays predictable: filesystem checks, CadQuery import failures, and export errors surface as **machine-parseable JSON**.
- **Integrators** can read **one** place how stdout JSON maps to Node: [`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md) (Python sidecar section) + [`../../engines/occt/README.md`](../../engines/occt/README.md).

## Allowed paths

| Primary | Notes |
|---------|--------|
| `engines/occt/*.py` | `build_part.py`, `step_to_stl.py`, and future OCCT helpers in the same folder |
| `engines/occt/README.md` | Install notes, CLI examples, links to `GEOMETRY_KERNEL.md` |
| `docs/GEOMETRY_KERNEL.md` | **Only** subsections that describe **Python script I/O**, stdout contract, error codes, or cadquery behavior — keep TS/payload docs aligned with **Stream B** if you change semantics |

**Read-only for contracts:** [`../../src/main/cad/occt-import.ts`](../../src/main/cad/occt-import.ts) (`runPythonJson` — **last non-empty line** of combined stdout/stderr is JSON), [`../../src/main/cad/build-kernel-part.ts`](../../src/main/cad/build-kernel-part.ts) (CLI args to `build_part.py`).

## Stdout JSON contract (do not break)

Node parses the **final non-empty line** after the process exits. **Do not** `print()` debug text to stdout; use stderr if you must log.

| Script | Success (shape) | Failure (shape) |
|--------|-----------------|-----------------|
| `build_part.py` | `{"ok": true, "stepPath": "...", "stlPath": "...", "loftStrategy?": "..."}` | `{"ok": false, "error": "<code>", "detail?": "..."}` |
| `step_to_stl.py` | `{"ok": true, "out": "<stl path>"}` | `{"ok": false, "error": "<code>", "detail?": "..."}` — codes include `usage`, `step_file_not_found`, `step_stat_failed`, `step_file_empty`, `cadquery_not_installed`, `stl_output_dir_failed`, `stl_path_is_directory`, `step_import_failed`, `stl_export_failed` |

New `error` codes are fine if **`build-kernel-part.ts` / UI** already map them generically; if the app must branch on a code, that is **Stream B** (or **S** if IPC copy changes).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| Refactors **inside** `engines/occt/*.py` | `src/**` edits (hand off to **Stream B** for `build-kernel-part.ts`, schemas, preload/main) |
| New **optional** helpers under `engines/occt/` | Changing **`sketch-profile`** / **design-schema** payload shape without **Stream A** + **B** agreement |
| Tighter validation + clearer `error` / `detail` | Silent failures or non-JSON stdout |
| `docs/GEOMETRY_KERNEL.md` edits in the OCCT/python rows you touched | Rewriting unrelated parity sections (use **Stream G** for doc-only drift elsewhere) |

- **CadQuery** remains **optional** at runtime — scripts must still emit structured JSON when imports fail (`cadquery_not_installed`, etc.).
- **`npm test` && `npm run build`** from `unified-fab-studio/` before claiming **Aggressive — Stream J** done (guards accidental TS/schema drift if the branch picked up other edits).

## Directory map (inventory)

| File | Role |
|------|------|
| [`build_part.py`](../../engines/occt/build_part.py) | Kernel JSON payload → STEP + STL; `postSolidOps`, loft chain, sketch plane placement |
| [`step_to_stl.py`](../../engines/occt/step_to_stl.py) | STEP path + STL out path → STL via CadQuery |
| [`README.md`](../../engines/occt/README.md) | pip install, manual CLI examples |

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **B** | B owns **`src/main/cad/*`**, kernel manifests, **Zod** schemas; **J** owns **Python** implementation. Payload **version** bumps need **both** aligned. |
| **I** | **`engines/cam/`** only — safe in parallel with **J** (disjoint folders). |
| **A** | **Sketch profile / design JSON** shape — **J** must not change what TS emits without A’s merge plan. |
| **G** | If you only adjust **GEOMETRY_KERNEL.md** prose with **no** Python change, **G** can own it; **J** should update kernel docs when **behavior** changes. |
| **H** | Vitest covers **`buildKernelBuildPayload`** in TS — not `build_part.py`. Manual Python checks per `engines/occt/README.md`. |

## Success criteria (pick one slice per chat)

- One **shipped theme**: e.g. clearer failure for a loft edge case, `step_to_stl` error code documented, README example for Windows paths, or reduced OCC throw leaking into `detail`.

## Final reply format

End with a single line:

`Shipped: OCCT — <file or theme> — <what designers/integrators gain>.`
