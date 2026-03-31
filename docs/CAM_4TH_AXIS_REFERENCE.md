# 4-axis rotary milling — technical reference

This document is the **single source of truth** for how Unified Fab Studio generates **4-axis (A-rotary)** toolpaths, which parameters mean what, and how to debug failures. Operator safety and machine-specific behavior remain in **[`MACHINES.md`](MACHINES.md)**.

## Roadmap phases (engineering)

| Phase | Topic |
|-------|--------|
| **0** | Foundation: correct driving operation, live manufacture plan, param parity, tests |
| **1** | WCS / mesh alignment — STL coordinates match setup stock |
| **2** | Full strategies: cylindrical mesh raster, parallel, contour wrap, finishing hooks |
| **3** | Rotary roughing / silhouette-style passes and rest hints |
| **4** | Contour sources from Design → `contourPoints` |
| **5** | Posts and kinematics (safe retract, axis mapping) |
| **6** | Simulation with A and rotary envelope warnings |
| **7** | Verification and parity docs |

## Target kinematics (Carvera-style)

The built-in engine assumes:

- **Rotation axis:** A rotates around **machine X** (bar stock along **+X**).
- **Program words:** Moves use **X** (along the bar), **Z** (radial distance from the **stock centerline** in the YZ plane), and **A** (degrees). **Y** is usually omitted (0) in posted output for this dialect.
- **Cut depth:** `cutZ = cylinderRadiusMm + zPassMm` with **negative** `zPassMm` = into material (toward the axis). Positive `zPassMm` from shared CAM defaults is **normalized** to negative depth in the runner.

This is **not** the same convention as 3-axis mesh ops in the same app (Z0 = top of stock, cuts negative in −Z). Always verify **WCS** on the machine.

## End-to-end pipeline

1. **Renderer:** Shop [`ShopApp.tsx`](../src/renderer/src/ShopApp.tsx) or Manufacture [`App.tsx`](../src/renderer/src/App.tsx) calls `cam:run` with `operationKind`, `operationParams`, optional **rotary stock** fields, and optional **`useMeshMachinableXClamp`**.
2. **IPC:** [`ipc-fabrication.ts`](../src/main/ipc-fabrication.ts) loads the machine profile and calls [`runCamPipeline`](../src/main/cam-runner.ts).
3. **4-axis branch:** For `cnc_4axis_roughing` / `cnc_4axis_finishing` / `cnc_4axis_contour` / `cnc_4axis_indexed`, the runner may:
   - Validate **contour** mode (requires `contourPoints`).
   - Build **mesh-informed** bounds (optional STL X clamp, radial max for Z bands).
   - For **roughing / finishing**, run the **TS cylindrical heightmap engine** (`cam-axis4-cylindrical-raster.ts`) when STL is available; fall back to Python **parallel** path otherwise.
   - For **contour / indexed**, write `*-axis4-cfg.json` and run [`engines/cam/axis4_toolpath.py`](../engines/cam/axis4_toolpath.py).
4. **Post:** [`resources/posts/cnc_4axis_grbl.hbs`](../resources/posts/cnc_4axis_grbl.hbs) wraps `toolpathLines` with units, WCS line, spindle, and safe retract comments.

## Parameter matrix

| UI / JSON | `cam:run` / `CamJobConfig` | Python / engine | Effect |
|-----------|----------------------------|-----------------|--------|
| Stock **X** (box) | `rotaryStockLengthMm` | `cylinderLengthMm`, `stockLengthMm` | Bar length along X |
| Stock **Y** (box) | `rotaryStockDiameterMm` | `cylinderDiameterMm` | Outer diameter |
| Setup **rotaryChuckDepthMm** / **rotaryClampOffsetMm** | `rotaryChuckDepthMm`, `rotaryClampOffsetMm` | `chuckDepthMm`, `clampOffsetMm` | Machinable X start (in-chuck + buffer) |
| `cylinderLengthMm` / `cylinderDiameterMm` in op | (fallback if no stock) | same | Overrides when rotary stock not sent |
| `zPassMm`, `zStepMm`, `stepoverMm` | job cut params | `zPassMm`, `zStepMm`, `stepoverDeg` | Radial depth, roughing steps, angular / mm stepover |
| `wrapMode` | `operationParams` | `wrapMode` | `parallel`, `raster` (mesh TS + Py fallback), `contour`, `silhouette_rough` |
| `wrapAxis` | `operationParams` | `aAxisOrientation` | Overrides machine profile when `x` or `y` |
| `axialBandCount` | `operationParams` | `axialBandCount` | User override (1–24); else auto from mesh span |
| `contourPoints` | `operationParams` | `contourPoints` | Required for `contour` |
| `indexAnglesDeg` | `operationParams` | `indexAnglesDeg` | Indexed faces |
| `useMeshRadialZBands` | `operationParams` | `useMeshRadialZBands` + `meshRadialMaxMm` | Mesh-informed Z depth steps |
| `useMeshMachinableXClamp` | `cam:run` / op param | mesh X min/max omitted when false | Avoid empty span when STL WCS ≠ stock |
| `rotaryFinishAllowanceMm` | `operationParams` | finishing / raster offset | Optional stock on radial hits (TS raster) |
| `cylindricalRasterMaxCells` | `operationParams` | TS raster only | Cap grid size (performance) |

## Manufacture vs Shop

| | Shop | Manufacture |
|---|------|-------------|
| Stock L/D | Job stock X/Y | Setup stock via `rotaryDimsFromSetupStock` |
| Chuck / clamp | Job fields | Setup `rotaryChuckDepthMm`, `rotaryClampOffsetMm` |
| Driving op | Per operation in loop | **Selected** CNC op (fallback: first runnable `cnc_*`) |
| Plan snapshot | N/A | **Live** `mfg` passed into Generate CAM (not only saved disk) |
| `useMeshMachinableXClamp` / `usePriorPostedGcodeRest` | **4-axis:** `cam:run` sends **`useMeshMachinableXClamp: true` only** when the op sets it; otherwise **`false`** so roughing uses full machinable X (stock − chuck/clamp), not STL bbox X. Prior G-code from job `outPath` when `usePriorPostedGcodeRest` is true. | **Generate CAM** reads `output/cam.nc` when `usePriorPostedGcodeRest`; clamp follows op / Manufacture UI (default on unless turned off). |

## Failure catalog

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `invalid_machinable_span` | Chuck + mesh X clamp leave empty interval | Disable **Clamp toolpath X to STL** or fix STL WCS / stock length |
| `invalid_contour_points` | Contour mode without ≥2 points | Add `contourPoints` or pick a design contour |
| `axisCount` error | 3-axis machine profile | Select a **4-axis** profile (e.g. Makera Carvera 4th axis) |
| Empty toolpath | Zero-length machinable span or bad diameters | Check diameter, length, chuck values |
| Toolpath “in air” / no roughing on the mesh | STL **max distance from X axis** (bbox) **>** job **cylinder radius** | CAM always uses **job rotary stock Ø** for the cylinder model. **Increase stock Ø** (≥ ~`2 × meshRadialMax` from the hint) or **rescale/reorient** the STL so geometry lies inside that cylinder. |
| Python spawn error | Missing / wrong `python` path | Settings → Paths |
| Cuts in air / wrong depth | WCS or diameter mismatch | [`MACHINES.md`](MACHINES.md) checklist, measure stock |

## WCS alignment (Phase 1)

Mesh **bounding box** in STL space must align with **setup stock** along X and with the **rotation axis** through YZ origin. If the mesh is **centered** in CAD but stock zero is the **left face**, enable placement transform or export STLs in setup coordinates. When unsure, turn off **STL X clamp** for 4-axis and rely on stock length only.

## Simulation

**Tier 1–3** previews approximate material removal. **A-axis rotation** may be shown as **combined tool motion** for grbl_4axis programs; this is **not** a certified swept-volume or collision solver — see [`VERIFICATION.md`](VERIFICATION.md).

**Shop 4-axis preview:** The amber stock cylinder uses **job stock Ø**. Toolpaths are generated for that same nominal cylinder; if the STL is larger radially than stock Ø, paths stay inside the cylinder and the success **hint** explains the mismatch.

## Related files

- [`engines/cam/axis4_toolpath.py`](../engines/cam/axis4_toolpath.py) — Python strategies
- [`src/main/cam-runner.ts`](../src/main/cam-runner.ts) — orchestration, TS cylindrical raster
- [`src/main/cam-axis4-cylindrical-raster.ts`](../src/main/cam-axis4-cylindrical-raster.ts) — mesh sampling (raster mode); radial DOC uses **r_ref = max(stock R, mesh hit r)** so recessed meshes still rough to the programmed cylinder OD (same convention as parallel `R + zPass`).
- [`src/shared/manufacture-cam-driving-op.ts`](../src/shared/manufacture-cam-driving-op.ts) — which Manufacture op drives CAM
- [`resources/posts/cnc_4axis_grbl.hbs`](../resources/posts/cnc_4axis_grbl.hbs) — post template
