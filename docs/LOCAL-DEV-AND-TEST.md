# Local run, seed, reset & uninstall (Ubuntu + Windows)

One place for local work: **dev mode with demo seed**, GitHub AppImage/Setup installs, wipe data,
and full uninstall.

**Wipe / uninstall deletes business data on this machine** — never use those delete commands on a
PC that holds real client data you care about.

---

## Quick chooser

| I want to…                            | Do this                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Develop / explore with fake customers | [§1 Dev mode](#1-dev-mode-npm-run-dev--seed-demo) → seed from Settings → About   |
| Smoke-test what the client installs   | [§2 Packaged build](#2-packaged-build-appimage--setupexe) (AppImage / Setup.exe) |
| Fresh first-run (keep the app)        | [§5 Wipe](#5-wipe--reset)                                                        |
| Remove Aqua Nuqi completely (Ubuntu)  | [§6 Complete uninstall](#6-ubuntu--complete-uninstall-one-shot)                  |
| Clear **only** `npm run dev` data     | `npm run db:reset` ([§5](#5-wipe--reset))                                        |

|                     | `npm run dev`            | AppImage / `.deb` / Setup.exe                                      |
| ------------------- | ------------------------ | ------------------------------------------------------------------ |
| Seed demo customers | Yes — Settings → About   | No (production blocks it)                                          |
| Data folder         | `<repo>/.tmp/Aqua Nuqi/` | `~/.config/Aqua Nuqi/` (Linux) or `%AppData%\Aqua Nuqi\` (Windows) |

---

## 1. Dev mode (`npm run dev` + seed demo)

Use this when you want UI/features with ~200 customers, routes, employees, and delivery history.

```bash
cd "/path/to/Aqua Nuqi"   # your clone
npm ci
npm run rebuild:electron  # if better-sqlite3 / native ABI errors
npm run dev
```

1. First-run wizard → **Set up a new business** (or restore a backup).
2. Sign in as the **owner**.
3. **Settings → About** → **Seed demo customers**.
4. The button shows **Seeding…** for ~10–20s (creating customers + delivery history). Keep the app
   open — do not force-quit if the window briefly feels busy.
5. Toast confirms counts (customers / areas / routes). Screens now have realistic data.

### What seed creates

- ~200 customers across 6 areas / 10 routes
- Employees
- Several months of delivery history (useful for month-boundary / performance checks)

### Reset only the dev profile

```bash
# Quit the app first
npm run db:reset
```

This deletes `<repo>/.tmp/Aqua Nuqi/` (or `AQUA_NUQI_USER_DATA` if set). It does **not** touch
packaged-app data under `~/.config/Aqua Nuqi/`.

**Quit `npm run dev` first** (SQLite may keep the folder locked), then reset, then start again →
wizard → seed if you want.

---

## 2. Packaged build (AppImage / Setup.exe)

**Always-latest stable** (what the client should use):

| Platform          | Link                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Windows installer | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe |
| Ubuntu AppImage   | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage  |
| Debian `.deb`     | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb       |

Or open https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases and pick a specific tag.
Prefer **Latest** / non–pre-release for client-like upgrade tests.

There is **no** Seed demo button in these builds.

---

## 3. Ubuntu — AppImage (usual packaged test path)

### First install / run

```bash
cd ~/Downloads
chmod +x Aqua-Nuqi.AppImage
./Aqua-Nuqi.AppImage
```

If the desktop environment blocks it: right-click → **Properties** → allow as program, or
**Allow Launching** when prompted.

Optional — keep it somewhere stable:

```bash
mkdir -p ~/Apps
mv ~/Downloads/Aqua-Nuqi.AppImage ~/Apps/
chmod +x ~/Apps/Aqua-Nuqi.AppImage
~/Apps/Aqua-Nuqi.AppImage
```

On first launch: setup wizard → **Set up a new business** (or restore a backup).

### AppImage vs data

| Piece         | Location                            | Replaced when you download a new AppImage? |
| ------------- | ----------------------------------- | ------------------------------------------ |
| App binary    | The `.AppImage` file you downloaded | Yes — you replace the file                 |
| Business data | `~/.config/Aqua Nuqi/`              | **No** — stays until you delete it         |

Updating the AppImage does **not** clear customers/invoices. Fresh install → [§5](#5-wipe--reset).
Remove the app entirely → [§6](#6-ubuntu--complete-uninstall-one-shot).

### Update (keep data)

1. Quit Aqua Nuqi.
2. Download the new `Aqua-Nuqi.AppImage`, `chmod +x`, replace the file you run.
3. Launch again — same DB under `~/.config/Aqua Nuqi/`.

### Debian package (optional)

```bash
cd ~/Downloads
sudo apt install ./Aqua-Nuqi.deb   # or: sudo dpkg -i Aqua-Nuqi.deb
# Launch from the app menu: "Aqua Nuqi"
```

Data is still under `~/.config/Aqua Nuqi/` (same wipe steps).

---

## 4. Windows — Setup.exe

1. Download `Aqua-Nuqi-Setup.exe` from the stable link above.
2. Run it (SmartScreen → **More info** → **Run anyway** if needed).
3. Install over any previous version — **do not uninstall first** if you want to keep data.
4. Open **Aqua Nuqi** from the Start menu / desktop shortcut.

Data folder: `%AppData%\Aqua Nuqi\`  
(= `C:\Users\<you>\AppData\Roaming\Aqua Nuqi\`).

Client-facing short guide: [`CLIENT-INSTALL-GUIDE.md`](./CLIENT-INSTALL-GUIDE.md).

---

## 5. Wipe / reset

**Quit the app completely first.**

### Packaged — Ubuntu full wipe (keep AppImage)

```bash
rm -rf ~/.config/Aqua\ Nuqi
# Optional — also clear generated PDFs:
rm -rf ~/Documents/AquaNuqi
```

Then run the AppImage again → first-run wizard.

### Packaged — Ubuntu soft reset (DB + backups + logos only)

```bash
rm -f ~/.config/Aqua\ Nuqi/data/aqua-nuqi.db \
      ~/.config/Aqua\ Nuqi/data/aqua-nuqi.db-*
rm -rf ~/.config/Aqua\ Nuqi/backups \
        ~/.config/Aqua\ Nuqi/logos
```

### Packaged — Windows full wipe

PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\Aqua Nuqi"
Remove-Item -Recurse -Force "$env:USERPROFILE\Documents\AquaNuqi" -ErrorAction SilentlyContinue
```

Or delete in Explorer: `C:\Users\<you>\AppData\Roaming\Aqua Nuqi`

### Dev profile only

```bash
npm run db:reset
```

---

## 6. Ubuntu — complete uninstall (one shot)

**Quit Aqua Nuqi first.** Paste once — removes AppImage(s), optional `.deb`, all business data,
updater cache, generated PDFs, and leftover desktop/menu shortcuts:

```bash
# Remove AppImage (Downloads + common alt location)
rm -f ~/Downloads/Aqua-Nuqi.AppImage \
      ~/Apps/Aqua-Nuqi.AppImage

# Remove .deb package if installed (ignore if not)
sudo apt remove -y aqua-nuqi 2>/dev/null || true

# Remove all app data + updater cache
rm -rf ~/.config/Aqua\ Nuqi \
       ~/.cache/aqua-nuqi-updater

# Optional leftovers
rm -rf ~/Documents/AquaNuqi
rm -f ~/.local/share/applications/*[Aa]qua*[Nn]uqi*.desktop \
      ~/Desktop/*[Aa]qua*[Nn]uqi* 2>/dev/null || true

echo "Aqua Nuqi fully removed."
```

If you only want a **fresh first-run** (keep the AppImage), use [§5](#5-wipe--reset) instead.

---

## 7. Where data lives

| Mode / platform         | User data folder         | Database                                |
| ----------------------- | ------------------------ | --------------------------------------- |
| **Dev** (`npm run dev`) | `<repo>/.tmp/Aqua Nuqi/` | `…/data/aqua-nuqi.db`                   |
| **Ubuntu packaged**     | `~/.config/Aqua Nuqi/`   | `~/.config/Aqua Nuqi/data/aqua-nuqi.db` |
| **Windows packaged**    | `%AppData%\Aqua Nuqi\`   | `…\data\aqua-nuqi.db`                   |

Also under user data: `backups/`, `logos/`, `logs/`, `attachments/`.

Generated PDFs (default):

| Platform    | Folder                              |
| ----------- | ----------------------------------- |
| **Ubuntu**  | `~/Documents/AquaNuqi/`             |
| **Windows** | `%USERPROFILE%\Documents\AquaNuqi\` |

---

## 8. Common recipes

### A. Fresh packaged build from GitHub (Ubuntu)

```bash
# 1) Quit Aqua Nuqi if it is open

# 2) Wipe previous packaged data
rm -rf ~/.config/Aqua\ Nuqi
rm -rf ~/Documents/AquaNuqi   # optional

# 3) Download stable AppImage
cd ~/Downloads
curl -L -o Aqua-Nuqi.AppImage \
  https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage

# 4) Run
chmod +x Aqua-Nuqi.AppImage
./Aqua-Nuqi.AppImage

# 5) First-run wizard → Set up a new business → test
```

**Upgrade test instead:** skip step 2; run the new AppImage over existing
`~/.config/Aqua Nuqi/` and confirm customers/settings remain.

### B. Fresh seeded local exploration

```bash
cd "/path/to/Aqua Nuqi"
npm run db:reset          # optional clean slate
npm run rebuild:electron  # if needed
npm run dev
# wizard → Set up a new business → Settings → About → Seed demo customers
```

---

## 9. After a wipe / reset

1. Start AppImage, Setup.exe, or `npm run dev`.
2. Complete first-run (**Set up a new business**, or restore a backup).
3. If in **dev mode**, optionally **Seed demo customers** (Settings → About).

How production upgrades keep data safe:  
[`07-data-lifecycle-and-upgrades.md`](./07-data-lifecycle-and-upgrades.md).
