import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '@main/db/client'
import { areas, routes } from '@main/db/schema'
import type { CreateCustomerInput, ImportColumnKey } from '@shared/contracts'
import { isBusinessDate, todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { toPaisa } from '@shared/money'
import type { CustomerService } from './customer.service'
import type { MasterDataService } from './master-data.service'

const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  name: 'name',
  customer: 'name',
  customer_name: 'name',
  'customer name': 'name',
  type: 'type',
  customer_type: 'type',
  phone: 'phone',
  phone_primary: 'phone',
  mobile: 'phone',
  phone2: 'phone2',
  phone_secondary: 'phone2',
  whatsapp: 'whatsapp',
  address: 'address',
  area: 'area',
  route: 'route',
  rate: 'rate',
  billing_mode: 'billingMode',
  billingmode: 'billingMode',
  package_amount: 'packageAmount',
  packageamount: 'packageAmount',
  opening_balance: 'openingBalance',
  openingbalance: 'openingBalance',
  opening_bottles: 'openingBottles',
  openingbottles: 'openingBottles',
  opening_as_of: 'openingAsOf',
  openingasof: 'openingAsOf',
  deposit: 'deposit',
  security_deposit: 'deposit',
  joining_date: 'joiningDate',
  joined_on: 'joiningDate',
  notes: 'notes',
  code: 'code',
  email: 'email',
  landmark: 'landmark',
}

type ParsedSheet = { headers: string[]; rows: string[][] }

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64, 'base64')
}

function parseCsv(text: string): ParsedSheet {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const rows = lines.map(parseCsvLine)
  const headers = rows[0] ?? []
  return { headers, rows: rows.slice(1) }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

function parseWorkbook(fileName: string, base64: string): ParsedSheet {
  const lower = fileName.toLowerCase()
  const buf = decodeBase64(base64)
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return parseCsv(buf.toString('utf8'))
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx')
  const book = XLSX.read(buf, { type: 'buffer' })
  const sheetName = book.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [] }
  const sheet = book.Sheets[sheetName]!
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  if (aoa.length === 0) return { headers: [], rows: [] }
  const headers = (aoa[0] ?? []).map((h) => String(h).trim())
  const rows = aoa.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
  return { headers, rows: rows.filter((r) => r.some((c) => c.length > 0)) }
}

function suggestMapping(headers: string[]): Record<string, ImportColumnKey> {
  const mapping: Record<string, ImportColumnKey> = {}
  for (const h of headers) {
    const key =
      HEADER_ALIASES[h.trim().toLowerCase().replace(/\s+/g, '_')] ??
      HEADER_ALIASES[h.trim().toLowerCase()]
    mapping[h] = key ?? 'ignore'
  }
  return mapping
}

function parseMoneyCell(value: string): number | null {
  if (!value.trim()) return null
  try {
    return Number(toPaisa(value))
  } catch {
    throw new Error(`Invalid money value "${value}"`)
  }
}

function parseType(value: string): CreateCustomerInput['customerType'] {
  const v = value.trim().toLowerCase().replace(/\s+/g, '_')
  if (!v) return 'residential'
  if (v === 'residential' || v === 'home') return 'residential'
  if (v === 'commercial' || v === 'office' || v === 'shop') return 'commercial'
  if (v === 'walk_in' || v === 'walkin' || v === 'walk-in') return 'walk_in'
  throw new Error(`Unknown customer type "${value}"`)
}

function parseBillingMode(value: string): CreateCustomerInput['billingMode'] {
  const v = value.trim().toLowerCase().replace(/\s+/g, '_')
  if (!v || v === 'per_bottle' || v === 'per-bottle' || v === 'bottle') return 'per_bottle'
  if (v === 'monthly_package' || v === 'package' || v === 'monthly') return 'monthly_package'
  throw new Error(`Unknown billing mode "${value}"`)
}

type MappedRow = {
  row: number
  input: CreateCustomerInput
  areaName: string | null
  routeName: string | null
}

export function createCustomerImportService(
  db: AppDatabase,
  customers: CustomerService,
  master: MasterDataService,
) {
  function parseFile(fileName: string, base64: string) {
    const sheet = parseWorkbook(fileName, base64)
    if (sheet.headers.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'File has no header row')
    }
    return {
      headers: sheet.headers,
      suggestedMapping: suggestMapping(sheet.headers),
      previewRows: sheet.rows.slice(0, 10),
      totalRows: sheet.rows.length,
    }
  }

  function mapRows(
    fileName: string,
    base64: string,
    mapping: Record<string, ImportColumnKey>,
  ): { mapped: MappedRow[]; errors: { row: number; field?: string; message: string }[] } {
    const sheet = parseWorkbook(fileName, base64)
    const mapped: MappedRow[] = []
    const errors: { row: number; field?: string; message: string }[] = []

    sheet.rows.forEach((cells, index) => {
      const rowNum = index + 2 // 1-based + header
      const get = (key: ImportColumnKey): string => {
        const header = Object.entries(mapping).find(([, v]) => v === key)?.[0]
        if (!header) return ''
        const col = sheet.headers.indexOf(header)
        return col >= 0 ? (cells[col] ?? '') : ''
      }

      try {
        const name = get('name').trim()
        if (!name) {
          errors.push({ row: rowNum, field: 'name', message: 'Name is required' })
          return
        }

        const openingBalance = parseMoneyCell(get('openingBalance'))
        const rate = parseMoneyCell(get('rate'))
        const deposit = parseMoneyCell(get('deposit'))
        const packageAmount = parseMoneyCell(get('packageAmount'))
        const openingBottlesRaw = get('openingBottles').trim()
        const openingBottles = openingBottlesRaw ? Number(openingBottlesRaw) : 0
        if (openingBottlesRaw && (!Number.isInteger(openingBottles) || openingBottles < 0)) {
          throw new Error('Opening bottles must be a non-negative integer')
        }

        const openingAsOf = get('openingAsOf').trim() || null
        if (openingAsOf && !isBusinessDate(openingAsOf)) {
          throw new Error('Opening as-of must be YYYY-MM-DD')
        }
        if (((openingBalance ?? 0) !== 0 || openingBottles !== 0) && !openingAsOf) {
          throw new Error('Opening as-of is required when openings are non-zero')
        }

        const phone = get('phone').trim()
        if (phone && !/^[\d+\-\s()]{7,20}$/.test(phone)) {
          throw new Error('Invalid phone format')
        }

        const joiningDate = get('joiningDate').trim()
        if (joiningDate && !isBusinessDate(joiningDate)) {
          throw new Error('Joining date must be YYYY-MM-DD')
        }

        const input: CreateCustomerInput = {
          name,
          code: get('code').trim() || undefined,
          customerType: parseType(get('type')),
          phonePrimary: phone || null,
          phoneSecondary: get('phone2').trim() || null,
          whatsappNumber: get('whatsapp').trim() || null,
          email: get('email').trim() || null,
          addressLine: get('address').trim() || null,
          landmark: get('landmark').trim() || null,
          billingMode: parseBillingMode(get('billingMode')),
          packageAmount,
          openingBalance: openingBalance ?? 0,
          openingBottles,
          openingAsOf,
          securityDepositHeld: deposit ?? 0,
          joinedOn: joiningDate || todayBusinessDate(),
          notes: get('notes').trim() || null,
          rate: rate ?? undefined,
        }

        mapped.push({
          row: rowNum,
          input,
          areaName: get('area').trim() || null,
          routeName: get('route').trim() || null,
        })
      } catch (err) {
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return { mapped, errors }
  }

  function validate(
    fileName: string,
    base64: string,
    mapping: Record<string, ImportColumnKey>,
    opts: { createMissingAreas: boolean; createMissingRoutes: boolean },
  ) {
    const { mapped, errors } = mapRows(fileName, base64, mapping)
    const areaNames = new Set(
      db
        .select()
        .from(areas)
        .where(isNull(areas.deletedAt))
        .all()
        .map((a) => a.name.toLowerCase()),
    )
    const routeNames = new Set(
      db
        .select()
        .from(routes)
        .where(isNull(routes.deletedAt))
        .all()
        .map((r) => r.name.toLowerCase()),
    )

    const unknownAreas = new Set<string>()
    const unknownRoutes = new Set<string>()

    for (const m of mapped) {
      if (m.areaName && !areaNames.has(m.areaName.toLowerCase())) {
        unknownAreas.add(m.areaName)
        if (!opts.createMissingAreas) {
          errors.push({
            row: m.row,
            field: 'area',
            message: `Unknown area "${m.areaName}"`,
          })
        }
      }
      if (m.routeName && !routeNames.has(m.routeName.toLowerCase())) {
        unknownRoutes.add(m.routeName)
        if (!opts.createMissingRoutes) {
          errors.push({
            row: m.row,
            field: 'route',
            message: `Unknown route "${m.routeName}"`,
          })
        }
      }
    }

    // Deduplicate errors by row+message for count
    const validCount = mapped.filter((m) => !errors.some((e) => e.row === m.row)).length

    return {
      validCount,
      errorCount: errors.length,
      errors: errors.sort((a, b) => a.row - b.row),
      unknownAreas: [...unknownAreas].sort(),
      unknownRoutes: [...unknownRoutes].sort(),
      preview: mapped.slice(0, 20).map((m) => ({
        row: m.row,
        name: m.input.name,
        phone: m.input.phonePrimary ?? null,
        area: m.areaName,
        route: m.routeName,
        rate: m.input.rate ?? null,
        openingBalance: m.input.openingBalance ?? null,
        openingBottles: m.input.openingBottles ?? null,
      })),
    }
  }

  function commit(
    fileName: string,
    base64: string,
    mapping: Record<string, ImportColumnKey>,
    opts: {
      createMissingAreas: boolean
      createMissingRoutes: boolean
      userId?: number | null
    },
  ) {
    const preview = validate(fileName, base64, mapping, opts)
    if (preview.errorCount > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Import blocked: ${preview.errorCount} row error(s). Fix them and try again.`,
        { errors: preview.errors },
      )
    }

    const { mapped } = mapRows(fileName, base64, mapping)
    let areasCreated = 0
    let routesCreated = 0
    let imported = 0

    // All-or-nothing: one transaction. customer.create already uses transactions —
    // use a single outer transaction with manual inserts would be complex; instead
    // validate fully first (done), then import sequentially inside one db.transaction
    // by calling create which nests transactions (better-sqlite3 supports savepoints
    // via drizzle nested transactions). Simpler: do everything in one transaction
    // without calling create's own transaction — but create wraps itself.
    // Approach: pre-create areas/routes, then create customers; if any throws, we
    // cannot roll back prior creates unless we wrap. Use raw transaction + recreate logic.

    db.transaction(() => {
      for (const m of mapped) {
        let areaId: number | null = null
        let routeId: number | null = null

        if (m.areaName) {
          const existing = db
            .select()
            .from(areas)
            .where(and(eq(areas.name, m.areaName), isNull(areas.deletedAt)))
            .get()
          if (existing) {
            areaId = existing.id
          } else if (opts.createMissingAreas) {
            areaId = master.getOrCreateAreaByName(m.areaName, opts.userId)
            areasCreated += 1
          }
        }

        if (m.routeName) {
          const existing = db
            .select()
            .from(routes)
            .where(and(eq(routes.name, m.routeName), isNull(routes.deletedAt)))
            .get()
          if (existing) {
            routeId = existing.id
          } else if (opts.createMissingRoutes) {
            routeId = master.getOrCreateRouteByName(m.routeName, areaId, opts.userId)
            routesCreated += 1
          }
        }

        customers.create({ ...m.input, areaId, routeId }, opts.userId)
        imported += 1
      }
    })

    return { imported, areasCreated, routesCreated }
  }

  function template(): { fileName: string; mimeType: string; base64: string } {
    const headers = [
      'name',
      'type',
      'phone',
      'phone2',
      'whatsapp',
      'address',
      'area',
      'route',
      'rate',
      'billing_mode',
      'package_amount',
      'opening_balance',
      'opening_bottles',
      'opening_as_of',
      'deposit',
      'joining_date',
      'notes',
    ]
    const sample = [
      'Ali Khan',
      'residential',
      '03001234567',
      '',
      '03001234567',
      'House 12, Street 4',
      'Gulberg',
      'Gulberg Morning',
      '60',
      'per_bottle',
      '',
      '3500',
      '4',
      '2026-07-01',
      '2000',
      '2025-01-15',
      'Ring bell twice',
    ]
    const csv = `${headers.join(',')}\n${sample.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(',')}\n`
    return {
      fileName: 'aqua-nuqi-customers-template.csv',
      mimeType: 'text/csv',
      base64: Buffer.from(csv, 'utf8').toString('base64'),
    }
  }

  return { parseFile, validate, commit, template }
}

export type CustomerImportService = ReturnType<typeof createCustomerImportService>
