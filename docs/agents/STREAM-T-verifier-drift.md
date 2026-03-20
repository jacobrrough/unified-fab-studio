# Agent brief — Stream T: Drift file + typecheck truth

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **T** (drift file / typecheck). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Own **`docs/agents/VERIFICATION_DRIFT.md`**. Run the full **automated bar**, reconcile **docs vs code vs IPC**, refresh the drift file, and land **≤3** tiny P0 fixes only if they are **trivial** (e.g. missing handler name in doc, one undefined callback). **Large typecheck debt** is recorded in the drift file and handed to **Stream E / A / H / P** — do not “fix the world” in one T chat.

**Not Stream T:** In-chat-only verification reports → **Stream M** ([`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md)).

## Mission

From **`unified-fab-studio/`**:

1. **`npm test`** — must pass before claiming done.
2. **`npm run build`** — must pass.
3. **`npm run typecheck`** — run and **record pass/fail** in `VERIFICATION_DRIFT.md` §1 and §3 (if fail, list files/errors at high level).
4. **IPC** — confirm [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts) passes; optionally diff preload `invoke` list vs `VERIFICATION.md` mentions.
5. **Skim** [`../VERIFICATION.md`](../VERIFICATION.md), [`../PARITY_PHASES.md`](../PARITY_PHASES.md) for obvious mismatches with §2 inventory.
6. **Update** [`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md): gates table, IPC list if channels changed, typecheck section, handoffs, resolution log row.

## Allowed code changes

| OK | Not OK |
|----|--------|
| **≤3** micro-fixes, **≤40 lines** total, no schema/kernel payload | Making `typecheck` green if it requires large refactors |
| Doc links / typos in drift file only | Deleting typecheck debt rows before fixed |
| One obvious bug (e.g. undefined `resetFilters`) if **≤15 lines** | Touching `design-schema.ts` / kernel payload as primary work |

## Overlap

| Stream | Rule |
|--------|------|
| **M** | M does **not** create/overwrite `VERIFICATION_DRIFT.md`. |
| **G** | G fixes target docs **after** T refreshes drift; G does not fight T on the same edit window. |
| **S** | If IPC contract fails, **S** or feature owner fixes preload+main; T re-runs gates and updates §2. |

## Success criteria

- `VERIFICATION_DRIFT.md` reflects **current** gate results and **typecheck** status.
- Final reply includes **Shipped:** line + **Handoffs:** bullets.

## Final reply format

```
Shipped: Verifier — VERIFICATION_DRIFT.md — <refreshed gates + IPC list + typecheck debt logged>.
Handoffs: <stream>: <item>; …
```

## Command reference

```bash
cd unified-fab-studio
npm test
npm run build
npm run typecheck
```

See: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → **Stream T**, [`../VERIFICATION.md`](../VERIFICATION.md), [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).
