<p align="center">
  <img src="resources/brand/logo-full.png" alt="Aqua Nuqi" width="300" />
</p>

# Aqua Nuqi — Water Plant Management System

[![Latest stable](https://img.shields.io/github/v/release/Muhammad-Nabeel-Asif/aqua-nuqi?label=latest%20stable)](https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest)

**Download (stable — for the client):**

- Windows: https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe
- Ubuntu: https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage

Client install steps: [`docs/CLIENT-INSTALL-GUIDE.md`](docs/CLIENT-INSTALL-GUIDE.md)

An offline-first **Electron + SQLite desktop application** for a water purification plant that
delivers 19-litre returnable bottles to customers across a city.

It replaces paper delivery cards with digital tracking, generates monthly invoices as PDFs,
tracks expenses and staff salaries, keeps count of every bottle, and shows the owner what he
actually earns.

> **Status:** Phase 1 (Customers & master data). Next: Phase 2 (Deliveries).

---

## Getting a build

### Permanent download links

| Platform          | URL                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Windows installer | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe |
| Ubuntu AppImage   | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage  |
| Debian package    | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb       |

These URLs always serve the newest **stable** release. Every push to `main` also publishes a
**pre-release** (dev channel) that does **not** move `/releases/latest`.

### Trigger a build

1. **Dev (automatic):** push to `main`. The workflow runs quality → Windows → Linux and publishes a
   pre-release tagged `v0.<phase>.<run_number>`.
2. **Stable (manual):** GitHub → Actions → **Build & Release** → Run workflow → channel **stable**.
   That marks the release as latest and moves the client's download links.

### Local packaging

```bash
npm ci
npm run dist:win     # Windows NSIS installer → release/Aqua-Nuqi-Setup.exe
npm run dist:linux   # AppImage + deb → release/Aqua-Nuqi.AppImage / .deb
```

### Native module rebuild (better-sqlite3 ABI)

`better-sqlite3` must match the runtime ABI:

| When                                 | Command                    |
| ------------------------------------ | -------------------------- |
| Running unit tests / Node scripts    | `npm run rebuild:node`     |
| Packaging / running the Electron app | `npm run rebuild:electron` |

CI installs cleanly per job, so this rarely matters there. Locally, if tests fail with a native
module error after packaging (or the reverse), run the matching rebuild script.

**Versioning:** `package.json` holds `0.<phase>.0`. CI sets the patch to `github.run_number`
(e.g. `0.2.14`). Bump the minor version at the end of every phase.

---

## Documentation map

| Document                                                                                         | Read it when                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`docs/00-project-overview.md`](docs/00-project-overview.md)                                     | Always first — business context and glossary                                                                        |
| [`docs/01-functional-requirements.md`](docs/01-functional-requirements.md)                       | You need the full requirement catalogue (`FR-` IDs)                                                                 |
| [`docs/02-architecture-and-stack.md`](docs/02-architecture-and-stack.md)                         | Before writing any code — binding technical decisions                                                               |
| [`docs/03-data-model.md`](docs/03-data-model.md)                                                 | Any time you touch the database — authoritative schema                                                              |
| [`docs/04-ui-ux-guidelines.md`](docs/04-ui-ux-guidelines.md)                                     | Before writing any UI                                                                                               |
| [`docs/05-open-questions-and-recommendations.md`](docs/05-open-questions-and-recommendations.md) | **Before the next client meeting** — gaps, risks and questions                                                      |
| [`docs/06-client-questionnaire.md`](docs/06-client-questionnaire.md)                             | **In the client meeting** — a plain-language script with blanks to fill in                                          |
| [`docs/07-data-lifecycle-and-upgrades.md`](docs/07-data-lifecycle-and-upgrades.md)               | Before touching the database path, packaging config, migrations or the installer — how client data survives updates |
| [`docs/08-branding.md`](docs/08-branding.md)                                                     | Before changing any logo, icon or installer graphic — all artwork is generated from one source file                 |
| [`docs/LOCAL-DEV-AND-TEST.md`](docs/LOCAL-DEV-AND-TEST.md)                                       | Dev mode + seed demo, AppImage/Setup install, wipe, uninstall, re-test first-run or upgrade                         |
| [`docs/CLIENT-INSTALL-GUIDE.md`](docs/CLIENT-INSTALL-GUIDE.md)                                   | Send to the client over WhatsApp                                                                                    |
| [`docs/phases/PROMPTS.md`](docs/phases/PROMPTS.md)                                               | **Copy-paste prompts** — one per phase, plus review, resume, bug-fix and client-answer prompts                      |
| [`docs/phases/AGENT-BRIEF.md`](docs/phases/AGENT-BRIEF.md)                                       | Start of every coding session                                                                                       |
| [`docs/phases/PROGRESS.md`](docs/phases/PROGRESS.md)                                             | Start and end of every phase                                                                                        |

---

## Build phases

Each phase is sized to be implemented in a single AI-agent context window. Start a fresh context
per phase and point the agent at `docs/phases/AGENT-BRIEF.md` plus that phase's file.

| #   | Phase                                                                                            | Delivers                                                                                                                                       | Depends on |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | [Foundation](docs/phases/phase-00-foundation.md)                                                 | Electron shell, SQLite, migrations, IPC, auth, settings, audit, period lock, installer                                                         | —          |
| 0B  | [CI/CD & releases](docs/phases/phase-00b-ci-cd-and-releases.md)                                  | GitHub Actions building Windows `.exe` + Ubuntu `.AppImage`/`.deb` on every push, published to GitHub Releases behind permanent download links | 0          |
| 1   | [Customers & master data](docs/phases/phase-01-customers-and-master-data.md)                     | Customers, areas, routes, products, dated rates, opening balances, CSV import                                                                  | 0          |
| 2   | [Delivery tracking](docs/phases/phase-02-delivery-tracking.md)                                   | Daily entry, month matrix, digital customer card, bottle balances                                                                              | 0, 1       |
| 3   | [Billing, ledger & payments](docs/phases/phase-03-billing-ledger-and-payments.md)                | Invoices, customer ledger, payments, receivables, period close                                                                                 | 0–2        |
| 4   | [PDF documents & sharing](docs/phases/phase-04-pdf-documents-and-sharing.md)                     | Invoice/receipt/statement PDFs, printing, WhatsApp sharing                                                                                     | 3          |
| 5   | [Expense management](docs/phases/phase-05-expense-management.md)                                 | Expenses, categories, recurring expenses, receipts                                                                                             | 0, 4       |
| 6   | [Employees & payroll](docs/phases/phase-06-employees-and-payroll.md)                             | Staff records, attendance, advances, monthly payroll, salary slips                                                                             | 2, 5       |
| 7   | [Inventory & trip reconciliation](docs/phases/phase-07-inventory-and-trip-reconciliation.md)     | Bottle stock, vehicles, van load/cash reconciliation, bottles-out recovery list                                                                | 1, 2, 5, 6 |
| 8   | [Dashboard & reports](docs/phases/phase-08-dashboard-and-reports.md)                             | Dashboard, profit & loss, sales/money/operations reports                                                                                       | 2–7        |
| 9   | [Backup, audit, hardening & release](docs/phases/phase-09-backup-audit-hardening-and-release.md) | Full backup/restore, audit viewer, integrity tools, installer, handover                                                                        | all        |

**Minimum shippable product:** Phases 0–4. That alone replaces the paper card and the hand-written
bill, which is the client's actual pain.

**Do Phase 0B second, not last.** Once it exists, every later phase ends with a push that produces
an installer the client can download — which is how you get real feedback instead of guesses.
Each phase from 1 onwards finishes with: bump the minor version, push, trigger a stable build, run
the upgrade test, send the client the link.

---

## Handing a phase to an AI agent

Ready-made prompts for all eleven phases live in
[`docs/phases/PROMPTS.md`](docs/phases/PROMPTS.md). The loop for each phase is:

1. Open a **fresh agent context** and paste the phase prompt (`P0`, `P0B`, `P1`, …).
2. When it finishes, open **another fresh context** and run the **Phase Review** prompt (`R1`).
   An independent reviewer catches what the builder rationalised away.
3. Feed any findings back with the **Fix** prompt (`R2`).
4. Move to the next phase.

That file also contains prompts for resuming a phase that ran out of context (`R3`), fixing a bug
reported by the client (`R4`), and applying the client's questionnaire answers to the docs (`R5`).

---

## Settled scope decisions

- **Single plant.** No multi-branch support, no `branch_id` on any table.
- **Single laptop, single database file.** No sync, no networking. Two people can share the laptop
  with separate logins; two laptops is a v2 architecture change.
- **The owner enters all deliveries himself**, each evening, from the drivers' paper slips.
  The daily entry screen therefore has a hard target: **100 customers in under 4 minutes,
  keyboard only.** Phase 2 is not complete until that is measured and met.

## Core conventions (never break these)

- **Money is an integer in paisa.** `Rs 60.00` is `6000`. Never a float.
- **Business dates are `YYYY-MM-DD` text.** Periods are `YYYY-MM`.
- **Nothing is hard-deleted.** Soft deletes and voids only.
- **Rates and amounts are snapshotted** onto transactions so old invoices never change.
- **Security deposits are not revenue. Employee advances are not a new expense.**
- **Every mutation** writes an audit entry and respects the period lock.
- **Business logic lives in `src/main/services`** with no Electron imports, and is unit-tested.

---

## Before the next client meeting

Read [`docs/05-open-questions-and-recommendations.md`](docs/05-open-questions-and-recommendations.md).
It lists what was missing from the original brief — bottle deposits and returns, partial payments,
rate history, the deposit/advance accounting traps, data migration from paper, who does the daily
data entry, and the fact that a local SQLite file cannot be shared across two laptops.
