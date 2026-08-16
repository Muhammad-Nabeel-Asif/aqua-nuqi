import { useQuery } from '@tanstack/react-query'
import { AppLogo, BRAND_NAME } from '@renderer/brand'
import { PageHeader } from '@renderer/components/PageHeader'
import { api } from '@renderer/lib/api'

export function HelpPage() {
  const status = useQuery({
    queryKey: ['setup', 'status'],
    queryFn: () => api.setup.status(),
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <AppLogo size="lg" title={BRAND_NAME} />
        <PageHeader title="Help" subtitle={`How a normal month works in ${BRAND_NAME}`} />
      </div>

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
            <strong>Generate bills at month end</strong> — Billing → Generate bills for this month
            while it is still open.
          </li>
          <li>
            <strong>Lock this billing month</strong> after bills are sent so historical numbers
            cannot change by accident.
          </li>
          <li>
            <strong>Check profit</strong> on Reports → Profit (income minus costs), and confirm a
            fresh backup exists.
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
            {status.data?.dbPath ? (
              <p>
                On this computer the database is:{' '}
                <code className="break-all text-xs">{status.data.dbPath}</code>. Backups go to the
                folder you chose under Settings → Backup
                {status.data.defaultBackupFolder
                  ? ` (default: ${status.data.defaultBackupFolder})`
                  : ''}
                .
              </p>
            ) : (
              <p>
                Look under Settings → Backup for this computer&apos;s data folder. Windows uses
                AppData\Roaming\Aqua Nuqi; macOS uses Library/Application Support/Aqua Nuqi; Linux
                uses ~/.config/Aqua Nuqi (development builds may use a project .tmp folder).
              </p>
            )}
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
              On the login screen choose &quot;Forgot owner password&quot; and enter the recovery
              code (shown once at setup, or regenerated under Settings → Users &amp; security).
              Without a recovery code, restore from a backup taken when you still knew the password.
            </p>
          </div>
          <div>
            <p className="font-medium">What are Given and Taken back on Daily entry?</p>
            <p>
              <strong>Given</strong> is filled bottles you handed over today — that is what you
              bill. <strong>Taken back</strong> is empty bottles you collected (not billed; it
              updates bottles sitting with the customer). If you leave Taken back blank on a new
              row, it copies Given (a 1-for-1 swap). Given 0 with Taken back filled is a return with
              no sale.
            </p>
          </div>
          <div>
            <p className="font-medium">How do I practise without touching live data?</p>
            <p>
              Use a separate portable install or restore a backup into a copy of the data folder.
              Demo seed data is for development builds only — do not clear production data to
              practise.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
