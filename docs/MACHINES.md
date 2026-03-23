# Machine profiles and post-processors

This document records how **Unified Fab Studio** maps software settings to **safe, machine-specific G-code**. You must verify outputs with **air cuts** and **single-axis jog tests** before production runs.

**Bundled profiles and posts** ship under [`resources/`](../resources/README.md): machine JSON and Handlebars templates are indexed in [`resources/machines/README.md`](../resources/machines/README.md) and [`resources/posts/README.md`](../resources/posts/README.md). **Parallel agent lanes:** **Stream F** (all `resources/`), **Stream K** (posts + machines only), **Stream L** (slicer stubs only) — see [`docs/agents/STREAM-F-resources-only.md`](agents/STREAM-F-resources-only.md) and [`docs/agents/STREAM-L-cura-slicer.md`](agents/STREAM-L-cura-slicer.md).

## Laguna Swift 5×10 (CNC router)

### Controller identification (required)

Laguna ships machines with different **motion controllers**. The G-code dialect (units, spindle commands, tool change, canned cycles) depends on the controller, not only the machine frame.

| Common option | Typical G-code traits | Notes |
|---------------|----------------------|--------|
| **Mach3 / Mach4** | `G20`/`G21`, `M3`/`M5`, often inch or mm per profile | Many posts emit **line numbers** or **subroutines**; verify your Mach version. |
| **Masso** | Similar to generic LinuxCNC-style; confirm **spindle CW/CCW** and **coolant** M-codes in Masso docs | Soft limits may be enforced in controller—match workspace in profile JSON. |
| **Buildbotics** | Often Grbl-like extended dialect | Check **feed rate** and **arc** support (`G2`/`G3`). |

**Action:** Open your controller UI or manual and note:

1. **Units**: inch (`G20`) vs mm (`G21`) at power-on.
2. **Spindle**: `M3 S####` (RPM) vs `M3` + analog, vs required `M4`/`M5` sequence.
3. **Work coordinate system**: `G54` default or multiple fixtures.
4. **Safe Z**: clearance height above material and above clamps.

### Sample “safe” header (mm, generic 3-axis)

Use only after confirming codes match your controller. Replace bracketed values.

```gcode
; Laguna Swift — verify controller before running
G21          ; millimeters
G90          ; absolute positioning
G17          ; XY plane
G0 Z25       ; safe Z [mm] — set above your clamps
G0 X0 Y0     ; move to XY start — adjust to your WCS
```

### Sample “safe” footer

```gcode
M5           ; spindle off
G0 Z25       ; retract
G0 X0 Y0     ; park — change to your safe park position
M30          ; program end (if supported) or use %
```

### App integration

Post-processors live under `resources/posts/` as **Handlebars** templates. Machine JSON binds:

- `{{machine.workAreaMm}}` — envelope from profile
- `{{toolpathLines}}` — generated moves (block per line)
- `{{spindleOn}}` / `{{spindleOff}}` — per-dialect snippets from `dialect` in profile

The stock **`cnc_generic_mm.hbs`** template emits **comment-only safety reminders** (unverified output, dry-run guidance, WCS/units notes). It does **not** insert automatic safe-Z rapids — those values are machine- and fixture-specific; add them in the template or in your CAM prep only after you know clearance heights.

Edit `resources/machines/laguna-swift-5x10.json` to match your controller’s M-codes and safe heights.

### Generic 3-axis stub (`generic-3axis`)

Kernel samples ship with **`activeMachineId`: `generic-3axis`**, defined in **`resources/machines/generic-3axis.json`**. It is a **placeholder envelope** (200×200×100 mm, `generic_mm` dialect) so projects load without pointing at a specific OEM machine. **Duplicate and rename** this file for your router/mill, then tighten `workAreaMm`, `maxFeedMmMin`, and `dialect` to match the controller.

### Sample project (assembly + CAM + kernel)

**`resources/sample-assembly-cam-kernel/`** includes `project.json`, `assembly.json`, `manufacture.json`, and the same kernel sketch/features pattern as `sample-kernel-solid-ops`. Use it to validate assembly and manufacture JSON in the app; point `manufacture.json` at a real **`assets/part.stl`** before expecting CAM to run.

---

## Drilling (2D `cnc_drill` in Manufacture)

The app can emit **expanded** moves (`G0`/`G1`) or **canned cycles** (`G81` / `G82` / `G83`) depending on the machine **dialect** and operation **params** (`drillCycle`, `peckMm`, `dwellMs`, `retractMm`). Depth is **`zPassMm`** (hole bottom); **R** is the retract plane (`retractMm` or `safeZMm` when unset).

| Dialect / behavior | Default cycle | Notes |
|--------------------|---------------|--------|
| **`grbl`** | Expanded `G0`/`G1` | Many Grbl builds do not implement `G81`–`G83`; the app defaults here unless you explicitly override **Drill cycle** on the operation. |
| **`mach3`** (Mach-class) | `G81` / auto `G82`/`G83` | With **Peck Q** set, the post tends toward **G83**; with **Dwell P** toward **G82**. Confirm **P** units (seconds vs ms) and **Q** peck depth in your Mach post manual. |
| **`generic_mm`** / other CNC | `G81` + overrides | Same param keys; verify **R**, **Q**, **P** on your control before production. |

**Peck / dwell:** **G83** requires a positive **`peckMm`** (incremental peck). **G82** requires positive **`dwellMs`** in the app; the value is emitted as **P** on the block — **your controller may expect seconds**, not milliseconds. Adjust in the operation or edit G-code after posting.

Always cancel canned cycles on the machine if your program is interrupted mid-cycle (`G80` is emitted at the end of drill sections when cycles are used).

---

## Manufacture tab — CAM simulation (preview only)

The **Simulation** panel on **Manufacture** parses posted **G-code** (`G0`/`G1`) for a **Tier 1** toolpath overlay. Optional **Tier 2** uses a coarse **2.5D height-field** (tool radius stamped along shallow feeds). Optional **Tier 3** shows an experimental **voxel** carve sample (sphere stamps; capped grid size).

**None of these tiers** model your real machine kinematics, spindle/holder geometry, or controller lookahead. They are **not** a substitute for **air cuts**, **dry runs**, or verifying **post output** on the control. Treat them like a quick sanity check only. See [`VERIFICATION.md`](VERIFICATION.md) (Manufacture sim) and `src/shared/cam-voxel-removal-proxy.ts` for implementation limits.

**`cnc_pencil`** (tight raster / cleanup intent) still emits **unverified** G-code like every other CAM op — the in-app preview does not certify clearance or stock remaining.

---

## Creality K2 Plus (FDM)

- Use **machine profile** `creality-k2-plus` for bed size and naming; slicing is delegated to **CuraEngine**. The repo bundles a **definition stub** under [`resources/slicer/`](../resources/slicer/) (`creality_k2_plus.def.json`); CuraEngine still needs your install’s **`fdmprinter`** chain on disk.
- In **Utilities → Settings → Paths**, set **CuraEngine.exe** and the **Cura definitions folder** (the directory that contains `fdmprinter.def.json`). The app passes that folder as `CURA_ENGINE_SEARCH_PATH` when spawning CuraEngine. Windows examples and verification steps: [`resources/slicer/README.md`](../resources/slicer/README.md).
- Always verify **start G-code** (purge, mesh, Z offset) in the slicer definition matches your firmware.

---

## Makera desktop CNC

- Envelope and max feed/accel are conservative defaults in **`resources/machines/makera-desktop.json`** — align with **Makera CAM** or manufacturer specs.
- Many small routers use **Grbl**-compatible dialect; confirm in Makera documentation if `M3`/`M4`/`G21` differ.

---

## Regression testing

Before trusting output:

1. **Dry run**: spindle off, Z high, feed reduced.
2. **First cut**: soft material, shallow depth.
3. Compare a short program against a **known-good** file from your current CAM for the same controller.

For **app-level** CAM checks (OpenCAMLib vs fallback, op kinds, `manufacture.json` params → post, Manufacture simulation tiers), see the **CAM / manufacture** and **Manufacture sim** rows in [`VERIFICATION.md`](VERIFICATION.md).
