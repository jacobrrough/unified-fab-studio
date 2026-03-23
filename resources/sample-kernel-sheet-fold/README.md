# Sample project - sheet fold, flat pattern, plastic MVP

Open this folder as a project in Unified Fab Studio, then run **Design -> Build STEP (kernel)**.

- Base body: rectangular sheet from `design/sketch.json`.
- `part/features.json` includes:
  - `sheet_fold` (bend metadata + fold transform)
  - `sheet_flat_pattern` marker (enables DXF flat export path from project data)
  - `loft_guide_rails` validation marker
  - `plastic_rule_fillet`, `plastic_boss`, `plastic_lip_groove` MVP ops

Manual QA:
- Build kernel STEP/STL and verify no payload validation errors.
- Export drawing DXF with this project loaded; output should include a `BEND` layer.
