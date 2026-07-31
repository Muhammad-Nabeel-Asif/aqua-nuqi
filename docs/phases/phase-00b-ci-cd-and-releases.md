# Phase 0B — CI/CD, Automated Builds & Release Distribution

**Goal:** every push to `main` automatically produces a **Windows `.exe`** and an **Ubuntu
`.AppImage` + `.deb`**, published to GitHub Releases behind permanent download links — so the
developer can install and test on Ubuntu, and the client can download and install on his Windows
laptop, without anyone building anything by hand.

**Depends on:** Phase 0 (there must be a packageable app first).
**Blocks:** nothing, but do it **immediately after Phase 0** — every later phase becomes easier to
test and demo once this exists.

Read `AGENT-BRIEF.md` first.

> This mirrors the pipeline already proven in the developer's **MA Traders** project
> (`~/Desktop/MA_Traders/.github/workflows/build-installers.yml`). Keep the parts that work; the
> improvements below exist because Aqua Nuqi holds a real business's only copy of its data, so a
> bad build reaching the client is more expensive here.

---

## Scope

New requirements introduced by this phase (add these IDs to
`docs/01-functional-requirements.md` when you touch it):

| ID | Pri | Requirement |
|---|---|---|
| FR-CI-01 | M | Every push to `main` builds installers for Windows x64 and Ubuntu x64 automatically. |
| FR-CI-02 | M | Builds are published to GitHub Releases with **fixed asset names**, giving permanent "always latest" download URLs. |
| FR-CI-03 | M | A build is only published if typecheck, lint, tests and the production build all pass. |
| FR-CI-04 | M | Version numbers auto-increment; no manual version bumping. |
| FR-CI-05 | M | Release notes are generated automatically from `docs/CHANGELOG.md` and the commits in the release. |
| FR-CI-06 | M | Two channels: **dev builds** (every push, marked pre-release, for the developer) and **stable builds** (deliberate, marked latest, for the client). |
| FR-CI-07 | M | Installing a new build over an existing one **must never delete or corrupt the user's database**. Verified by an automated check plus a manual upgrade test. |
| FR-CI-08 | S | The release feed is compatible with `electron-updater`, so Phase 9 can turn on in-app auto-update without changing the pipeline. |
| FR-CI-09 | S | A one-page, non-technical download-and-install guide for the client. |
| FR-CI-10 | S | Builds can also be triggered manually from the GitHub Actions tab. |

---

## 0B.1 Packaging configuration

Extend `electron-builder.yml` (created in Phase 0) so both platforms produce artifacts with
**stable, version-free file names** — this is what makes the permanent download links work.

```yaml
appId: com.aquanuqi.app
productName: Aqua Nuqi
directories:
  output: release
  buildResources: resources

# better-sqlite3 is a native module. Keeping asar off avoids the
# "cannot find module" class of packaging bugs seen in MA Traders.
asar: false

files:
  - out/**/*
  - drizzle/**/*
  - resources/**/*

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico

nsis:
  oneClick: false
  perMachine: false                      # per-user install, no admin rights (NFR-08)
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Aqua Nuqi
  deleteAppDataOnUninstall: false        # CRITICAL: never delete the client's data
  artifactName: Aqua-Nuqi-Setup.${ext}

linux:
  target: [AppImage, deb]
  category: Office
  icon: resources/icon.png
  maintainer: <developer name and email>
  artifactName: Aqua-Nuqi.${ext}

publish:
  - provider: github
    releaseType: release
```

Resulting permanent links (replace `<owner>/<repo>`):

```
Windows : https://github.com/<owner>/<repo>/releases/latest/download/Aqua-Nuqi-Setup.exe
Ubuntu  : https://github.com/<owner>/<repo>/releases/latest/download/Aqua-Nuqi.AppImage
Debian  : https://github.com/<owner>/<repo>/releases/latest/download/Aqua-Nuqi.deb
```

Add the matching scripts to `package.json`:

```json
"dist:win":   "npm run build && electron-builder --win --publish never",
"dist:linux": "npm run build && electron-builder --linux --publish never",
"rebuild:electron": "electron-builder install-app-deps",
"rebuild:node": "npm rebuild better-sqlite3"
```

> **Native module ABI trap (bit MA Traders, will bite here).** `better-sqlite3` must be compiled
> against Node for `vitest`/scripts and against Electron for packaging. CI does a clean install per
> job so it is safe there, but document the two rebuild scripts in the README for local use. If
> unit tests run in the same job as packaging, run the tests **before** `electron-builder`, or run
> them in a separate job entirely (this workflow does the latter).

## 0B.2 The workflow — `.github/workflows/build-release.yml`

Three jobs: **quality → build-windows → build-linux**. Windows publishes the release, Linux appends
to the same one (the ordering MA Traders already uses; it avoids two jobs racing to create the same
tag).

```yaml
name: Build & Release

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      channel:
        description: 'Release channel'
        type: choice
        options: [dev, stable]
        default: dev

permissions:
  contents: write

# A newer push makes an in-flight build pointless; cancel it.
concurrency:
  group: build-release-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '24'

jobs:
  # ---------------------------------------------------------------
  # Gate: nothing gets built, let alone released, if this fails.
  # ---------------------------------------------------------------
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test

  # ---------------------------------------------------------------
  # Windows: builds the installer AND creates the release.
  # ---------------------------------------------------------------
  build-windows:
    needs: quality
    runs-on: windows-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
      prerelease: ${{ steps.version.outputs.prerelease }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0            # needed for commit-based release notes

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - name: Derive version and channel
        id: version
        shell: bash
        run: |
          # Base version comes from package.json (e.g. 0.4.0 after Phase 4);
          # the patch position is the build number so it always increases.
          BASE=$(node -p "require('./package.json').version.split('.').slice(0,2).join('.')")
          VERSION="${BASE}.${{ github.run_number }}"
          CHANNEL="${{ github.event.inputs.channel || 'dev' }}"
          if [ "$CHANNEL" = "stable" ]; then PRERELEASE=false; else PRERELEASE=true; fi
          echo "version=$VERSION"       >> "$GITHUB_OUTPUT"
          echo "prerelease=$PRERELEASE" >> "$GITHUB_OUTPUT"
          echo "APP_VERSION=$VERSION"   >> "$GITHUB_ENV"
          npm version "$VERSION" --no-git-tag-version --allow-same-version

      - run: npm ci
      - name: Build Windows installer
        run: npm run dist:win

      - name: Generate release notes
        id: notes
        shell: bash
        run: node scripts/release-notes.mjs "$APP_VERSION" > RELEASE_NOTES.md

      - uses: actions/upload-artifact@v4
        with:
          name: Aqua-Nuqi-Windows
          path: release/*.exe
          if-no-files-found: error

      - name: Publish release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ env.APP_VERSION }}
          name: Aqua Nuqi v${{ env.APP_VERSION }}
          body_path: RELEASE_NOTES.md
          prerelease: ${{ steps.version.outputs.prerelease }}
          make_latest: ${{ steps.version.outputs.prerelease == 'false' }}
          files: |
            release/*.exe
            release/*.exe.blockmap
            release/latest.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ---------------------------------------------------------------
  # Ubuntu: appends its artifacts to the SAME release.
  # ---------------------------------------------------------------
  build-linux:
    needs: build-windows
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - name: Apply the same version
        run: npm version "${{ needs.build-windows.outputs.version }}" --no-git-tag-version --allow-same-version

      - run: npm ci
      - run: npm run dist:linux

      - uses: actions/upload-artifact@v4
        with:
          name: Aqua-Nuqi-Linux
          path: release/*.AppImage
          if-no-files-found: error

      - name: Attach Ubuntu builds to the same release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.build-windows.outputs.version }}
          prerelease: ${{ needs.build-windows.outputs.prerelease }}
          make_latest: ${{ needs.build-windows.outputs.prerelease == 'false' }}
          files: |
            release/*.AppImage
            release/*.deb
            release/latest-linux.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Why each difference from the MA Traders workflow exists

| Change | Reason |
|---|---|
| `quality` gate job | MA Traders publishes whatever compiles. Here, a broken build can reach the client's only copy of his business data. Nothing ships unless typecheck, lint and tests pass. |
| `npm ci` + `cache: npm` | Reproducible installs from the lockfile, and roughly 2–4× faster jobs. |
| `concurrency` with cancel | Three pushes in ten minutes no longer burn three full build matrices. |
| Version base from `package.json` | `0.1.<run>` forever gives the client no sense of progress. `0.<phase>.<run>` shows the app maturing. Bump the minor version at the end of each phase. |
| `dev` vs `stable` channel | Every push currently becomes the client's "latest download". Now pushes are pre-releases for the developer, and the client's link only moves when a stable build is deliberately triggered. |
| `latest.yml` / `latest-linux.yml` / `.blockmap` uploaded | These are what `electron-updater` reads. Uploading them now means Phase 9 can switch auto-update on with no pipeline changes. |
| `body_path: RELEASE_NOTES.md` | The client gets a plain-language list of what changed, not an empty release page. |
| `deleteAppDataOnUninstall: false` | Non-negotiable. An uninstall or a bad reinstall must never take his data with it. |

## 0B.3 Release notes generator — `scripts/release-notes.mjs`

A small Node script (no dependencies) that produces the release body:

1. The `## [Unreleased]` section of `docs/CHANGELOG.md`, if it has content.
2. Otherwise, the commit subjects since the previous tag, with `chore:`/`ci:`/`docs:` filtered out.
3. Always appended: a **plain-language footer for the client**:

```md
---
### How to install (Windows)
1. Download **Aqua-Nuqi-Setup.exe** below.
2. Double-click it. If Windows shows a blue "Windows protected your PC" box,
   click **More info** → **Run anyway**.
3. Follow the installer. Your existing data is **not** touched by an update.

Built: <date> · Version: <version>
```

4. If the build is a pre-release, prefix a clear banner:
   `> **Development build — for testing only. Not for the client.**`

## 0B.4 Data-safety verification (FR-CI-07)

The most dangerous thing this pipeline can do is ship an installer that wipes the client's data.
Read `docs/07-data-lifecycle-and-upgrades.md` before implementing this section — it explains the
five distinct ways this goes wrong.

**Automated tests** (these are the meaningful ones):
- The resolved database path is under `app.getPath('userData')` and **not** inside the install
  directory or `process.resourcesPath`.
- `appId`, `productName` and `package.json` `name` equal the frozen constants
  `com.aquanuqi.app` / `Aqua Nuqi` / `aqua-nuqi`. Changing any of these repoints `userData` and
  makes all the client's data appear to vanish, so the test is a tripwire against a careless
  rename.
- No `customUnInstall` NSIS macro exists, or if one does, every destructive statement is wrapped
  in `${IfNot} ${isUpdated}`.

> `deleteAppDataOnUninstall` is kept `false` for clarity, but electron-builder documents it as
> **one-click-installer only** and we use the assisted installer — so it is effectively inert and
> must not be relied on as the protection. Data survival on update comes from electron-builder
> always passing `--updated` to the previous uninstaller, which skips the app-data branch entirely.

**Manual upgrade test, once per stable release**, written into that phase's `PROGRESS.md` entry
(scenarios 1, 4 and 7 from `docs/07-data-lifecycle-and-upgrades.md` §7):
1. Install the previous stable build, create a customer and a few deliveries.
2. Install the new build over it **without** uninstalling → data intact, migrations ran, an
   `app_upgrade` audit entry exists.
3. Install an **older** build over the new one → it refuses to open the database and shows the
   "this app is older than your data" screen, leaving the file unmodified.
4. Uninstall via Add/Remove Programs → the data folder is still on disk.

Phase 0's migration system already takes a pre-migration backup; this pipeline is what makes that
matter, because upgrades will now be frequent.

## 0B.5 Repository setup

- Create the GitHub repository (private).
- `.gitignore` must include: `node_modules/`, `out/`, `dist/`, `release/`, `*.db`, `*.sqlite*`,
  `data/`, `.env*`, `*.log`, `.DS_Store`, `Thumbs.db`, plus `attachments/` and `backups/` if any
  local ones are ever created inside the repo.
  **Never commit a database file** — it will contain real customer data.
- Branch protection on `main`: require the `quality` job to pass.
- `resources/icon.ico` (256×256) and `resources/icon.png` (512×512) — a simple water-drop mark is
  fine for now.

## 0B.6 Documentation

- **README section "Getting a build"** for the developer: how to trigger dev vs stable, the
  permanent download links, and the two native-module rebuild scripts.
- **`docs/CLIENT-INSTALL-GUIDE.md`** — one page, non-technical, screenshot-friendly, covering:
  where to download, the SmartScreen warning and how to get past it, first-run setup, where his
  data lives, and how to install an update. Written so it can be sent as a WhatsApp message or
  printed.
- Add a "Latest build" badge and the two download links to the top of `README.md`.

## 0B.7 Optional, only if time allows

- Windows code signing if a certificate is ever purchased — removes the SmartScreen warning
  entirely. Document the cost (roughly $70–200/year) so the client can decide.
- A `build-check.yml` workflow on pull requests that runs `quality` only, no packaging.
- Artifact retention set to 14 days to stay inside free-tier storage.
- macOS build — only if the client ever mentions a Mac. Not currently needed.

---

## Out of scope
In-app auto-update (Phase 9 §9.7 — this phase only makes the feed compatible), code signing
certificate purchase, app store distribution, telemetry.

## Acceptance criteria

1. Pushing to `main` triggers the workflow; it fails and publishes **nothing** if a test fails.
2. A successful push produces a GitHub Release containing `Aqua-Nuqi-Setup.exe`,
   `Aqua-Nuqi.AppImage`, `Aqua-Nuqi.deb`, `latest.yml`, `latest-linux.yml` and the blockmap.
3. Pushes are marked **pre-release**; the client's `/releases/latest/download/...` link does not
   move.
4. A manual run with `channel: stable` marks the release as latest, and the permanent Windows link
   then serves that build.
5. Downloading `Aqua-Nuqi.AppImage`, running `chmod +x` and launching it starts the app on Ubuntu.
6. Downloading `Aqua-Nuqi-Setup.exe` on Windows installs without admin rights, creates desktop and
   start-menu shortcuts, and launches.
7. All four manual upgrade tests in §0B.4 pass, including the downgrade refusal.
8. Uninstalling on Windows leaves the data folder in place.
9. The release page shows readable notes with the install instructions footer.
10. Version numbers increase on every build and never collide.
11. Total pipeline time is under 15 minutes.
12. `docs/CLIENT-INSTALL-GUIDE.md` exists and a non-technical reader can follow it unaided.
13. `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the repository URL, the two permanent download links, the versioning
scheme actually used, and the reminder that **the minor version should be bumped in
`package.json` at the end of every phase** so build numbers stay meaningful.

Every phase from here on ends with: bump the minor version, push, trigger a **stable** build, run
the upgrade test, and send the client the download link.
