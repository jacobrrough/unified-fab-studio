# Machine profiles and post-processors

This document records how **Unified Fab Studio** maps software settings to **safe, machine-specific G-code**. You must verify outputs with **air cuts** and **single-axis jog tests** before production runs.

**Bundled profiles and posts** ship under [`resources/`](../resources/README.md): machine JSON and Handlebars templates are indexed in [`resources/machines/README.md`](../resources/machines/README.md) and [`resources/posts/README.md`](../resources/posts/README.md). **Parallel agent lanes:** **Stream F** (all `resources/`), **Stream K** (posts + machines only), **Stream L** (slicer stubs only) — see [`docs/agents/STREAM-F-resources-only.md`](agents/STREAM-F-resources-only.md) and [`docs/agents/STREAM-L-cura-slicer.md`](agents/STREAM-L-cura-slicer.md).

## Lathe / turning (planning only)

Manufacture operations may use **`cnc_lathe_turn`** in `manufacture.json` for roadmaps and UI, but **Generate CAM** does not post lathe cycles yet. Use external CAM with a lathe-capable post until runner + `resources/posts/` lathe templates ship.

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

The stock **`cnc_generic_mm.hbs`** template emits **comment-only safety reminders** (unverified output, dry-run guidance, WCS/units, tool-change assumptions). It does **not** insert automatic safe-Z rapids — those values are machine- and fixture-specific; add them in the template or in your CAM prep only after you know clearance heights.

Edit `resources/machines/laguna-swift-5x10.json` to match your controller’s M-codes and safe heights.

### Generic 3-axis stub (`generic-3axis`)

Kernel samples ship with **`activeMachineId`: `generic-3axis`**, defined in **`resources/machines/generic-3axis.json`**. It is a **placeholder envelope** (200×200×100 mm, `generic_mm` dialect) so projects load without pointing at a specific OEM machine. **Duplicate and rename** this file for your router/mill, then tighten `workAreaMm`, `maxFeedMmMin`, and `dialect` to match the controller.

### Bundled benchtop CNC stubs

Two additional **stub** profiles ship for small benchtop routers — **not** collision-checked or feed-verified:

- **`resources/machines/benchtop-grbl-300.json`** — `benchtop-grbl-300`, Grbl-class dialect. Confirm real travel, `G21` at power-on, and spindle/coolant M-codes before running.
- **`resources/machines/benchtop-mach3-350.json`** — `benchtop-mach3-350`, Mach3-class dialect. Confirm travel, feeds, and spindle/coolant blocks against your controller manual.

Both use the stock post **`resources/posts/cnc_generic_mm.hbs`**. Treat output as **unverified** until you dry-run and compare to a known-good program for your machine.

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

### Network push (Moonraker)

The K2 Plus runs **Klipper** with **Moonraker** for remote control. The app can push G-code and optionally start the print without touching a USB stick:

1. Find the printer’s IP (LCD → Info, or your router’s DHCP table). Write it down — `http://192.168.x.x` or `http://k2plus.local`.
2. In the **Manufacture** tab, after slicing succeeds, click **Send to Printer…** and enter the Moonraker URL.
3. Toggle **Start print after upload** if you want the job to begin immediately.
4. The IPC channel `moonraker:push` uploads to `/server/files/upload` then calls `/printer/print/start`.
5. **Status polling**: `moonraker:status` reads `/printer/objects/query?print_stats` — state, filename, and progress percentage are returned.
6. **Cancel**: `moonraker:cancel` calls `/printer/print/cancel`.

**Troubleshooting Moonraker push:**

| Symptom | Check |
|---------|-------|
| "Could not connect to printer" | Printer and PC on same network segment; K2 Plus WiFi connected; URL correct (no trailing `/`). |
| HTTP 401 Unauthorized | Add an API key in `moonraker.conf`; the app does not yet pass an API key automatically — use a trusted network or add key support in `moonraker-push.ts`. |
| File uploads but print won’t start | Check virtual SD card path — some setups prefix `gcodes/`. Try `uploadPath: "gcodes"` in the payload. |
| Slow upload on large `.gcode` | Normal — 200 MB+ sliced files take 30–90 s over WiFi. Use Ethernet or reduce print quality for faster testing. |

---

## Makera Carvera (3-axis desktop)

- Envelope and max feed/accel are conservative defaults in **`resources/machines/makera-desktop.json`** — align with **Makera CAM** or manufacturer specs.
- Many small routers use **Grbl**-compatible dialect; confirm in Makera documentation if `M3`/`M4`/`G21` differ.

### Upload from Unified Fab Studio (carvera-cli)

The app can send **`output/cam.nc`** to the machine using the community **[carvera-cli](https://github.com/hagmonk/carvera-cli)** tool (not affiliated with Makera; **beta** upstream). You install it yourself (`uv tool install`, `pip`, or similar — see that repo).

1. Install **carvera-cli** and ensure it runs from a terminal (`carvera-cli --help` or your chosen invocation).
2. Under **File → Settings → External tool paths**, set **Carvera CLI executable** if the command is not on `PATH`, or use **Carvera CLI extra args (JSON array)** when the executable is `python.exe` and you need `["-m","carvera_cli"]` (example only — match your install).
3. On **Manufacture → CAM**, after **Generate toolpath**, use **Upload to Carvera**. Pick **WiFi** / **USB** / **Auto** and optionally the device (**IP** or **COM#** / serial path). The main process runs `carvera-cli upload …` with a timeout (see CLI docs).
4. **Starting the job** on the control may still be a separate step on the machine or in **Carvera Controller** — this integration focuses on **file upload**. Treat all G-code as **unverified** until you dry-run and confirm WCS, speeds, and clearances (`docs/VERIFICATION.md`).

**Troubleshooting**

| Symptom | Check |
|--------|--------|
| Spawn / ENOENT / command not found | CLI path, PATH, or extra-args JSON for `python -m …`. |
| Upload fails or times out | USB cable/driver; WiFi IP; run `carvera-cli scan` in a terminal. |
| File not found | Run **Generate toolpath** so `output/cam.nc` exists under the project folder. |

---

## Makera Carvera + 4th Axis Rotary Attachment

Profile: **`makera-carvera-4axis`** (`resources/machines/makera-carvera-4axis.json`).

The Carvera 4th-axis attachment adds a **rotary chuck** (A-axis, rotation around X) mounted on the machine table. This enables:
- **Cylindrical surface milling** (relief carving, engravings on round stock)
- **Multi-face indexing** (milling flat faces on round stock: flats, keyways, hex profiles)
- **Rotary turning-like passes** at multiple angular positions

### 4-axis operation kinds

| Kind | Description | Required params |
|------|-------------|-----------------|
| `cnc_4axis_roughing` | Mesh-aware radial waterline roughing — layer-by-layer from stock OD toward part surface | `zPassMm`, `zStepMm`, `stepoverDeg` |
| `cnc_4axis_finishing` | Mesh-aware surface-following finish — fine angular stepover at final depth | `zPassMm`, `finishStepoverDeg` |
| `cnc_4axis_contour` | Wraps a 2D contour onto the cylinder surface for engraving/profiling | `contourPoints`, `zPassMm` |
| `cnc_4axis_indexed` | Indexed — lock A at discrete angles; 3-axis pass at each stop | `indexAnglesDeg` (array), `cylinderDiameterMm` |

Roughing and finishing use the **TS cylindrical heightmap engine** (`cam-axis4-cylindrical-raster.ts`) with Python fallback. Contour and indexed use **`engines/cam/axis4_toolpath.py`** (pure Python). Post-processor: **`cnc_4axis_grbl.hbs`**. Full pipeline and parameters: **`docs/CAM_4TH_AXIS_REFERENCE.md`**.

### Critical 4th-axis setup checklist (before any cut)

1. **Rotary attachment mounting** — clamp the rotary unit firmly to the T-slots. Check run-out with a DTI; should be < 0.05 mm for finishing work.
2. **Stock centring** — workpiece must be centred on the chuck. Off-centre stock crashes the tool on rotation. Verify with the spindle **off** by hand-rotating the chuck.
3. **A WCS zero** — set A=0° to the left face (or a reference flat). Note in your setup card.
4. **Cylinder diameter** — measure your actual stock with calipers. Enter `cylinderDiameterMm` in the operation params. Even 1 mm error causes depth inaccuracy.
5. **Safe Z** — `safeZMm` is the **radial** clearance above the cylinder surface. Set ≥ 5 mm for roughing, ≥ 2 mm for finishing.
6. **Feeds** — start at 50 % of typical feeds for the first test pass. Rotary ops can have higher effective chip-loads depending on diameter.
7. **Air cut first** — run the full program with **spindle OFF** at 10 % feedrate override to verify the toolpath clears all clamps and chuck jaws.

### Wiring and firmware notes

- Carvera firmware must have **4-axis (A-axis) enabled**. Check Makera’s firmware release notes and the Carvera Controller app for rotary plugin installation.
- The A-axis uses the same Grbl extended dialect (`$100`–`$122` for steps/mm and limits). Verify A steps/degree matches the attachment’s stepper/gear ratio in Makera documentation.
- The post-processor emits `G0 A0` at program end to return the chuck to home. Confirm this is safe before enabling auto-return (in case of cable wrap-up issues).

### Sample `manufacture.json` snippet

```json
{
  "version": 1,
  "setups": [
    {
      "id": "setup-rotary",
      "label": "Rotary — cylindrical relief",
      "machineId": "makera-carvera-4axis",
      "wcsNote": "A=0° at left face of cylinder; Z=0 at top of stock surface"
    }
  ],
  "operations": [
    {
      "id": "op-rotary-rough",
      "kind": "cnc_4axis_roughing",
      "label": "Rotary roughing",
      "sourceMesh": "assets/part.stl",
      "params": {
        "cylinderDiameterMm": 50,
        "cylinderLengthMm": 80,
        "zPassMm": -1.5,
        "stepoverDeg": 3,
        "feedMmMin": 600,
        "plungeMmMin": 200,
        "safeZMm": 8,
        "toolDiameterMm": 3.175,
        "wrapMode": "parallel"
      }
    }
  ]
}
```

---

## Regression testing

Before trusting output:

1. **Dry run**: spindle off, Z high, feed reduced.
2. **First cut**: soft material, shallow depth.
3. Compare a short program against a **known-good** file from your current CAM for the same controller.

For **app-level** CAM checks (OpenCAMLib vs fallback, op kinds, `manufacture.json` params → post, Manufacture simulation tiers), see the **CAM / manufacture** and **Manufacture sim** rows in [`VERIFICATION.md`](VERIFICATION.md).
