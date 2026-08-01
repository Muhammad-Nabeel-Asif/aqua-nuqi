import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { api } from '@renderer/lib/api'
import { InvoiceTemplate } from '@renderer/print/templates/InvoiceTemplate'
import { AppError } from '@shared/errors'
import '@renderer/print/print.css'

export function InvoiceSettingsPanel() {
  const qc = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ['settings', 'invoice'],
    queryFn: () => api.settings.get(),
  })
  const headerQuery = useQuery({
    queryKey: ['pdf', 'businessHeader'],
    queryFn: () => api.pdf.businessHeader(),
  })
  const [form, setForm] = useState({
    accentColour: '#0284c7',
    showBottleBalance: true,
    showRateColumn: true,
    footerNote: '',
    termsText: '',
    defaultPageSize: 'A4',
    defaultPrinter: '',
    defaultThermalPrinter: '',
    whatsappTemplate: '',
    documentsFolder: '',
    logoPath: '',
  })

  useEffect(() => {
    const v = settingsQuery.data?.values
    if (!v) return
    setForm({
      accentColour: String(v['invoice.accentColour'] ?? '#0284c7'),
      showBottleBalance: Boolean(v['invoice.showBottleBalance']),
      showRateColumn: Boolean(v['invoice.showRateColumn']),
      footerNote: String(v['invoice.footerNote'] ?? ''),
      termsText: String(v['invoice.termsText'] ?? ''),
      defaultPageSize: String(v['invoice.defaultPageSize'] ?? 'A4'),
      defaultPrinter: String(v['print.defaultPrinter'] ?? ''),
      defaultThermalPrinter: String(v['print.defaultThermalPrinter'] ?? ''),
      whatsappTemplate: String(v['invoice.whatsappTemplate'] ?? ''),
      documentsFolder: String(v['documents.folder'] ?? ''),
      logoPath: String(v['business.logoPath'] ?? ''),
    })
  }, [settingsQuery.data])

  const preview = useMemo(() => {
    const h = headerQuery.data
    const business = {
      name: h?.name ?? String(settingsQuery.data?.values['business.name'] ?? 'Aqua Nuqi'),
      address: h?.address ?? String(settingsQuery.data?.values['business.address'] ?? ''),
      phone: h?.phone ?? String(settingsQuery.data?.values['business.phone'] ?? ''),
      phone2: h?.phone2 ?? String(settingsQuery.data?.values['business.phone2'] ?? ''),
      email: h?.email ?? String(settingsQuery.data?.values['business.email'] ?? ''),
      bankDetails:
        h?.bankDetails ?? String(settingsQuery.data?.values['business.bankDetails'] ?? ''),
      taxNumber: h?.taxNumber ?? String(settingsQuery.data?.values['business.taxNumber'] ?? ''),
      logoDataUrl: h?.logoDataUrl ?? null,
      accentColour: form.accentColour,
      footerNote: form.footerNote,
      termsText: form.termsText,
      showBottleBalance: form.showBottleBalance,
      showRateColumn: form.showRateColumn,
      currencySymbol: String(settingsQuery.data?.values['locale.currencySymbol'] ?? 'Rs'),
      decimalPlaces: Number(settingsQuery.data?.values['locale.decimalPlaces'] ?? 0),
    }
    return (
      <div className="origin-top scale-[0.55]">
        <InvoiceTemplate
          business={business}
          invoice={{
            invoiceNo: 'INV-2026-07-0001',
            period: '2026-07',
            periodStart: '2026-07-01',
            periodEnd: '2026-07-31',
            issueDate: '2026-08-01',
            dueDate: '2026-08-11',
            openingBalance: 50000,
            deliveriesQty: 12,
            deliveriesTotal: 72000,
            chargesTotal: 0,
            discountTotal: 0,
            taxTotal: 0,
            invoiceTotal: 72000,
            totalPayable: 122000,
            bottlesWithCustomerAtIssue: 4,
            status: 'issued',
            lines: [
              {
                lineNo: 1,
                lineType: 'delivery',
                lineDate: '2026-07-05',
                description: '19 L Bottle',
                quantity: 2,
                rate: 6000,
                amount: 12000,
              },
              {
                lineNo: 2,
                lineType: 'delivery',
                lineDate: '2026-07-12',
                description: '19 L Bottle',
                quantity: 3,
                rate: 6000,
                amount: 18000,
              },
            ],
          }}
          customer={{
            code: 'C-0001',
            name: 'علی خان',
            addressLine: 'Model Town',
            phonePrimary: '03001234567',
            phoneSecondary: null,
            securityDepositHeld: 200000,
          }}
          emptiesReturned={10}
          amountInWords="Rupees One Thousand Two Hundred Twenty Only"
          generatedAt={new Date().toISOString()}
        />
      </div>
    )
  }, [form, settingsQuery.data, headerQuery.data])

  async function save() {
    try {
      await api.settings.setMany({
        values: {
          'invoice.accentColour': form.accentColour,
          'invoice.showBottleBalance': form.showBottleBalance,
          'invoice.showRateColumn': form.showRateColumn,
          'invoice.footerNote': form.footerNote,
          'invoice.termsText': form.termsText,
          'invoice.defaultPageSize': form.defaultPageSize,
          'invoice.whatsappTemplate': form.whatsappTemplate,
          'documents.folder': form.documentsFolder,
          'print.defaultPrinter': form.defaultPrinter,
          'print.defaultThermalPrinter': form.defaultThermalPrinter,
        },
      })
      await qc.invalidateQueries({ queryKey: ['settings'] })
      await qc.invalidateQueries({ queryKey: ['pdf', 'businessHeader'] })
      toast({ title: 'Invoice settings saved', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof AppError ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function pickLogo() {
    const r = await api.dialog.pickFile({
      title: 'Choose logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    })
    if (!r.path) return
    try {
      const up = await api.pdf.uploadLogo(r.path)
      setForm((f) => ({ ...f, logoPath: up.logoPath }))
      await qc.invalidateQueries({ queryKey: ['settings'] })
      await qc.invalidateQueries({ queryKey: ['pdf', 'businessHeader'] })
      toast({ title: 'Logo uploaded', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Logo upload failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      })
    }
  }

  async function pickFolder() {
    const r = await api.dialog.pickFolder({ title: 'Documents folder for PDFs' })
    if (r.path) setForm((f) => ({ ...f, documentsFolder: r.path! }))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="max-w-xl space-y-3">
        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void pickLogo()}>
              Upload logo
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {form.logoPath || 'No logo'}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Accent colour</Label>
          <Input
            type="color"
            value={form.accentColour}
            onChange={(e) => setForm({ ...form, accentColour: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.showBottleBalance}
            onChange={(e) => setForm({ ...form, showBottleBalance: e.target.checked })}
          />
          Show bottle balance box
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.showRateColumn}
            onChange={(e) => setForm({ ...form, showRateColumn: e.target.checked })}
          />
          Show rate column
        </label>
        <div className="space-y-1.5">
          <Label>Default receipt page size</Label>
          <select
            className="flex h-9 w-full rounded-md border px-3 text-sm"
            value={form.defaultPageSize}
            onChange={(e) => setForm({ ...form, defaultPageSize: e.target.value })}
          >
            <option value="A4">A5 / A4 (standard receipt)</option>
            <option value="thermal">Thermal 80 mm (receipts)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Default printer (A4 / invoices)</Label>
          <Input
            value={form.defaultPrinter}
            onChange={(e) => setForm({ ...form, defaultPrinter: e.target.value })}
            placeholder="System default if empty"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Default thermal printer</Label>
          <Input
            value={form.defaultThermalPrinter}
            onChange={(e) => setForm({ ...form, defaultThermalPrinter: e.target.value })}
            placeholder="Device name for 80 mm receipts / slips"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Footer note</Label>
          <textarea
            className="min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
            value={form.footerNote}
            onChange={(e) => setForm({ ...form, footerNote: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Terms text</Label>
          <textarea
            className="min-h-[60px] w-full rounded-md border px-3 py-2 text-sm"
            value={form.termsText}
            onChange={(e) => setForm({ ...form, termsText: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp message template</Label>
          <textarea
            className="min-h-[120px] w-full rounded-md border px-3 py-2 font-mono text-xs"
            value={form.whatsappTemplate}
            onChange={(e) => setForm({ ...form, whatsappTemplate: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {
              'Placeholders: {customerName} {period} {units} {amount} {previousBalance} {totalPayable} {dueDate} {businessName}'
            }
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Documents folder</Label>
          <div className="flex gap-2">
            <Input
              value={form.documentsFolder}
              onChange={(e) => setForm({ ...form, documentsFolder: e.target.value })}
              placeholder="Default: Documents/AquaNuqi"
            />
            <Button type="button" variant="outline" onClick={() => void pickFolder()}>
              Browse
            </Button>
          </div>
        </div>
        <Button onClick={() => void save()}>Save invoice settings</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-slate-100 p-2">
        <div className="mb-2 text-xs font-medium text-slate-600">Live preview</div>
        <div className="h-[640px] overflow-auto bg-white">{preview}</div>
      </div>
    </div>
  )
}
