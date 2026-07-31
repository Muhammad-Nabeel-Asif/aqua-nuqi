import { useState } from 'react'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import type {
  ImportColumnKey,
  ParseImportFileOutput,
  ValidateImportOutput,
} from '@shared/contracts'

export function ImportWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null)
  const [parsed, setParsed] = useState<ParseImportFileOutput>()
  const [validation, setValidation] = useState<ValidateImportOutput>()
  const [map, setMap] = useState<Record<string, ImportColumnKey>>({})
  const [areas, setAreas] = useState(false)
  const [routes, setRoutes] = useState(false)
  function readFile(f: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? ''
      setFile({ name: f.name, base64 })
      void api.customers.importParse({ fileName: f.name, base64 }).then((r) => {
        setParsed(r)
        setMap(r.suggestedMapping as Record<string, ImportColumnKey>)
      })
    }
    reader.readAsDataURL(f)
  }
  async function validate() {
    if (!file) return
    setValidation(
      await api.customers.importValidate({
        fileName: file.name,
        base64: file.base64,
        mapping: map,
        createMissingAreas: areas,
        createMissingRoutes: routes,
      }),
    )
  }
  async function commit() {
    if (!file) return
    const r = await api.customers.importCommit({
      fileName: file.name,
      base64: file.base64,
      mapping: map,
      createMissingAreas: areas,
      createMissingRoutes: routes,
    })
    toast({ title: `Imported ${r.imported} customers`, variant: 'success' })
    onSaved()
  }
  async function template() {
    const r = await api.customers.importTemplate()
    const a = document.createElement('a')
    a.href = `data:${r.mimeType};base64,${r.base64}`
    a.download = r.fileName
    a.click()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Import customers</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="my-5 flex gap-2">
          <Button variant="outline" onClick={() => void template()}>
            Download template
          </Button>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
        </div>
        {parsed && (
          <>
            <h3 className="font-semibold">Column mapping</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {parsed.headers.map((h: string) => (
                <label className="text-sm" key={h}>
                  {h}
                  <select
                    className="mt-1 h-8 w-full rounded border"
                    value={map[h] ?? 'ignore'}
                    onChange={(e) =>
                      setMap({
                        ...map,
                        [h]: e.target.value as ImportColumnKey,
                      })
                    }
                  >
                    {[
                      'ignore',
                      'name',
                      'type',
                      'phone',
                      'whatsapp',
                      'address',
                      'area',
                      'route',
                      'rate',
                      'openingBalance',
                      'openingBottles',
                      'code',
                      'email',
                      'notes',
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm">
              <input type="checkbox" checked={areas} onChange={(e) => setAreas(e.target.checked)} />{' '}
              Create missing areas
            </label>
            <label className="block text-sm">
              <input
                type="checkbox"
                checked={routes}
                onChange={(e) => setRoutes(e.target.checked)}
              />{' '}
              Create missing routes
            </label>
            <Button className="mt-4" onClick={() => void validate()}>
              Validate preview
            </Button>
          </>
        )}
        {validation && (
          <div className="mt-5">
            <h3 className="font-semibold">
              {validation.validCount} valid, {validation.errorCount} errors
            </h3>
            <ul className="mt-2 text-sm text-destructive">
              {validation.errors.map((e) => (
                <li key={`${e.row}-${e.field}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
            <Button
              className="mt-4"
              disabled={validation.errorCount > 0}
              onClick={() => void commit()}
            >
              Commit import
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
