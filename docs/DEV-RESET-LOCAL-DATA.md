# Local install, re-test & reset (Ubuntu + Windows)

One place for: download a GitHub build, run it, wipe local data, and start over.  
**Wiping deletes business data on this machine** — never use these delete commands on a PC that
holds real client data you care about.

---

## 1. Download a build from GitHub

**Always-latest stable** (what the client should use):

| Platform          | Link                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Windows installer | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe |
| Ubuntu AppImage   | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage  |
| Debian `.deb`     | https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.deb       |

Or open https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases and pick a specific tag
(e.g. after a Phase 4 review-fix release). Prefer **Latest** / non–pre-release for upgrade tests.

---

## 2. Ubuntu — AppImage (usual local test path)

### First install / run

```bash
# Example: Downloads folder
cd ~/Downloads

# Make executable (once per new file)
chmod +x Aqua-Nuqi.AppImage

# Run (no installer; does not need sudo)
./Aqua-Nuqi.AppImage
```

If the desktop environment blocks it, right-click → **Properties** → allow running as program,  
or: **Allow Launching** when prompted.

Optional — put it somewhere stable:

```bash
mkdir -p ~/Apps
mv ~/Downloads/Aqua-Nuqi.AppImage ~/Apps/
chmod +x ~/Apps/Aqua-Nuqi.AppImage
~/Apps/Aqua-Nuqi.AppImage
```

On **first launch** you get the setup wizard → **Set up a new business** (or restore a backup).

### Important: AppImage vs data

| Piece         | Location                            | Replaced when you download a new AppImage? |
| ------------- | ----------------------------------- | ------------------------------------------ |
| App binary    | The `.AppImage` file you downloaded | Yes — you replace the file                 |
| Business data | `~/.config/Aqua Nuqi/`              | **No** — stays until you delete it         |

So: updating the AppImage does **not** clear customers/invoices. To test “fresh install”, wipe
user data (section 4).

### Update to a newer AppImage (keep data)

1. Quit Aqua Nuqi.
2. Download the new `Aqua-Nuqi.AppImage`.
3. `chmod +x` the new file; replace the old AppImage path you use.
4. Run it again — same DB under `~/.config/Aqua Nuqi/`.

### Debian package (optional)

```bash
cd ~/Downloads
sudo apt install ./Aqua-Nuqi.deb   # or: sudo dpkg -i Aqua-Nuqi.deb
# Then launch from the app menu: "Aqua Nuqi"
```

Data is still under `~/.config/Aqua Nuqi/` (same wipe steps).

---

## 3. Windows — Setup.exe (for upgrade-matrix tests)

1. Download `Aqua-Nuqi-Setup.exe` from the stable link above.
2. Run it (SmartScreen → **More info** → **Run anyway** if needed).
3. Install over any previous version — **do not uninstall first** if you want to keep data.
4. Open **Aqua Nuqi** from the Start menu / desktop shortcut.

Data folder: `%AppData%\Aqua Nuqi\`  
(= `C:\Users\<you>\AppData\Roaming\Aqua Nuqi\`).

Client-facing short guide: [`CLIENT-INSTALL-GUIDE.md`](./CLIENT-INSTALL-GUIDE.md).

---

## 4. Where data lives

| Platform           | User data folder       | Database                                |
| ------------------ | ---------------------- | --------------------------------------- |
| **Ubuntu / Linux** | `~/.config/Aqua Nuqi/` | `~/.config/Aqua Nuqi/data/aqua-nuqi.db` |
| **Windows**        | `%AppData%\Aqua Nuqi\` | `…\data\aqua-nuqi.db`                   |

Also under user data: `backups/`, `logos/`, `logs/`, `attachments/`.

Generated PDFs (default):

| Platform    | Folder                              |
| ----------- | ----------------------------------- |
| **Ubuntu**  | `~/Documents/AquaNuqi/`             |
| **Windows** | `%USERPROFILE%\Documents\AquaNuqi\` |

---

## 5. Wipe and start over (fresh first-run)

**Quit the app completely first.**

### Ubuntu — full wipe (recommended)

```bash
rm -rf ~/.config/Aqua\ Nuqi
# Optional — also clear generated PDFs:
rm -rf ~/Documents/AquaNuqi
```

Then run the AppImage again → first-run wizard.

### Ubuntu — soft reset (DB + backups + logos only)

```bash
rm -f ~/.config/Aqua\ Nuqi/data/aqua-nuqi.db \
      ~/.config/Aqua\ Nuqi/data/aqua-nuqi.db-*
rm -rf ~/.config/Aqua\ Nuqi/backups \
        ~/.config/Aqua\ Nuqi/logos
```

### Windows — full wipe

PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\Aqua Nuqi"
Remove-Item -Recurse -Force "$env:USERPROFILE\Documents\AquaNuqi" -ErrorAction SilentlyContinue
```

Or delete in Explorer: `C:\Users\<you>\AppData\Roaming\Aqua Nuqi`

---

## 6. Typical “test a new GitHub build from scratch” (Ubuntu)

```bash
# 1) Quit Aqua Nuqi if it is open

# 2) Wipe previous test data
rm -rf ~/.config/Aqua\ Nuqi
rm -rf ~/Documents/AquaNuqi   # optional

# 3) Get the build you want
cd ~/Downloads
# stable:
curl -L -o Aqua-Nuqi.AppImage \
  https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage
# or download a specific tag from the Releases page in the browser

# 4) Run
chmod +x Aqua-Nuqi.AppImage
./Aqua-Nuqi.AppImage

# 5) First-run wizard → Set up a new business → test
```

To test **upgrade** instead of fresh: skip step 2, install/run the new AppImage over existing
`~/.config/Aqua Nuqi/` data, confirm customers/settings still there.

---

## 7. `npm run db:reset` — what it does _not_ do

```bash
npm run db:reset
```

Only deletes the **dev** folder `<repo>/.tmp/userData` (or `AQUA_NUQI_USER_DATA` if set).

It does **not** clear `~/.config/Aqua Nuqi/` used by AppImage, `.deb`, or normal Electron runs.
For those, use section 5.

---

## 8. After a wipe

1. Start the AppImage / Setup.exe / `npm run dev`.
2. Complete first-run (**Set up a new business**, or restore a backup).
3. Optional: seed demo data if the build exposes it (`dev:seedDemo` / Settings → About).

How production upgrades keep data safe:  
[`07-data-lifecycle-and-upgrades.md`](./07-data-lifecycle-and-upgrades.md).
