# Sample project — kernel post ops (Phase 3)

Open this folder as a **project** in Unified Fab Studio (Utilities → Project → Open). The app expects `project.json` at the root plus `design/sketch.json` and `part/features.json`.

Default **`part/features.json`**: rectangular extrude (10 mm) + **`pattern_rectangular`** (2×1, 40 mm X spacing) → kernel payload **version 3** after merge.

**Requirements:** Python with **CadQuery** installed; use **Design → Build STEP (kernel)**. If CadQuery is missing, the main process receives `cadquery_not_installed` JSON from `build_part.py` (unchanged contract).

## Trying an example

1. Copy the chosen `part/features.*.example.json` body into **`part/features.json`** (replace the whole file).
2. If the table below says **rect + circle sketch**, copy `design/sketch.rect-circle.example.json` over **`design/sketch.json`** (rectangle + centered hole circle → `profiles[0]` rect, `profiles[1]` circle).
3. Build STEP (kernel). Some ops are **geometry-sensitive** (large fillets, shell thickness); shrink radii/thickness if OCC fails.

## `part/*.example.json` index (shipped `kernelOps`)

| File | Op(s) | Sketch |
|------|--------|--------|
| `features.json` (default) | `pattern_rectangular` | default rectangle |
| `features.pattern-and-cylinder.example.json` | `pattern_rectangular` + `boolean_subtract_cylinder` | default |
| `features.union-boss.example.json` | `boolean_union_box` | default |
| `features.subtract-box.example.json` | `boolean_subtract_box` | default |
| `features.circular.example.json` | `pattern_circular` | default |
| `features.linear3d.example.json` | `pattern_linear_3d` | default |
| `features.mirror.example.json` | `mirror_union_plane` (origin 0,0,0) | default |
| `features.mirror-offset-origin.example.json` | `mirror_union_plane` (YZ through x=15 mm) | default |
| `features.intersect-box.example.json` | `boolean_intersect_box` | default |
| `features.fillet-all.example.json` | `fillet_all` | default |
| `features.chamfer-all.example.json` | `chamfer_all` | default |
| `features.fillet-select.example.json` | `fillet_select` | default |
| `features.chamfer-select.example.json` | `chamfer_select` | default |
| `features.shell-inward.example.json` | `shell_inward` (+Z) | default |
| `features.shell-inward-open-plus-x.example.json` | `shell_inward` (+X cap) | default |
| `features.pattern-path.example.json` | `pattern_path` | default |
| `features.pattern-path-closed.example.json` | `pattern_path` (`closedPath`) | default |
| `features.pattern-path-tangent.example.json` | `pattern_path` (`alignToPathTangent`) | default |
| `features.split-halfspace.example.json` | `split_keep_halfspace` (X, offset 0, keep positive) | default |
| `features.split-halfspace-negative-offset.example.json` | `split_keep_halfspace` (Y, offset 5 mm, keep negative) | default |
| `features.transform-translate.example.json` | `transform_translate` | default |
| `features.thicken-scale.example.json` | `thicken_scale` (legacy surrogate) | default |
| `features.thicken-offset.example.json` | `thicken_offset` (true offset request) | default |
| `features.boolean-combine-profile.example.json` | `boolean_combine_profile` | **rect + circle** |
| `features.boolean-combine-profile-minus-z.example.json` | `boolean_combine_profile` (`extrudeDirection` −Z) | **rect + circle** |
| `features.hole-from-profile.example.json` | `hole_from_profile` (`through_all`) | **rect + circle** |
| `features.hole-from-profile-depth.example.json` | `hole_from_profile` (`depth` + `depthMm`) | **rect + circle** |
| `features.press-pull-profile.example.json` | `press_pull_profile` | default |
| `features.thread-cosmetic.example.json` | `thread_cosmetic` (legacy compatibility, maps to cosmetic thread wizard) | default |
| `features.thread-wizard.example.json` | `thread_wizard` | default |
| `features.sweep-profile-path.example.json` | `sweep_profile_path` (legacy compatibility) | default |
| `features.sweep-profile-path-true.example.json` | `sweep_profile_path_true` | default |
| `features.pipe-path.example.json` | `pipe_path` | default |
| `features.coil-cut.example.json` | `coil_cut` (kernel ≤1024 ring instances) | default |
| `features.sheet-tab-union.example.json` | `sheet_tab_union` | default |
| `features.suppressed-op.example.json` | `fillet_all` (suppressed) + `chamfer_all` | default |

**CI:** `src/shared/sample-kernel-solid-ops-examples.test.ts` parses every `part/*.example.json` with `partFeaturesFileSchema`.

**Split:** After **Build STEP (kernel)** with `split_keep_halfspace`, `part/kernel-manifest.json` includes **`splitKeepHalfspace`** (axis, offsetMm, keep) when the Python build succeeds. When the discarded half has volume, **`splitDiscardedStepPath`** / **`splitDiscardedStlPath`** point at **`kernel-part-split-discard.*`** in `output/` (same sketch placement as the kept body).

**Manual QA:** cross-check steps in [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — **Geometry kernel (CadQuery / cad:kernelBuild)** (manifest, Phase 3 ops table).
