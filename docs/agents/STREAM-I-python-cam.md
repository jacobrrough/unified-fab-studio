# Agent brief — Stream I: Python CAM (`engines/cam/`)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **I** (Python CAM). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve the **optional OpenCAMLib** Python entrypoint and smoke harness — **without** owning manufacture UI, IPC, or the full `cam-runner.ts` pipeline unless **Stream D** integrates.

## Mission

Ship **Python-only** (and folder-local README) work so that:

- **`ocl_toolpath.py`** stays predictable: config validation, strategy wiring, and **one-line stdout JSON** on success and failure.
- **`smoke_ocl_toolpath.py`** keeps covering new **config / numeric / path** failure modes without requiring `pip install opencamlib`.
- **Integrators** can reconcile behavior with Node via [`../../src/main/cam-runner.ts`](../../src/main/cam-runner.ts) (`tryOclToolpath`, `runPythonScript`) and [`engines/cam/README.md`](../../engines/cam/README.md).

## Allowed paths

| Primary | Notes |
|---------|--------|
| `engines/cam/*.py` | `ocl_toolpath.py`, `smoke_ocl_toolpath.py` |
| `engines/cam/README.md` | Strategies, install, exit codes, Windows venv hints |
| `docs/agents/STREAM-I*.md` | Refresh this brief if stream rules change |

**Read-only for contracts:** [`../../src/main/cam-runner.ts`](../../src/main/cam-runner.ts) — argv `python ocl_toolpath.py <config.json>`, `cwd` = **`job.appRoot`**; config is written next to the script as `_tmp_cam.json` under `engines/cam/` with keys `stlPath`, `toolpathJsonPath`, `strategy`, feeds, stepover, etc.

## Stdout and artifact contract

- **Stdout:** Node concatenates stdout+stderr and parses behavior from the process; keep **machine-readable errors** as **one JSON line** from `_die` / success summary (see `ocl_toolpath.py` docstring). Avoid stray `print` debug on stdout.
- **Artifact:** On success, the script writes **`toolpathJsonPath`** with `{"ok": true, "toolpathLines": [...], "strategy": ...}` (see module docstring). Changing required keys or file shapes requires **Stream D** (+ **S** if IPC or paths visible to renderer change).

| Typical `error` codes | When |
|----------------------|------|
| `opencamlib_not_installed` | `import ocl` failed |
| `usage`, `config_*`, `invalid_strategy`, `invalid_numeric_params`, `stl_missing` | Bad argv, config, strategy, numbers, or STL |
| `stl_read_error` | STL path valid but OpenCAMLib could not load the mesh |
| `ocl_runtime_error`, `ocl_empty_toolpath` | OCL ran but threw or produced no segments |

Full table: [`engines/cam/README.md`](../../engines/cam/README.md).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| Clearer `error` / `detail`, docstrings, README tables | `engines/occt/**` (**Stream J**) |
| Additive optional config keys (documented) | `resources/posts/`, `resources/machines/` (**Stream F / K**) |
| Smoke cases that need no OCL | Silent failures or undocumented stdout shapes |
| One coordinated **`cam-runner.ts`** change with **D** | Drive-by edits to `manufacture-schema`, renderer CAM UI (**Stream D**) |

- **G-code** remains **unverified** until the operator checks post, units, and clearances — tone matches [`../MACHINES.md`](../MACHINES.md).
- **Aggressive — Stream I:** run **`python engines/cam/smoke_ocl_toolpath.py`** from app root, then **`npm test` && `npm run build`** from `unified-fab-studio/` (guards accidental TS drift on the branch).

## Directory map (inventory)

| File | Role |
|------|------|
| [`ocl_toolpath.py`](../../engines/cam/ocl_toolpath.py) | OCL waterline / adaptive / raster → toolpath JSON file + stdout summary |
| [`smoke_ocl_toolpath.py`](../../engines/cam/smoke_ocl_toolpath.py) | Local smoke without OpenCAMLib |
| [`README.md`](../../engines/cam/README.md) | Install, strategies, exit codes |

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **D** | **D** owns `manufacture-schema`, `cam-runner` integration, manufacture UI; **I** owns **Python**. JSON key or stdout code changes ⇒ **D** updates TS + tests. |
| **J** | **`engines/occt/`** — disjoint folder; safe in parallel. |
| **S** | New IPC or preload surface for CAM ⇒ **S**, not **I**. |
| **H** | Extend **`cam-runner.test.ts`** for TS; **I** does not own Vitest unless **D** hands off a joint task. |

## Success criteria (pick one slice per chat)

- One **shipped theme**: e.g. new validated error path, README exit-code row, smoke coverage for a config edge case, or isolated OCL strategy tweak with docstring.

## Final reply format

End with a single line:

`Shipped: CAM-Python — <file or theme> — <what integrators or machinists gain>.`

**Pasteable (short):** [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → **Stream I** or **Aggressive — Stream I**.
