# Geometry kernel strategy (kernel-choice)

## Decision

| Concern | Choice |
|--------|--------|
| **Authoritative BRep** (STEP, fillets, booleans, assemblies at scale) | **OpenCascade (OCCT)** via **CadQuery** in a **Python sidecar** — same pattern as existing `engines/occt/step_to_stl.py`. |
| **Interactive preview** | **Three.js** in the renderer (meshes from extrude/revolve/lathe). |
| **2D parametric sketch** | **TypeScript** constraint solver (`src/renderer/design/solver2d.ts`) so sketches solve without round-trips; optional future: call SolveSpace/OCCT sketch if needed. |

## Why not OCCT for every sketch solve?

Sub-millisecond UI feedback for drag/solve favors an in-process TS solver. OCCT/CadQuery is used when you need **exact** solids, **STEP export**, and **feature regeneration** from a full history DAG (Phase B+ depth).

## Integration path

1. **Today:** Sketch points + constraints → TS solver → STL/extrude/revolve preview in Three.js. **Design workspace** uses **model view** (3D only) vs **sketch view** (full-screen 2D grid): datum plane choice (**Top XY / Front XZ / Right YZ**) and **face pick** are stored as `sketchPlane` (`design/sketch.json`). **`design-schema`** requires **finite** numbers for **`extrudeDepthMm`**, **`loftSeparationMm`**, **`revolve`**, face-plane **`origin` / `normal` / `xAxis`**; **`buildKernelBuildPayload`** also rejects non-finite base numerics (`invalid_extrude_depth_mm`, `invalid_loft_separation_mm`, `invalid_revolve_params`) before writing the sidecar payload. **Three.js preview + design STL export** bake `sketchPreviewPlacementMatrix` on the mesh. **CadQuery** (`build_part.py`) receives the same `sketchPlane` on the kernel JSON payload and applies the equivalent transform **after** `postSolidOps`, so kernel STEP/STL match preview while feature ops still run in canonical XY/+Z space.  
2. **Phase 1 (done):** `engines/occt/build_part.py` — kernel JSON payload from `design/sketch.json` → CadQuery **extrude** / **revolve** (loops + circles for extrude; revolve uses first loop only; circle+revolve blocked in TS) → `output/kernel-part.step` + `.stl`; manifest at `part/kernel-manifest.json`. **Design → Solid → “Build STEP (kernel)”** saves the design then runs the sidecar (requires **Python + cadquery**).  
3. **Phase 3 (baseline for kernel post-ops):** After extrude/revolve/loft, optional ordered **`postSolidOps`** from `part/features.json` → `kernelOps` (rows with **`suppressed: true`** stay in the file for ordering but are **dropped** before Python sees them), applied in CadQuery before STEP/STL export:
   - **`fillet_all` / `chamfer_all`** — all edges (may fail on tight geometry; failures use `postSolidOps[i] kind='…': …`).
   - **`shell_inward`** — optional **`openDirection`** `+X`, `-X`, `+Y`, `-Y`, `+Z` (default), or `-Z`; removes one planar cap at that axis extremum and shells inward; if the primary cap fails in OCC, the script tries the opposite cap. On total failure, **`build_failed`** detail names both cap selectors and the underlying errors.
   - **`pattern_rectangular`** — XY grid of translated copies of the current solid (`countX`×`countY`, spacing mm), unioned; requires `countX>1` or `countY>1`; cap 32 per axis.
   - **`pattern_circular`** — `count` copies (2–32): first instance is the current solid; additional copies are the same solid rotated around **+Z** through (`centerXMm`, `centerYMm`, 0). Angular step = `totalAngleDeg / count` (default full turn 360°); each copy *i* uses angle `startAngleDeg + i * step` for *i* = 1 … *count*−1.
   - **`pattern_linear_3d`** — `count` instances (2–32): first unchanged; union copies translated by *i*·(`dxMm`,`dyMm`,`dzMm`) for *i* = 1 … *count*−1 (not all three deltas zero).
   - **`boolean_subtract_cylinder`** — axis-aligned cylinder along +Z (`centerXMm`, `centerYMm`, `radiusMm`, `zMinMm`/`zMaxMm`) cut from the body.
   - **`boolean_union_box`** — axis-aligned box (`xMinMm`…`xMaxMm`, `yMinMm`…`yMaxMm`, `zMinMm`…`zMaxMm`, strict inequalities) unioned onto the body (additive boolean).
   - **`boolean_subtract_box`** — same axis-aligned bounds as `boolean_union_box`, cut from the body (rectangular pocket / slot).
   - **`boolean_intersect_box`** — same AABB shape; **intersect** keeps only volume inside the box (trim / clip stub).
   - **`boolean_combine_profile`** — second-body combine from kernel `profiles[profileIndex]` extrude (`mode`: union/subtract/intersect, `extrudeDepthMm`, `zStartMm`).
   - **`split_keep_halfspace`** — axis-plane split keep-side surrogate: intersect with half-space (`axis` X/Y/Z, `offsetMm`, `keep` positive/negative). Examples: [`features.split-halfspace.example.json`](../resources/sample-kernel-solid-ops/part/features.split-halfspace.example.json), [`features.split-halfspace-negative-offset.example.json`](../resources/sample-kernel-solid-ops/part/features.split-halfspace-negative-offset.example.json).
   - **`hole_from_profile`** — cut profile extrude by **`depth`** (requires positive **`depthMm`**) or **`through_all`** (from `profileIndex`, optional `zStartMm`). Schema matches Python: depth mode without **`depthMm`** fails **`invalid_payload`** before CadQuery.
  - **`thread_cosmetic`** — legacy compatibility op; now normalized to `thread_wizard` cosmetic mode in TypeScript before Python build.
  - **`thread_wizard`** — modeled/cosmetic thread workflow (standard/designation/class metadata, hand, starts). Modeled path follows a 3D helix at mean radius with ball-chain (sphere) cuts, with short-cylinder fallback if `sphere()` is unavailable — **approximation**, not a certified thread form.
   - **`transform_translate`** — move body by ΔX/ΔY/ΔZ, or copy+union when `keepOriginal=true`.
   - **`press_pull_profile`** — signed profile extrude (`+` union, `-` cut) from `profileIndex` with `deltaMm`.
   - **`pattern_path`** — path instance copies sampled along sketch polyline path points (translation-only). Optional **`closedPath`** adds the closing edge from the last point to the first when they differ (requires ≥3 points); uniform spacing uses total perimeter including that edge.
  - **`sweep_profile_path`** — legacy compatibility op; normalized to `sweep_profile_path_true` with `orientationMode: frenet`.
  - **`sweep_profile_path_true`** — orientation-aware polyline sweep (`frenet` / `path_tangent_lock` use discrete **parallel transport** of the profile normal; `fixed_normal` projects a world normal into each segment’s normal plane). Segments use a tiny length overlap to improve union at corners.
   - **`pipe_path`** — circular-section polyline sweep sharing the same framing rules as `sweep_profile_path_true`, optional wall thickness (`outerRadiusMm`, `wallThicknessMm`), and the same corner overlap behavior.
  - **`thicken_scale`** — legacy compatibility surrogate (maps to `thicken_offset` by signed distance and side).
  - **`thicken_offset`** — true offset/thicken via OCC `BRepOffsetAPI_MakeOffsetShape.PerformByJoin` (`outward` / `inward` / `both`). Tolerance scales with body size and is **retried** with looser values on failure (thin walls / complex topology may still error).
   - **`coil_cut`** — helical-style stacked ring cuts along +Z (simplified surrogate, not a true swept coil). Ring instance count is `min(1024, floor(turns×16))` in [`build_part.py`](../engines/occt/build_part.py); sample [`features.coil-cut.example.json`](../resources/sample-kernel-solid-ops/part/features.coil-cut.example.json).
   - **`mirror_union_plane`** — union the body with its mirror across world plane **YZ** / **XZ** / **XY** through (`originXMm`,`originYMm`,`originZMm`) (CadQuery `mirror` + `union`). Origins default to `0` and must be **finite** numbers (mm); invalid values fail **`invalid_payload`** before OCC. Example with offset plane: [`resources/sample-kernel-solid-ops/part/features.mirror-offset-origin.example.json`](../resources/sample-kernel-solid-ops/part/features.mirror-offset-origin.example.json).
  Payload **`version`**: `1` base only, `2` legacy post ops, `3` extended post ops, **`4`** for true sweep/thread/thicken op set. **`part/features.json`** `kernelOps` are validated in TypeScript with **`part-features-schema.ts`** using **`z.number().finite()`** (`mm` / `mmPos` helpers) on the same numeric fields the Python script treats as finite mm — bad values fail in the app before spawn when features are parsed. Manifest records `payloadVersion`, `postSolidOpCount`, and `sketchPlaneKind` / `sketchPlaneDatum` for placement traceability. After **Build STEP (kernel)**, UI runs a lightweight preview-vs-kernel STL AABB parity check and stores `placementParity` / detail in the manifest. Examples on disk: [`resources/sample-kernel-solid-ops/`](../resources/sample-kernel-solid-ops/README.md) — one **`part/*.example.json`** per shipped `kernelOps` kind (plus `design/sketch.rect-circle.example.json` when `profileIndex` refers to a second sketch profile).  
4. **Phase 4 (expanded):** **Loft** — **2–16** closed profiles in **sketch entity order**; **`loftSeparationMm`** is the uniform **+Z** step between **consecutive** profiles (preview stacks ruled strips at `0…h`, `h…2h`, …). **Kernel:** for **two** profiles, same as before (smooth/ruled × second-loop winding → tag like `smooth+align`). For **three or more**, `build_part.py` **unions** stacked segment lofts (each segment uses `_loft_two_profiles` + `translate(0,0,i·h)`); manifest **`loftStrategy`** may read `multi+union-chain:<n>:…`. **Preview vs kernel:** same spacing and per-segment winding alignment; segment **union** can differ slightly from a single multi-wire OCC loft on exotic geometry — document any case you hit. **Sheet ops:** `sheet_tab_union` (axis-aligned boss), `sheet_fold` (bend-line fold transform with bend metadata), `sheet_flat_pattern` marker op (manifest tag `flatPatternStrategy` when present). **Guide rails:** `loft_guide_rails` is currently a validated marker op (rails checked for finite/non-degenerate paths). **Plastic MVP ops:** `plastic_rule_fillet`, `plastic_boss`, `plastic_lip_groove`. **Samples:** [`resources/sample-kernel-sheet-tab/`](../resources/sample-kernel-sheet-tab/README.md), [`resources/sample-kernel-sheet-fold/`](../resources/sample-kernel-sheet-fold/README.md), [`resources/sample-kernel-loft-multi/`](../resources/sample-kernel-loft-multi/README.md).
5. **Later:** Full feature DAG regeneration, richer body/face references and diagnostics, deeper face/body targeting for sweep/thicken/thread UX, **sheet metal bends / flat pattern** and **plastic** rule features, tighter feature browser ↔ kernel sync.

## Files

- Sketch solver: [`src/renderer/design/solver2d.ts`](../src/renderer/design/solver2d.ts)  
- Profile extraction (shared): [`src/shared/sketch-profile.ts`](../src/shared/sketch-profile.ts)  
- Kernel manifest schema: [`src/shared/kernel-manifest-schema.ts`](../src/shared/kernel-manifest-schema.ts)  
- Main IPC build: [`src/main/cad/build-kernel-part.ts`](../src/main/cad/build-kernel-part.ts)  
- STEP import + Python runner: [`engines/occt/`](../engines/occt/)  

## Python sidecar JSON (stdout)

Electron’s [`runPythonJson`](../src/main/cad/occt-import.ts) captures **combined** stdout/stderr and parses the **last non-empty line** as JSON. The CadQuery scripts therefore must treat **stdout as the JSON channel only** (no stray prints); optional library noise may appear on stderr.

### `build_part.py`

- **Success:** `{ "ok": true, "stepPath": "<abs>", "stlPath": "<abs>", "loftStrategy"?: "<tag>" }` — `loftStrategy` only when `solidKind` is `loft` and a strategy was chosen.
- **Errors:** `{ "ok": false, "error": "<code>", "detail"?: "<message>" }`.
  - **`usage`** / **`payload_read_failed`** / **`bad_payload_version`** / **`cadquery_not_installed`** — unchanged semantics.
  - **`invalid_payload`** — payload failed **pre-OCC** checks (root not an object, bad `extrudeDepthMm` / `loftSeparationMm` / `revolve` numbers, no usable profiles for extrude, revolve first profile not a valid loop, loft profile pair invalid, or **`postSolidOps`** structurally invalid including unknown `kind`). Scalar mm fields in **`postSolidOps`** must be **finite** (no NaN/±Inf) — `_require_finite_mm` in `build_part.py` rejects them before CadQuery runs. **`postSolidOps`** validation failures use the stable prefix `postSolidOps[i] kind='…': …` (see `_format_post_op_failure` in `build_part.py`). Ops that reference **`profileIndex`** (`boolean_combine_profile`, `hole_from_profile`, `press_pull_profile`, `sweep_profile_path`, `sweep_profile_path_true`) are checked against the payload **`profiles`** list length before CadQuery (`_validate_post_solid_profile_indices`).
  - **`unknown_solid_kind`** — `detail` is the unsupported `solidKind` string.
  - **`output_dir_failed`** — could not create `out_dir`.
  - **`no_solid`** — geometry step produced no solid (e.g. loft exhausted fallbacks).
  - **`build_failed`** — CadQuery/OCC failure during build or export. Failures inside **`postSolidOps`** application use the same prefix: `postSolidOps[i] kind='…': …` so index and op kind are always present.

**Geometry:** Extrude and revolve **loops** use the same normalize/dedupe/closed-ring trimming as loft (`_normalize_loop_profile`), so kernel behavior matches across solid kinds.

### `step_to_stl.py`

- **Success:** `{ "ok": true, "out": "<abs stl path>" }` (main still resolves the STL path it passed in; this field is the resolved path written).
- **Errors:** `cadquery_not_installed`, **`step_file_not_found`** (source path not a file), **`step_stat_failed`** (could not stat the STEP path), **`step_file_empty`** (zero-byte STEP), **`stl_output_dir_failed`** (could not create parent of output), **`stl_path_is_directory`** (output path exists and is a directory), **`step_import_failed`** (CadQuery `importStep`), **`stl_export_failed`** (CadQuery STL export), **`usage`** with `detail` describing argv. (Older builds used a single `step_export_failed` for import/export; split codes are preferred for diagnostics.)

## How to verify

Follow the **Geometry kernel** checklist in [`VERIFICATION.md`](VERIFICATION.md) (artifacts under `output/`, `part/kernel-manifest.json`, sample projects). Run **`npm test`** from `unified-fab-studio/` — `sketch-profile` tests cover **`buildKernelBuildPayload`** used before `build_part.py`.
