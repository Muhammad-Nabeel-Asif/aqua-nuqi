# AGENT BRIEF — read this before starting any phase

You are implementing one phase of **Aqua Nuqi**, an offline Electron + SQLite desktop app for a
water-bottle delivery business in Pakistan.

## Required reading order (do this first, every time)

1. `docs/00-project-overview.md` — business context and glossary
2. `docs/02-architecture-and-stack.md` — binding technical decisions
3. `docs/03-data-model.md` — the authoritative schema (read the sections your phase touches)
4. `docs/04-ui-ux-guidelines.md` — UI conventions
5. `docs/phases/PROGRESS.md` — what previous phases actually built and any deviations
6. **Your phase file**, e.g. `docs/phases/phase-03-billing-and-payments.md`

Also read `docs/07-data-lifecycle-and-upgrades.md` if your phase touches the database path,
migrations, packaging, the installer, or backup/restore.

Skim `docs/01-functional-requirements.md` only for the `FR-` IDs your phase lists.

## Rules you must not break

1. **Stay inside your phase's scope.** Do not start work belonging to a later phase. If you need
   something from a later phase, stub it behind a clearly named `TODO(phase-N)` and note it in
   `PROGRESS.md`.
1b. **Never commit a database file, a backup, or an attachment.** They contain real customer data.
   Check `.gitignore` before your first commit.
2. **Do not change decisions** in `02-architecture-and-stack.md` (libraries, folder structure, IPC
   rules, money-as-paisa). If a decision is genuinely blocking, implement the closest compliant
   alternative and write the concern in `PROGRESS.md` under "Escalations".
3. **Money is integer paisa.** Never a float, never a string in the database.
4. **Business dates are `YYYY-MM-DD` text.** Never a JS `Date` in the database.
5. **Every schema change is a committed migration.** Never mutate the DB by hand.
6. **Nothing is hard-deleted.** Soft-delete or void.
7. **Every mutation writes an audit entry and respects the period lock** (once those exist — from
   Phase 0 onwards).
8. **Every IPC channel needs a Zod contract in `src/shared/contracts/` and a role restriction.**
9. **Business logic lives in `src/main/services/`, has no Electron imports, and is unit-tested.**
10. **Write tests for money maths and month boundaries.** These are where this app will break.

## How to finish a phase

Before you say the phase is done:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

All four must pass. Then:

1. Manually run the app and verify every acceptance criterion in your phase file.
2. Append to `docs/phases/PROGRESS.md`:
   - Phase number and date
   - What was built (file/module level)
   - Deviations from the spec and why
   - New setting keys, IPC channels, error codes, migrations added
   - **What the next phase needs to know** (the most important section)
   - Escalations / open questions for the human
3. Add a line to `docs/CHANGELOG.md`.
4. **From Phase 0B onwards:** bump the minor version in `package.json`, commit, push to `main`, and
   trigger a **stable** release from the GitHub Actions tab. Then install the new build over the
   previous one and confirm existing data survives the upgrade. Record the version and the release
   link in `PROGRESS.md`.

## Working style

- Prefer a small number of well-named files over many tiny ones.
- Write real code, not placeholders. If a screen is in scope, it must actually work end to end.
- Seed realistic demo data behind a dev-only flag so screens can be verified with 200 customers and
  a few months of deliveries.
- Do not add dependencies that are not listed in the stack without noting it in `PROGRESS.md`.
- Comment only non-obvious business rules (e.g. why deposits are excluded from revenue).
