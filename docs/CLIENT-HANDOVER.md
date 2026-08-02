# Aqua Nuqi — Client handover guide

This one-page guide is for the business owner. You do not need technical knowledge.
Keep a printed copy near the laptop.

---

## Where your data lives

All of your business records (customers, deliveries, bills, payments, expenses,
employee data, receipt photos) live on **this laptop only**, in a private folder:

**Windows:**  
`C:\Users\<your-name>\AppData\Roaming\Aqua Nuqi\`

That folder is **not** inside the program install folder. Updating Aqua Nuqi never
erases it.

> Tip: In File Explorer, paste `%APPDATA%\Aqua Nuqi` into the address bar and press Enter.

---

## Where backups go

Open **Settings → Backup**.

- **Primary folder** — usually inside the Aqua Nuqi data folder, or a folder you choose.
- **Secondary folder (strongly recommended)** — a USB drive, or a Google Drive / OneDrive
  folder that syncs to the cloud.

Each backup is a single file named like:

`aquanuqi-backup-20260802-1830-manual.zip`

It contains the database **and** all receipt photos / logos.

### Automatic backups

By default Aqua Nuqi also backs up:

- when you close the app
- once a day
- once a week

The green chip in the top bar says when the last backup succeeded. If it turns **red**,
open Settings → Backup and click **Backup now**.

---

## How to restore

1. Settings → Backup → **Choose file** (pick a `.zip` backup).
2. Click **Validate / preview** and check the customer count looks right.
3. Type the word `RESTORE` in the confirmation box.
4. Click **Restore now**. The app takes a safety snapshot of the current data first,
   then restarts.

If something goes wrong during restore, your previous data is still in the automatic
`pre_restore` safety backup.

You can also **Open read-only** to inspect an old backup without changing live data.

---

## Moving to a new laptop

1. On the **old** laptop: Settings → Backup → **Backup now**. Copy the `.zip` to a USB drive
   (or confirm it is in your cloud-synced folder).
2. On the **new** laptop: install Aqua Nuqi from the download link.
3. At first run, choose **Restore from a backup** and pick the `.zip`.
4. Check: customer count, this month’s revenue, and total outstanding match the old laptop.
5. Only then wipe or retire the old laptop.

---

## How updates arrive

- From version 1.0 onwards, Aqua Nuqi can download updates by itself (stable channel only).
  You will see a prompt; click to restart when convenient. A backup is taken before the
  update is applied.
- You can also install a new `Aqua-Nuqi-Setup.exe` over the old one. **Do not uninstall first.**
- If you ever see “this version is older than your data”, stop and install the latest version.
  Your data has not been changed.

**Portable USB build:** if you use `Aqua-Nuqi-Portable.exe`, its data lives in a folder named
`Aqua Nuqi Portable Data` next to the exe. That data is **separate** from the installed app.

---

## If the laptop dies or is stolen

1. Get another computer.
2. Install Aqua Nuqi.
3. Restore from the latest backup on your USB drive or cloud folder.

If you only ever backed up on the dead laptop and nowhere else, recovery may be impossible.
That is why the secondary (USB / Drive) folder matters.

---

## Passwords and recovery

- Owner password: minimum 8 characters. Do not share it.
- At setup (or later under Settings → Users & security) you can generate a **recovery code**.
  Write it down and store it somewhere safe — it is shown only once.
- Without the recovery code, the only way back in after a lost password is a backup taken
  when you still knew the password.

---

## Uninstalling

If you uninstall via Windows Settings → Apps:

- Your business data is **kept by default**.
- You will be asked whether to also delete business data. Choose **No** unless you are sure
  you have a verified backup elsewhere.

---

## Day-to-day reminder

1. Enter today’s deliveries every evening (Deliveries → Daily entry).
2. Record payments as they arrive.
3. At month end: generate bills → close the period → check Profit & Loss.
4. Glance at the backup chip — keep it green.

For a short workflow guide and keyboard shortcuts, open **Help** in the app sidebar.

---

## Support

When something looks wrong:

1. Settings → About → **Export diagnostics** (or Report a problem).
2. Send the zip file to your support contact. It contains logs and settings — **not** your
   full customer database.

Support contact: _[fill in before handover]_
