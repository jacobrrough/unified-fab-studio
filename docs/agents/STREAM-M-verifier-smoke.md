# Agent brief — Stream M: Smoke gate & verification report

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **M** (smoke / in-chat verify). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Run the **automated release bar** locally, produce a **short verification report** for the team or coordinator, and optionally land **at most one** minimal fix — **without** owning feature work, IPC batches, or drift-file maintenance (that is **Stream T** → **Stream G**).

Aligns with the **`fab-verifier`** subagent: catch “green tests but wrong wiring” and doc/phase mismatches **before** merge or right after a parallel batch lands.

## Mission

After a sprint or before claiming a batch **done**, you:

1. **Prove the tree** — `npm test`, `npm run build`, and `npm run typecheck` from **`unified-fab-studio/`** all succeed (paste summaries or key failures; never “should pass”).
2. **Optional Python smokes** — if the batch touched **`engines/cam/`**, run `python engines/cam/smoke_ocl_toolpath.py` from **`unified-fab-studio/`** (or note **skipped** and why). If **`engines/occt/`** was in scope, note whether manual **Build STEP** smoke was out of band.
3. **Read-first cross-check** — skim [`../VERIFICATION.md`](../VERIFICATION.md), [`../PARITY_PHASES.md`](../PARITY_PHASES.md), and [`../PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) for **obvious** contradictions with what tests and code say (IPC names, phase claims). **Do not** treat this as exhaustive audit unless the user asked for one.
4. **Deliver a report** — in your final message, use a small structured block: **Gates** (pass/fail), **Drift / risk** (bullet list or “none”), **Recommended owner** (which stream should fix each item). If drift is large, recommend **Stream T** to refresh [`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md) and **Stream G** to apply doc fixes — **only Stream T** should create/overwrite that drift file in a parallel plan.

## Allowed changes (pick **zero or one** per chat)

| OK | Not OK |
|----|--------|
| **≤1** tiny fix: typo, broken link in docs you touched for the report, **one** failing assertion, **one** wrong IPC name in a **comment** or doc | New features, schema changes, new `ipcMain.handle` (**Stream S**) |
| **≤5** doc lines across **≤2** files if they **only** correct facts you verified (counts as the **one** “theme” with the coordinator) | Edits to **`design-schema.ts`** / **`sketch-profile.ts`** / kernel payload (**Streams A / B**) |
| Report-only (no repo diff) | Large refactors, catalog status rows (**feature streams** or **G** for doc-only catalog *guidance*) |

If another agent is actively editing a file, **do not** touch it — report instead.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **T** | **T** owns producing **`docs/agents/VERIFICATION_DRIFT.md`** and aggressive drift closure; **M** summarizes in-chat and may recommend T→G. Same sprint: do not both rewrite **VERIFICATION_DRIFT.md**. |
| **H** | **H** adds systematic tests; **M** runs the full suite and flags gaps — hand off missing coverage to **H** with file hints. |
| **G** | **G** fixes prose; **M** may fix **≤5** verified doc lines **or** delegate to **G** for larger doc passes. |
| **S** | **M** does not register IPC; if contract tests fail, assign **S** or the feature owner. |

## Parallel safety

Safe alongside **F, G, H, I, J, K, L** when you stay **report-only** or a **single-file micro-fix**. Avoid the same **hot files** as other chats (`App.tsx`, `main/index.ts`, `preload/index.ts`, `design-schema.ts`) unless your **one** fix is explicitly in a cold file.

## Success criteria

- **Gates:** `npm test` + `npm run build` + `npm run typecheck` — all run; failures reproduced and described.
- **Report:** At least **Gates** + **Drift/risk** sections in the final reply.
- **Optional fix:** If you changed the repo, keep it within the **Allowed changes** table.

## Final reply format

End with:

`Shipped: Verify — <gates pass|fail> — <one-line outcome; list open items if any>.`

If you also applied a micro-fix, add: `Files: <paths>.`

---

## Command reference (from `unified-fab-studio/`)

```bash
npm test
npm run build
npm run typecheck
python engines/cam/smoke_ocl_toolpath.py
```

See also: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) (**Stream M** + **Aggressive — Stream M**), [`../VERIFICATION.md`](../VERIFICATION.md), [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).
