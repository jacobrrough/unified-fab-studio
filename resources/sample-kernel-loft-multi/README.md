# Sample project — multi-section loft (Phase 4)

Open this folder as a **project** in Unified Fab Studio. The design uses **`solidKind: loft`** with **three** axis-aligned rectangles in sketch entity order.

- **Loft step** (`loftSeparationMm`): uniform **+Z** spacing between each consecutive profile (here 9 mm → total loft height 18 mm for three profiles).
- **Kernel** (`build_part.py`): chains CadQuery two-profile lofts along Z and **unions** them; manifest **`loftStrategy`** looks like `multi+union-chain:3:…` when successful.
- **Preview**: Three.js **ruled** strips at `0…h`, `h…2h`, `2h…3h` — same spacing rule as the kernel.

**Requirements:** Python with **CadQuery** — **Design → Build STEP (kernel)**.

**Limit:** at most **16** closed profiles in entity order; more sketches return `loft_too_many_profiles` before the Python run.

**Manual QA:** [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — **Geometry kernel** → Phase 4 **loft** row.
