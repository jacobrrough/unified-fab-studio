# How to verify (manual + automated)

Use this after substantive changes to **kernel build**, **CAM**, **assembly meshes**, or **shell / palette / drawing export**, and when updating [`PARITY_PHASES.md`](PARITY_PHASES.md). It mirrors **current** behavior, not a future roadmap.

**Docs-only edits here** (wording, tables, IPC names, links — no `src/**`): use **Stream G** — [`docs/agents/STREAM-G-docs-only.md`](agents/STREAM-G-docs-only.md). Run **`npm test`** from `unified-fab-studio/` when this file names **`invoke`** channels or specific test file paths.

**Automated baseline (from `unified-fab-studio/`):**

```bash
npm test
```

Relevant suites include `src/main/ipc-contract.test.ts` (**preload `invoke` channels ⊆ `ipcMain.handle` across non-test `src/main/**/*.ts`**), `src/main/slicer.test.ts` (default bundled Cura definition path in `buildCuraSliceArgs`), `src/shared/sketch-profile.test.ts` (kernel JSON payload), `src/main/cam-*.test.ts`, `src/main/cam-local.test.ts`, `src/shared/cam-*.test.ts`, `src/main/assembly-mesh-interference.test.ts`, `src/shared/assembly-schema.test.ts` (parse, BOM summary roll-ups, hierarchical BOM text), `src/shared/assembly-viewport-math.test.ts`, `src/shared/app-keyboard-shortcuts.test.ts`, `src/main/drawing-export-*.test.ts`, `src/main/drawing-file-store.test.ts`, `src/shared/drawing-sheet-schema.test.ts`, `src/renderer/design/viewport3d-bounds.test.ts`, and `src/shared/fusion-style-command-catalog.test.ts`.

**Parallel test-only work:** assign **[`docs/agents/STREAM-H-tests-only.md`](agents/STREAM-H-tests-only.md)** (**Stream H**) so coverage expands without colliding on hot production files — declare island **H1–H4** per chat. Use the suite list **above** as a **prioritization map** for Stream H themes (IPC, CAM, assembly, drawing, slicer, viewport, shortcuts, etc.); each Stream H chat should still target **one theme** and **one** `*.test.ts` when possible. For **Aggressive — Stream H** or pre-merge batches, run **`npm run build`** from **`unified-fab-studio/`** in addition to **`npm test`**.

**Design 3D viewport (R3F) only:** assign **[`docs/agents/STREAM-N-design-viewport3d.md`](agents/STREAM-N-design-viewport3d.md)** (**Stream N**) for **`Viewport3D.tsx`**, **`viewport3d-bounds.ts`**, and **`.design-3d*`-scoped** CSS — keep sketch schema / **`Sketch2DCanvas`** / solver with **Stream A** (see [`docs/AGENT_PARALLEL_PLAN.md`](AGENT_PARALLEL_PLAN.md) ownership table).

**Post-batch automated gate + report:** **[`docs/agents/STREAM-M-verifier-smoke.md`](agents/STREAM-M-verifier-smoke.md)** (**Stream M**) — run **`npm test`**, **`npm run build`**, and **`npm run typecheck`**, then summarize **Gates / Drift / Handoffs** in the chat. For a **tracked** drift artifact, **[`docs/agents/STREAM-T-verifier-drift.md`](agents/STREAM-T-verifier-drift.md)** (**Stream T**) maintains **[`docs/agents/VERIFICATION_DRIFT.md`](agents/VERIFICATION_DRIFT.md)** (gates, IPC inventory, typecheck debt, handoffs) → then **Stream G** closes doc targets. See [`docs/agents/PARALLEL_PASTABLES.md`](agents/PARALLEL_PASTABLES.md).

---

## Product / shell (Phase 7)

**Scope:** discoverability and project utilities — not full commercial drawing/inspect parity. Phase **7 baseline** is **done** in [`PARITY_PHASES.md`](PARITY_PHASES.md). **Drawings:** Tier A/B/C mesh projection (optional **`meshProjectionTier`**) when kernel STL + Python succeed — **C** adds BRep section polylines from **`output/kernel-part.step`** when Tier C is selected and STEP loads — see **Drawing export** row below (not certified HLR). **Measure / section:** tessellated kernel STL from STEP export when manifest matches — optional manifest **`stlMeshAngularToleranceDeg`** (payload) is echoed for inspect copy — not live B-rep topology inspect. **Stretch:** certified HLR/sections, true B-rep measure — [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) §Phase 7.

| Step | Check |
|------|--------|
| Command palette | **Ctrl+K** / **⌘K** opens palette; **Esc** closes; **↑/↓**, **Home/End**, **Tab** (wrap), **Enter** to run; optional workspace filter; default can show **implemented** entries only (`ut_command_palette`). |
| Shortcuts doc | **Utilities → Shortcuts** matches [`app-keyboard-shortcuts.ts`](../src/shared/app-keyboard-shortcuts.ts); **Ctrl+Shift+?** / **⌘⇧?** opens that tab when focus is not in a typable field. |
| Footer | Status footer shows dismissible palette tip until cleared (`ufs_shell_discoverability_hint_v1` in `localStorage`). |
| Drawing export | **Utilities → Project** (or palette **`dr_export_pdf`** / **`dr_export_dxf`**) produces PDF (A4 title block) and DXF. With **`drawing/drawing.json`** view slots and **`output/kernel-part.stl`**, exports run **`engines/occt/project_views.py`**: **Tier A** = mesh-edge soup (+ optional **Tier A+ convex hull** when **`includeConvexHull`**). **Tier B** (sheet field **`meshProjectionTier`**, Utilities → Drawing manifest) adds **bbox-center mesh section** polylines per view axis. **Tier C** = B + **BRep plane section** edges from **`output/kernel-part.step`** when CadQuery loads (same center plane idea as B; still **not** full HLR). DXF still prefers **flat-pattern geometry** (outline + `BEND`) when sketch + `sheet_fold` data apply. **Certified HLR** remains stretch — see roadmap Phase 10. |
| Drawing manifest | **Utilities → Project → Drawing manifest**: primary sheet **name**, optional **scale** (e.g. `1:1`), **view placeholders** (base/projected axes + optional per-slot **`layout`** mm box) persist to **`drawing/drawing.json`** and feed export title blocks / projection metadata (`drawing-sheet-schema.ts`). |
| Persistence | **Last workspace** and resizable **Browser / Properties** columns survive reload (`localStorage` keys as implemented in shell). |
| Parameters | Design **Parameters** ribbon + palette **`ut_parameters`**. **Utilities → Project**: **Export parameters to output/** → `output/design-parameters.json`; **Merge parameters from JSON…** accepts `{ "parameters": { … } }` (requires existing `design/sketch.json`). |
| Measure / section | **Design** → **3D preview**: **Measure** + **Shift+click** two points (distance in mm). **Section** + **Y** range slider clips below the plane. The viewport prefers **`output/kernel-part.stl`** when **`part/kernel-manifest.json`** reports **`ok: true`** and the in-app **design + features** hashes still match the manifest (**`designHash`** / **`featuresHash`**); otherwise it falls back to the **sketch preview** mesh and shows a stale hint if a manifest exists. Successful manifests may include **`inspectBackend: kernel_stl_tessellation`** (UI copy stresses tessellated STEP export, not live B-rep). **Esc** clears. IPC: **`design:readKernelManifest`**, **`design:readKernelStlBase64`**. |

---

## Geometry kernel (CadQuery / `cad:kernelBuild`)

**IPC / UI:** **Design** workspace → **Build STEP (kernel)** (saves design, then runs Python). Main entry: `cad:kernelBuild` → [`src/main/cad/build-kernel-part.ts`](../src/main/cad/build-kernel-part.ts) → [`engines/occt/build_part.py`](../engines/occt/build_part.py).

| Step | Check |
|------|--------|
| Environment | **Node 20+**; optional **Python** with **`cadquery`** (`pip install cadquery`). App **Python path** (Design settings) points at that interpreter. |
| Simple extrude | Closed sketch profile → extrude → **Build STEP (kernel)** completes without error. |
| Artifacts | `output/kernel-part.step` and `output/kernel-part.stl` exist under the project. |
| Manifest | `part/kernel-manifest.json` exists; **`payloadVersion`** is `1`–`4` as expected; with **loft**, look for **`loftStrategy`**; with `sheet_flat_pattern`, look for **`flatPatternStrategy`** (see [`GEOMETRY_KERNEL.md`](GEOMETRY_KERNEL.md)). |
| Phase 3 ops | Open [`resources/sample-kernel-solid-ops/`](../resources/sample-kernel-solid-ops/README.md): README lists one **`part/*.example.json`** per shipped **`kernelOps`** kind (swap into `part/features.json`; use **`design/sketch.rect-circle.example.json`** when noted for `profileIndex`). Includes **`pattern_path`** closed-path (`features.pattern-path-closed.example.json`), tangent-follow (`features.pattern-path-tangent.example.json`), **`boolean_combine_profile`** −Z extrude (`features.boolean-combine-profile-minus-z.example.json`), and **`hole_from_profile`** depth variant (`features.hole-from-profile-depth.example.json`). Failed builds may include manifest **`userHint`** (short guidance). **`npm test`** includes **`sample-kernel-solid-ops-examples.test.ts`** (schema parse of every example). Spot-check **Build STEP (kernel)** on a few ops; manifest **`postSolidOpCount`** matches active (non-suppressed) ops. |
| Assembly exports | After **Interference check**, **Save report to project output/** → `output/{assembly}-interference.json`. **Export BOM (tree .txt)** → `output/bom-hierarchical.txt` (indent by `parentId`). |
| Manufacture sim | **Manufacture** tab **Simulation** — **Tier 1** G0/G1 polylines; **Tier 2** coarse 2.5D height-field removal proxy (~**88×88** grid in panel, cylindrical tool stamps along feeds; status line shows cols/rows/cell); optional **Tier 3** experimental voxel carve sample (`cam-voxel-removal-proxy.ts`) with **Fast / Balanced / Detailed** quality presets (grid + stamp budgets scale monotonically **fast → detailed**; choice persists in **localStorage** for this browser). Tier 2–3 caps trade **resolution vs UI responsiveness** — still **not** a certified material-removal or swept-volume model. Tier 3 also uses **nominal stock box Z** (grid toward stock bottom) and **nominal stock XY** when setup defines a box (extends voxel footprint to the stock rectangle). Tier 2–3 are **approximate** only — not collision-safe or kinematics-accurate. With a **4-axis** CNC profile, **Tier 1** maps **X / radial Z / A** into a cylindrical tube preview; **Tier 2–3** removal proxies stay 3-axis-approximate — compare G-code **A** to **`aAxisRangeDeg`** and read **`docs/CAM_4TH_AXIS_REFERENCE.md`**. Load `output/cam.nc` or paste G-code. Utilities → **CAM** **G-code analysis** remains text-only (`mf_simulate` partial). |
| Suppress | In **Design** → **Kernel ops** queue, **Supp.** on a row: op stays in `part/features.json` order but is **not** sent in **`postSolidOps`**; **`postSolidOpCount`** / result should match **active** ops only. |
| Phase 4 | **Loft:** 2–16 closed profiles (entity order), uniform `loftSeparationMm`; kernel uses union of segment lofts (`multi+union-chain:…`). **Sheet:** `sheet_tab_union`, `sheet_fold`, `sheet_flat_pattern` marker. **Path-guided:** `pipe_path` orientation modes and `sweep_profile_path_true` should produce stable orientation-follow results. **Plastic MVP:** `plastic_rule_fillet`, `plastic_boss`, `plastic_lip_groove`. Samples: [`resources/sample-kernel-loft-multi/`](../resources/sample-kernel-loft-multi/README.md), [`resources/sample-kernel-sheet-tab/`](../resources/sample-kernel-sheet-tab/README.md), [`resources/sample-kernel-sheet-fold/`](../resources/sample-kernel-sheet-fold/README.md). |
| Failure mode | If Python or CadQuery is missing, the UI should surface an actionable error (no silent success). |

---

## Project mesh import (`assets:importMesh`)

**Parallel lane:** feature work on routing, formats, `importHistory`, and `engines/mesh` → **[`agents/STREAM-R-import-mesh-tools.md`](agents/STREAM-R-import-mesh-tools.md)** (**Stream R**).

**IPC:** `assets:importMesh` registered in [`src/main/ipc-modeling.ts`](../src/main/ipc-modeling.ts); routing in [`src/main/mesh-import-registry.ts`](../src/main/mesh-import-registry.ts). **`dialog:openFiles`** enables multi-select. **`cad:importStl`** / **`cad:importStep`** use the same registry (return legacy `{ ok, stlPath }` shape; no `importHistory` merge unless the renderer uses **`assetsImportMesh`**).

| Step | Check |
|------|--------|
| Unified dialog | **Utilities → Project → Import 3D model…** accepts STL, STEP/STP, OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE, **FBX** (FBX may need extra trimesh/assimp deps — failures surface as `mesh_import_failed`); **Ctrl/Shift+click** imports several files; duplicate basenames become `name_2.stl`, etc. |
| STL | No Python required; file copies to `assets/`; **Save** persists `meshes` + `importHistory`. |
| STEP | Requires **Python + CadQuery** (same as legacy STEP import); tessellation warning in status / `importHistory`. |
| Mesh formats | Requires **Python + `pip install trimesh`**; failure should surface `trimesh_not_installed` or `mesh_import_failed` clearly. |
| History | After import + **Save**, `project.json` includes new `importHistory[]` entry with `assetRelativePath` and `roundTripLevel`. **Utilities → Project → Recent imports** shows human-readable fidelity labels (Mesh only / Partial / Full), tooltips, and any `warnings[]` lines (e.g. STEP tessellation, trimesh conversion). |

### Tool library — Fusion CSV (`tools:import` / `fusion_csv`)

**Parallel lane:** CSV / gzip / HSM parsers and merge behavior → **[`agents/STREAM-R-import-mesh-tools.md`](agents/STREAM-R-import-mesh-tools.md)** (**Stream R**).

| Step | Check |
|------|--------|
| Paste + import | **Utilities → Tools**: paste a Fusion **library export** CSV (quoted headers), click **Import Fusion CSV**; tools merge into `tools.json` on save path used by **Import** (same as other tool imports). |
| Assumption | Parser assumes diameters are **mm** (metric library). |

### Tool library — file pick (`tools:importFile`)

| Step | Check |
|------|--------|
| File dialog | **Import library file…** accepts `.csv`, `.json`, `.hsmlib`, `.tpgz`, `.xml` (plus **All files**). |
| HSM / XML | Gzipped libraries decode with **`zlib`**; **`Tool`** elements with **`Diameter`** import as **`source: hsm`** when recognized. **Inch** diameters when `unit="inch"` (or similar) should convert to mm. Real `.hsmlib` variants vary — verify counts against the CAM source. |

---

## Utilities → Slice (CuraEngine)

**Parallel lane:** bundled defs and operator docs → **[`agents/STREAM-L-cura-slicer.md`](agents/STREAM-L-cura-slicer.md)** (**Stream L**). Index: [`resources/slicer/README.md`](../resources/slicer/README.md).

**IPC:** preload **`sliceCura`** → **`slice:cura`** in [`src/main/ipc-fabrication.ts`](../src/main/ipc-fabrication.ts); implementation [`src/main/slicer.ts`](../src/main/slicer.ts) (`sliceWithCuraEngine`, `buildCuraSliceArgs`). Default machine definition path when the UI omits **`definitionPath`**: **`resourcesRoot/slicer/creality_k2_plus.def.json`** (see **`src/main/slicer.test.ts`**). Optional override: pass another bundled stub (e.g. **`generic_fdm_250.def.json`**) or a user path.

| Step | Check |
|------|--------|
| Paths | **Utilities → Settings → Paths**: **CuraEngine** binary, **definitions folder** (directory that contains **`fdmprinter.def.json`**), and optional **machine definition (-j)** path (`curaMachineDefinitionPath`) to override the bundled **`creality_k2_plus.def.json`**. Same Cura major version for engine and definitions. |
| Search path | **`CURA_ENGINE_SEARCH_PATH`** is **not** the repo’s **`resources/slicer/`** folder — it must be Cura’s **`definitions`** root; bundled **`.def.json`** files are passed with **`-j`** (see [`resources/slicer/README.md`](../resources/slicer/README.md) § *Bundled defs vs Cura’s definitions folder*). |
| Slice | **Utilities → Slice** with a valid STL: subprocess returns success or a clear stderr; output G-code path is writable. After success, the Slice tab shows a **layer summary** from Cura-style `;LAYER` / `;LAYER_COUNT` comments (`fdm-gcode-layer-summary.ts`). |
| CLI defaults | Named presets (`balanced` / `draft` / `fine`) in [`cura-slice-defaults.ts`](../src/shared/cura-slice-defaults.ts) merge with optional **extra settings JSON** and **named profiles** (`mergeCuraSliceInvocationSettings`) into [`buildCuraSliceArgsFromSettingsMap`](../src/main/slicer.ts); persisted in app settings (`curaSlicePreset`, `curaEngineExtraSettingsJson`, `curaSliceProfilesJson`, `curaActiveSliceProfileId`). Slice tab shows an effective `-s` preview. **`fdm_slice`** in Manufacture can run the same pipeline via **Slice with CuraEngine** (uses `sourceMesh`). |
| Safety | Treat G-code as **unverified** until temperatures, limits, and start/end scripts match your printer ([`MACHINES.md`](MACHINES.md)). |

---

## CAM / manufacture (`cam:run`)

**IPC:** `cam:run` in [`src/main/index.ts`](../src/main/index.ts); strategy selection uses [`engines/cam/ocl_toolpath.py`](../engines/cam/ocl_toolpath.py) when **`opencamlib`** is importable, else built-in parallel finish from mesh bounds ([`src/main/cam-local.ts`](../src/main/cam-local.ts)).

**Reference:** OpenCAMLib **exit codes**, stdout JSON shape, and **builtin fallback** behavior (parallel finish from STL bounds; mesh raster caveats) are documented in [`engines/cam/README.md`](../engines/cam/README.md) — pair with [`src/main/cam-runner.ts`](../src/main/cam-runner.ts) for operator **`hint`** strings.

| Step | Check |
|------|--------|
| UI | **Make** workspace: **Generate CAM** uses the **first non-suppressed CNC operation** in `manufacture.json` for tool diameter resolution and related hints (see on-screen copy in `ManufactureWorkspace.tsx`). |
| OpenCAMLib | With **`pip install opencamlib`**: **`cnc_waterline`** / **`cnc_adaptive`** should prefer OCL **Waterline** / **AdaptiveWaterline**; response may still include **hints** if something falls back. Without OCL, expect **parallel-finish** behavior and hint text. |
| Raster intent | **`cnc_raster`**: **OpenCAMLib** `PathDropCutter` raster when OCL is available, else **built-in 2.5D mesh height-field** raster / orthogonal fallback — see [`PARITY_PHASES.md`](PARITY_PHASES.md) and hints in CAM IPC/UI. **`cam:run`** may pass **`stockBoxZMm`** / **`stockBoxXMm`** / **`stockBoxYMm`** from Shop or Manufacture so the runner can derive **effective raster rest** from stock + mesh min Z when **`rasterRestStockMm`** is unset (opt out with **`autoRasterRestFromSetup: false`** on the op). |
| Pencil intent | **`cnc_pencil`**: same OCL/built-in **raster** stack with **tighter effective stepover** (`resolvePencilStepoverMm` from op `params`); see Manufacture hints and `cam-runner.ts`. |
| STL before 3D CAM | For **`cnc_parallel`** / waterline / adaptive / raster, main loads the staged STL once: **missing file**, **empty**, **ASCII**, or **corrupt binary** returns **`cam:run`** **`error` + `hint`** before OpenCAMLib runs (see [`src/main/cam-runner.ts`](../src/main/cam-runner.ts) `readStlBufferForCam`). |
| Hints (parallel + OCL fallback) | **`cnc_parallel`** success includes **`hint`** (built-in parallel finish from STL bounds + unverified copy). When OpenCAMLib fails for **`cnc_waterline`** / **`cnc_adaptive`** / **`cnc_raster`**, fallback hint text plus normalized fallback reason are returned to the renderer. |
| Work volume hint | On successful **`cam:run`** for CNC profiles, **`hint`** may append a **machine work volume** warning when parsed posted G-code exceeds profile **`workAreaMm`** (assumes WCS origin at machine corner — confirm against your fixture; see **`docs/MACHINES.md`**). **4-axis** success may also append a **large A travel** reminder when parsed **`A`** span is very large. |
| Finish / rest params | **`cnc_3d_finish`**: optional **`finishScallopMm`** / **`finishScallopMode`** resolve effective finish stepover (`cam-scallop-stepover.ts`). **`cnc_raster`** / **`cnc_pencil`** / mesh fallback: optional **`rasterRestStockMm`** offsets the built-in height-field (`cam-local.ts`). Optional **`meshAnalyticPriorRoughStockMm`** applies **only when `usePriorPostedGcodeRest` is not** supplying a G-code floor — simulates a prior rough stock height for mesh-raster skip logic vs finish rest (2.5D heuristic). |
| Material presets | **`calcCutParams`** (`material-schema.ts`) floors **feed** and **plunge** to **≥ 1 mm/min** so library values cannot sit below CAM guardrail minimums before pipeline clamping. |
| CAM tab (Utilities) | On successful **Generate toolpath…**, **Last run** shows engine outcome details (OpenCAMLib vs built-in fallback + reason) plus optional success **`hint`** above the G-code **pre**; status line repeats the same context. **Preview G-code analysis** is text-only stats (not machine simulation). |
| Lathe planning row | **`cnc_lathe_turn`** in **`manufacture.json`** parses for roadmaps; **Generate CAM** returns a clear block (use external lathe CAM until runner + posts ship — `docs/MACHINES.md`). |
| Contour / pocket / drill | **`cnc_contour`**, **`cnc_pocket`**, **`cnc_drill`** use built-in 2D geometry paths (`contourPoints` / `drillPoints`) with machine-aware drill behavior; missing/invalid geometry should return an error hint (no STL parallel fallback). |
| Drill success hints | On successful **`cnc_drill`**, merged **`hint`** includes cycle selection copy plus **retract** (R uses **`safeZMm`** when **`retractMm`** unset) and **depth** (Z from **`zPassMm`**). |
| 2D failure copy | On **`cam:run`** failure, IPC may include **`hint`** (e.g. bad `contourPoints`, empty pocket toolpath). **Make** tab shows **error + hint** in the G-code output panel. |
| Pocket geometry validity | For a pocket op, clear `contourPoints` or provide malformed points JSON, then run **Generate CAM**: verify CAM returns a geometry-required error and does not emit fallback toolpaths. |
| Ramp guardrails (`rampMaxAngleDeg`) | For pocket ops with `entryMode = ramp`, verify hints: (a) when spans permit, a hint about XY run lengthening to respect `rampMaxAngleDeg`; (b) when spans are too short, a hint that some entries may be steeper than the configured limit. |
| Params | Op **`params`** (and **tool** fields) feed **`zPassMm`**, **`stepoverMm`**, **`feedMmMin`**, **`plungeMmMin`**, **`safeZMm`**, optional **`workCoordinateIndex`** (G54–G59 in [`resources/posts/cnc_generic_mm.hbs`](../resources/posts/cnc_generic_mm.hbs)) — defaults in [`src/shared/cam-cut-params.ts`](../src/shared/cam-cut-params.ts). When manufacture **setup stock** has a **Z height**, **`resolveCamCutParams`** can default **`safeZMm`** if the op omits it. Feed/plunge floors align with **`cam-numeric-floors.ts`** / guardrails (**≥ 1 mm/min**). |
| Output | G-code written to the path the UI chooses (typically under project **`output/`**). Open the file and spot-check headers, units, and retract height against your machine profile. |
| Safety | Treat all output as **unverified** until you follow [`MACHINES.md`](MACHINES.md) (air cut, controller dialect, WCS). |
| Shop setup sheet | **Shop → Generate Setup Sheet**: HTML includes **rotary stock** (cylinder Ø/length, chuck depth, clamp offset) for **4-/5-axis** machine sessions, a **CAM guardrails** note (work-volume hints, unverified G-code), per-operation **finish scallop** / **raster rest** lines when those params are set, and the existing **tool list** + G-code stats when the output file is readable. |
| Manufacture setup sheet | **Manufacture** auxiliary panel **Export setup sheet**: writes **`output/<name>_setup_sheet.html`** from **`buildSetupSheetJobFromManufacture`** (resolved manufacture setup/stock + ops) and opens it — same HTML family as Shop (guardrails, tool list when G-code is readable). |

---

## Assembly mesh + interference (`assembly:interferenceCheck`)

**Schema / behavior:** v2 `assembly.json` supports optional per-component **`meshPath`** (binary STL, path **inside the project**, resolved safely in main — see [`src/main/assembly-mesh-interference.ts`](../src/main/assembly-mesh-interference.ts)); the renderer runs **`meshPathLintIssues`** for portable relative paths. Assembly now supports migrated solver-oriented **`jointState`** / **`jointLimits`** (legacy preview fields remain accepted). **`explodeView`** / **`motionStudy`** still drive viewport presentation controls (explode slider + keyframe scrub). IPC **`assembly:readStlBase64`** loads STL for the viewport and BOM **Thumb** raster (renderer-side; **no** separate `assembly:readStlThumbnail` IPC unless profiling shows main-process offload is required). **Export BOM** includes a **`meshPath`** column (`assembly:exportBom`).

| Step | Check |
|------|--------|
| STL assets | Place binary STL under the project (e.g. **`assets/`**). Set **`meshPath`** on overlapping components to a **project-relative** path that resolves (no `..` escapes). |
| 3D preview | **Assembly** tab → meshes appear when paths resolve; **explode** slider (if `explodeView` exists) separates along +X/+Y/+Z by row index × `stepMm`; **motion** scrub/play when `keyframesJson` has ≥2 `{ "t", "rzDeg" }` samples (preview +Y rotation of the **whole assembly** after per-row joint previews). **Revolute** / **slider** / **universal** / **cylindrical** rows: optional preview fields in [`assembly-schema.ts`](../src/shared/assembly-schema.ts) (`revolutePreview*`, `sliderPreview*`, `universalPreview*`, `cylindricalPreview*`) — viewport stubs only; joint transforms apply **before** motion-study rotation. |
| UI | **Assembly** workspace → run **interference** (invokes **`assembly:interferenceCheck`**). After a run, **Export report JSON** downloads the last report; **Save report to output/** writes `output/{assembly}-interference.json`. |
| Report | Read **Last interference report**: assembly stats, **`meshWarnings`** if paths invalid; **`meshResolvedCount`** when meshes load; **`meshAabbOverlapPairs`** (broad phase); **`narrowPhaseOverlapPairs`** / **`triangleStubPairs`** / notes when narrow phase runs; **`conflictingPairs`** per **`AssemblyInterferenceReport`** in [`assembly-schema.ts`](../src/shared/assembly-schema.ts) (AABB overlaps omitted when narrow phase completes with no triangle hit; see also phase **5** in [`PARITY_PHASES.md`](PARITY_PHASES.md)). Use **`assembly:interferenceCheckSimulated`** to run interference on solved kinematic transforms for the passed assembly payload. |
| No meshes | With **no** usable **`meshPath`**, the report should state that placement / AABB heuristics only apply — not triangle-accurate contact. |
| BOM | **Export BOM** → `output/bom.csv` includes **`meshPath`**, optional **`bomUnit` / `bomVendor` / `bomCostEach`**, **`linkedInstanceId`** / **`motionLinkKind`** (motion-link stub), **`instanceId`**, and other assembly row fields (see `ASSEMBLY_BOM_CSV_HEADER` in `assembly-schema.ts`). **Assembly** tab BOM **preview** table includes a **Thumb** column (lazy 48×48 raster from `meshPath` STL when the path resolves — not written to CSV). **Export BOM (tree .txt)** → `output/bom-hierarchical.txt` (optional PN/ref/ext/note/unit/vendor/cost + link stub suffixes per line). **Export BOM (tree .json)** → `output/bom-hierarchy.json` (active rows, nested `children`, nodes include reference/BOM metadata). |
| Summary | **`assembly:summary`** (command catalog / IPC) remains a **structural** BOM/joint summary (ref tags, **externalComponentRef** tallies, **BOM-notes** row count, explode/motion flags when present) — it does **not** replace the interference check. |

---

## Cross-links

- **Maintaining docs (Stream G):** [`agents/STREAM-G-docs-only.md`](agents/STREAM-G-docs-only.md), pasteables in [`agents/PARALLEL_PASTABLES.md`](agents/PARALLEL_PASTABLES.md) → *Stream G* / *Aggressive — Stream G*  
- **Mesh / tool library import (Stream R):** [`agents/STREAM-R-import-mesh-tools.md`](agents/STREAM-R-import-mesh-tools.md), pasteables → *Aggressive — Stream R*  
- **Slicer / CuraEngine stubs (Stream L):** [`agents/STREAM-L-cura-slicer.md`](agents/STREAM-L-cura-slicer.md), [`resources/slicer/README.md`](../resources/slicer/README.md), pasteables → *Stream L* / *Aggressive — Stream L* in [`agents/PARALLEL_PASTABLES.md`](agents/PARALLEL_PASTABLES.md)  
- Phase status table: [`PARITY_PHASES.md`](PARITY_PHASES.md)  
- Product / shell stretch backlog: [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) §Phase 7  
- Kernel strategy: [`GEOMETRY_KERNEL.md`](GEOMETRY_KERNEL.md)  
- Machine / post safety: [`MACHINES.md`](MACHINES.md)  
- Command coverage vs UI: [`FUSION_COMMAND_PARITY.md`](FUSION_COMMAND_PARITY.md)  
- Shortcut chords (source of truth): [`app-keyboard-shortcuts.ts`](../src/shared/app-keyboard-shortcuts.ts), [`KEYBOARD_SHORTCUTS.md`](KEYBOARD_SHORTCUTS.md)

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **`ipc-contract.test.ts` fails** | [`src/preload/index.ts`](../src/preload/index.ts) exposed `invoke` names vs `ipcMain.handle` in non-test `src/main/**/*.ts` (e.g. [`ipc-core.ts`](../src/main/ipc-core.ts), [`ipc-modeling.ts`](../src/main/ipc-modeling.ts), [`ipc-fabrication.ts`](../src/main/ipc-fabrication.ts)) — fix in one PR. Prefer a single **Stream S** batch: [`agents/STREAM-S-ipc-integration.md`](agents/STREAM-S-ipc-integration.md). |
| **Kernel build: Python / import errors** | Design settings → Python executable; `cadquery` installed in **that** env; project saved so the build reads current `design/` + `part/`. |
| **CAM never uses OpenCAMLib** | In the **same** interpreter the app runs for CAM, run `python -c "import opencamlib"`. If that fails, waterline / adaptive / raster use built-in paths (see [`PARITY_PHASES.md`](PARITY_PHASES.md)). |
| **Interference stays AABB-only** | Per-instance **`meshPath`** must resolve to a **project-relative** binary STL (no `..` escapes). See the mesh table above. |
| **BOM CSV missing `meshPath` column** | Regenerate export with a current build; column is part of v2 assembly export behavior. |
| **OBJ/PLY/… import fails (`trimesh_not_installed` / `mesh_import_failed`)** | Set **Python** in app settings; `pip install trimesh` in **that** env. Pipeline: [`engines/mesh/mesh_to_stl.py`](../engines/mesh/mesh_to_stl.py) — see [`engines/mesh/README.md`](../engines/mesh/README.md). Parallel work: [`agents/STREAM-R-import-mesh-tools.md`](agents/STREAM-R-import-mesh-tools.md). |
| **Fusion CSV / tool file import oddities** | Parsers live in [`src/main/tools-import.ts`](../src/main/tools-import.ts); diameters assumed **mm** unless HSM inch conversion applies — see tables above. |
