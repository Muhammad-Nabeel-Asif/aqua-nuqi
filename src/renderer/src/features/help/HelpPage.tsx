import { PageHeader } from '@renderer/components/PageHeader'

export function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="Help" subtitle="How a normal month works in Aqua Nuqi" />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How a normal month works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Enter deliveries daily</strong> — open Deliveries → Daily entry each evening and
            type units from the drivers&apos; slips (keyboard only).
          </li>
          <li>
            <strong>Record payments</strong> as customers pay — cash, bank, JazzCash, etc.
          </li>
          <li>
            <strong>Generate bills at month end</strong> — Billing → Generate bills for the closed
            month.
          </li>
          <li>
            <strong>Close the period</strong> so historical numbers cannot change by accident.
          </li>
          <li>
            <strong>Check profit</strong> on Reports → Profit &amp; Loss, and confirm a fresh backup
            exists.
          </li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <kbd>Ctrl</kbd>+<kbd>K</kbd> — command palette / jump to any screen
          </li>
          <li>
            Daily entry: arrow keys move cells, <kbd>Enter</kbd> saves and moves down,{' '}
            <kbd>Tab</kbd> moves right, <kbd>Esc</kbd> cancels
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">FAQ</h2>
        <div className="space-y-3 text-sm text-slate-700">
          <div>
            <p className="font-medium">Where is my data?</p>
            <p>
              On Windows: <code>AppData\Roaming\Aqua Nuqi</code>. Backups are in the Backup folder
              you chose under Settings → Backup.
            </p>
          </div>
          <div>
            <p className="font-medium">What if the laptop dies?</p>
            <p>
              Install Aqua Nuqi on another computer and restore the latest backup zip from your USB
              or cloud-synced folder.
            </p>
          </div>
          <div>
            <p className="font-medium">Do updates erase my data?</p>
            <p>
              No. Install the new version over the old one. Never uninstall first unless you have a
              verified backup.
            </p>
          </div>
          <div>
            <p className="font-medium">I forgot the owner password</p>
            <p>
              Use the recovery code shown once at setup (if you saved it), or restore from a backup
              taken when you still knew the password.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
