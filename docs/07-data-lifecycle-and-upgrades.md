# Data Lifecycle: What Happens to the Client's Data on Update

The client will run this app for years and install many updates over it. His database is the only
copy of his business records. This document defines exactly where data lives, what an update does
to it, and the guardrails that must exist so an update can never destroy it.

**Short answer: an update does not touch his data — but only because of specific choices we make.
Get any one of them wrong and the data is gone.**

---

## 1. Two completely separate locations

An installed Electron app on Windows lives in two places that have nothing to do with each other:

| | Path (Windows, per-user install) | Contains | Replaced by an update? |
|---|---|---|---|
| **Program files** | `C:\Users\<user>\AppData\Local\Programs\aqua-nuqi\` | `Aqua Nuqi.exe`, Electron runtime, our compiled code, bundled migration files | **Yes — wiped and rewritten every update** |
| **User data** | `C:\Users\<user>\AppData\Roaming\Aqua Nuqi\` | `data/aqua-nuqi.db`, `backups/`, `attachments/`, `logs/`, config | **No — never touched by the installer** |

On Ubuntu the equivalents are the AppImage/`/opt` install directory and
`~/.config/Aqua Nuqi/`.

Everything the client creates — customers, deliveries, invoices, payments, expenses, receipt
photos, backups — lives in the second folder. The installer only ever rewrites the first.

## 2. What actually happens when he installs a new version over the old one

1. He runs `Aqua-Nuqi-Setup.exe`.
2. NSIS detects an existing installation and silently runs the **previous version's uninstaller**,
   passing the `--updated` flag.
3. That uninstaller removes the old program files. Because of the `--updated` flag it **skips the
   app-data deletion branch entirely** — this is hard-coded in electron-builder's
   `uninstaller.nsh`, not something we configure.
4. New program files are written.
5. On next launch our app opens the **same** database file in `Roaming\Aqua Nuqi\data\`, sees the
   schema is older than the code, takes a backup, and runs the pending migrations.

So the normal path is safe by construction. His two months of data survive, and the new version's
schema changes get applied to it.

> Note: `deleteAppDataOnUninstall` is documented by electron-builder as **one-click installer
> only**. We use the assisted installer (`oneClick: false`), so the flag is effectively inert for
> us. Keep it set to `false` anyway for clarity, but do **not** treat it as the protection — the
> real protections are §3 below.

## 3. The five ways data can still be lost, and the guardrail for each

### 3.1 Storing the database next to the executable
If the database ever ends up in the install directory (the "portable app" instinct), **every single
update deletes it**, because step 3 above wipes that folder.

> **Guardrail.** The database path must resolve under `app.getPath('userData')`. A startup
> assertion throws a fatal error if the resolved path is inside `process.resourcesPath` or the
> app directory. An automated test asserts the same.
>
> This also applies to the portable build added in Phase 9 — a portable build deliberately keeps
> data beside the executable, so it must use a **different, clearly labelled** data folder and the
> UI must warn that portable data is not shared with the installed version.

### 3.2 Changing `appId` or `productName` after the first release
`app.getPath('userData')` is derived from the app name. Renaming `Aqua Nuqi` to `AquaNuqi`, or
changing `appId`, points the new version at a **different, empty folder**. The client opens the app
and every customer is gone. The data is still on disk, but he does not know that, and by then he
has panicked.

> **Guardrail.** These values are frozen after the first stable release:
> ```
> appId       = com.aquanuqi.app
> productName = Aqua Nuqi
> package.json name = aqua-nuqi
> ```
> A unit test asserts all three against hard-coded constants. If a rename is ever genuinely
> required, it needs an explicit migration step that copies the old userData folder to the new one
> before opening the database — never a plain rename.

### 3.3 A failed migration
The new version adds a column; the migration throws halfway; the database is left in a
half-migrated, unopenable state.

> **Guardrail (already in Phase 0).** At boot, before any migration runs:
> 1. Take a `pre_migration` backup and verify its checksum.
> 2. Run **all** pending migrations inside a single transaction.
> 3. On any failure: roll back, restore the pre-migration file, and show a fatal-error window
>    naming the backup path and telling him to contact the developer.
>
> Pre-migration backups are exempt from backup retention pruning (Phase 9 §9.1) — they are the
> ones you need six months later.

### 3.4 Installing an older version over a newer one
This is a realistic accident: he re-uses an old download link, or reinstalls from an old file on
his desktop. The app is now older than the database. Old code against a newer schema silently
writes wrong data or crashes.

> **Guardrail.** At boot, compare `app_meta.schema_version` against the highest migration bundled
> in the running build:
> - schema version **higher** than the app knows → **refuse to open the database**. Show:
>   *"This version of Aqua Nuqi (0.6.x) is older than your data, which was created with version
>   0.9.x. Please install the latest version. Your data is safe and has not been changed."*
>   Offer a "Download latest" button and an "Open my data folder" button. Never migrate downwards.
> - schema version lower → migrate as normal.

### 3.5 A manual uninstall, or a custom uninstall script
If he uninstalls properly (Add/Remove Programs) rather than installing over the top, the
`--updated` flag is absent. With our current config the data still survives, but any future
`customUnInstall` macro that deletes folders would run.

> **Guardrail.** If an `installer.nsh` with `customUnInstall` is ever added, every destructive
> line must be wrapped:
> ```nsis
> !macro customUnInstall
>   ${IfNot} ${isUpdated}
>     ; only real uninstalls reach here
>   ${EndIf}
> !macroend
> ```
> And in Phase 9, the uninstall flow gets an explicit **"also delete my business data"** checkbox,
> unticked by default, with a warning that it cannot be undone.

## 4. Required boot sequence

Every launch, before the main window opens:

```
1. Resolve userData path
2. Assert DB path is under userData and not inside the install directory   → fatal if not
3. Assert appId / productName match the frozen constants                   → fatal if not
4. DB file missing?            → first-run wizard
5. Read app_meta.schema_version
6. schema_version > bundled max?  → refuse to open, show "app is older than your data"
7. schema_version < bundled max?  → pre_migration backup → migrate in a transaction
                                     → on failure: rollback, restore, fatal error screen
8. Record the upgrade: append an audit_log entry with action 'app_upgrade',
   summary "Upgraded 0.6.12 → 0.9.31, schema 14 → 19"
9. Rebuild materialised summary tables if the migration touched their sources
10. Open the main window
```

Step 8 matters more than it looks: when the client reports "the numbers changed", the first
question is which version he was on, and this is how you find out. Add `'app_upgrade'` to the
`audit_log.action` CHECK constraint in `docs/03-data-model.md` §A.

## 5. How the client should actually receive updates

Three options, in the order they become available:

| Stage | How he updates | Effort for him |
|---|---|---|
| Phases 0B–8 | You send a WhatsApp message with the permanent download link. He downloads `Aqua-Nuqi-Setup.exe`, double-clicks, clicks through, done. Data intact. | ~2 minutes |
| Phase 9 onwards | In-app auto-update. The app checks the stable channel on startup, downloads in the background, and offers "Restart to update". | One click |
| Always available | He does nothing. The old version keeps working offline forever. | Zero |

**Tell him explicitly, in writing, at handover:** *"Updating the app never affects your data.
You do not need to uninstall the old version first — just run the new installer over it. If you
ever see a warning that your data is newer than the app, stop and call me."*

## 6. Moving to a new laptop

This is the scenario that actually loses data in practice — not updates. The client buys a new
laptop, a shop migrates his files, and the `AppData\Roaming` folder is not copied because it is
hidden.

**Documented procedure (goes in the handover document):**
1. On the **old** laptop: open Aqua Nuqi → Settings → Backup → **Backup now**. Copy the resulting
   `.zip` to a USB drive.
2. On the **new** laptop: install Aqua Nuqi from the standard download link.
3. Launch it. On the first-run wizard choose **"Restore from a backup"** instead of creating a new
   business.
4. Pick the `.zip` from the USB drive. The app restores the database and all attachments, runs any
   pending migrations, and restarts.
5. Verify: customer count, this month's revenue, and total outstanding all match the old laptop.
6. Only then wipe the old laptop.

> Phase 0's first-run wizard must therefore offer **"Restore from backup"** as an alternative to
> "Set up a new business". Without it, step 3 has no path and the client is stuck. This is a
> Phase 0 requirement, not a Phase 9 one.

## 7. Upgrade test matrix

Run before every **stable** release (Phase 0B §0B.4 makes this mandatory per phase):

| # | Scenario | Expected |
|---|---|---|
| 1 | Install previous stable → create data → install new build over it | All data present, migrations applied, `app_upgrade` audit entry written |
| 2 | Same, but skipping two versions (e.g. 0.4 → 0.7) | All intermediate migrations apply in order |
| 3 | Install new build on a clean machine | First-run wizard, no errors |
| 4 | Install an **older** build over a newer one | App refuses to open the database with the "app is older than your data" message; data unchanged |
| 5 | Corrupt the DB, then launch | Clear error, offer restore from the most recent backup |
| 6 | Kill the app mid-migration | Next launch restores the pre-migration backup and reports it |
| 7 | Uninstall via Add/Remove Programs | Data folder still present |
| 8 | Backup on machine A → restore on machine B | Identical row counts and identical report totals |

Scenarios 1, 4 and 7 are the minimum for every release. The full matrix runs before v1.0 and after
any migration that alters existing rows.

## 8. Rules summary

1. Data lives in `userData`. Never beside the executable.
2. `appId`, `productName` and `package.json name` are frozen after the first stable release.
3. Every launch takes a pre-migration backup before touching the schema.
4. Migrations are forward-only, transactional, and never run downwards.
5. An older app must refuse to open a newer database rather than risk it.
6. Pre-migration and pre-restore backups are never auto-pruned.
7. Every upgrade is recorded in the audit log.
8. The first-run wizard can restore from a backup, not just create a new business.
9. Test scenarios 1, 4 and 7 before every stable release.
