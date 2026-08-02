import fs from 'node:fs'
import path from 'node:path'
import type { AppDatabase, RawDatabase } from '@main/db/client'
import type { BalanceService } from './balance.service'

export type IntegrityIssue = {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: 'pragma' | 'ledger' | 'balances' | 'stock' | 'invoices' | 'deliveries' | 'attachments'
  message: string
  details?: string
  fixable: boolean
  fixAction?: 'recalculate_balances' | 'none'
}

export type IntegrityReport = {
  ranAt: string
  pragmaOk: boolean
  issues: IntegrityIssue[]
  tableCounts: Record<string, number>
  dbSizeBytes: number
  oldestTransactionDate: string | null
  newestTransactionDate: string | null
}

export type MaintenanceStats = {
  dbSizeBytes: number
  tableCounts: Record<string, number>
  oldestTransactionDate: string | null
  newestTransactionDate: string | null
}

function tableExists(raw: RawDatabase, name: string): boolean {
  const row = raw
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | undefined
  return Boolean(row)
}

export function createIntegrityService(deps: {
  db: AppDatabase
  raw: RawDatabase
  balances: BalanceService
  getDbPath: () => string
  getUserData: () => string
}) {
  function collectTableCounts(): Record<string, number> {
    const rows = deps.raw
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
         ORDER BY name`,
      )
      .all() as { name: string }[]
    const counts: Record<string, number> = {}
    for (const { name } of rows) {
      try {
        const row = deps.raw
          .prepare(`SELECT count(*) AS c FROM "${name.replace(/"/g, '""')}"`)
          .get() as { c: number }
        counts[name] = Number(row.c)
      } catch {
        counts[name] = -1
      }
    }
    return counts
  }

  function transactionDateRange(): { oldest: string | null; newest: string | null } {
    const dates: string[] = []
    const queries: [string, string][] = [
      ['deliveries', 'delivery_date'],
      ['payments', 'payment_date'],
      ['expenses', 'expense_date'],
      ['invoices', 'issue_date'],
      ['ledger_entries', 'entry_date'],
    ]
    for (const [table, col] of queries) {
      if (!tableExists(deps.raw, table)) continue
      try {
        const row = deps.raw
          .prepare(`SELECT min(${col}) AS mn, max(${col}) AS mx FROM ${table}`)
          .get() as { mn: string | null; mx: string | null }
        if (row.mn) dates.push(row.mn)
        if (row.mx) dates.push(row.mx)
      } catch {
        // ignore
      }
    }
    if (dates.length === 0) return { oldest: null, newest: null }
    dates.sort()
    return { oldest: dates[0], newest: dates[dates.length - 1] }
  }

  function getStats(): MaintenanceStats {
    let dbSizeBytes = 0
    try {
      dbSizeBytes = fs.statSync(deps.getDbPath()).size
    } catch {
      dbSizeBytes = 0
    }
    const range = transactionDateRange()
    return {
      dbSizeBytes,
      tableCounts: collectTableCounts(),
      oldestTransactionDate: range.oldest,
      newestTransactionDate: range.newest,
    }
  }

  function checkLedgerChains(issues: IntegrityIssue[]): void {
    if (!tableExists(deps.raw, 'ledger_entries')) return
    const rows = deps.raw
      .prepare(
        `SELECT id, customer_id, entry_date, id as sort_id, debit, credit, balance_after
         FROM ledger_entries
         ORDER BY customer_id, entry_date, id`,
      )
      .all() as Array<{
      id: number
      customer_id: number
      entry_date: string
      debit: number
      credit: number
      balance_after: number
    }>

    let prevCustomer = -1
    let running = 0
    let broken = 0
    for (const row of rows) {
      if (row.customer_id !== prevCustomer) {
        prevCustomer = row.customer_id
        running = 0
      }
      running = running + row.debit - row.credit
      if (running !== row.balance_after) {
        broken++
        if (broken <= 5) {
          issues.push({
            id: `ledger-chain-${row.id}`,
            severity: 'error',
            category: 'ledger',
            message: `Ledger balance_after mismatch for entry #${row.id} (customer ${row.customer_id})`,
            details: `Expected ${running}, stored ${row.balance_after}`,
            fixable: false,
            fixAction: 'none',
          })
        }
      }
    }
    if (broken > 5) {
      issues.push({
        id: 'ledger-chain-more',
        severity: 'error',
        category: 'ledger',
        message: `${broken - 5} additional ledger chain mismatches (showing first 5)`,
        fixable: false,
        fixAction: 'none',
      })
    }
  }

  function checkCustomerBalances(issues: IntegrityIssue[]): void {
    if (!tableExists(deps.raw, 'customer_balances') || !tableExists(deps.raw, 'customers')) return
    const customers = deps.raw
      .prepare(`SELECT id FROM customers WHERE deleted_at IS NULL`)
      .all() as { id: number }[]
    let mismatches = 0
    for (const { id } of customers) {
      const liveBal = deps.balances.computeLiveBalance(id)
      const liveBot = deps.balances.computeLiveBottles(id)
      const summary = deps.raw
        .prepare(
          `SELECT balance, bottles_with_customer FROM customer_balances WHERE customer_id = ?`,
        )
        .get(id) as { balance: number; bottles_with_customer: number } | undefined
      if (!summary) {
        mismatches++
        if (mismatches <= 10) {
          issues.push({
            id: `balance-missing-${id}`,
            severity: 'error',
            category: 'balances',
            message: `customer_balances row missing for customer #${id}`,
            details: `live balance=${liveBal} bottles=${liveBot}; summary row absent`,
            fixable: true,
            fixAction: 'recalculate_balances',
          })
        }
        continue
      }
      if (summary.balance !== liveBal || summary.bottles_with_customer !== liveBot) {
        mismatches++
        if (mismatches <= 10) {
          issues.push({
            id: `balance-mismatch-${id}`,
            severity: 'error',
            category: 'balances',
            message: `customer_balances out of sync for customer #${id}`,
            details: `summary balance=${summary.balance} bottles=${summary.bottles_with_customer}; live balance=${liveBal} bottles=${liveBot}`,
            fixable: true,
            fixAction: 'recalculate_balances',
          })
        }
      }
    }
    if (mismatches > 10) {
      issues.push({
        id: 'balance-mismatch-more',
        severity: 'error',
        category: 'balances',
        message: `${mismatches - 10} additional customer_balances mismatches`,
        fixable: true,
        fixAction: 'recalculate_balances',
      })
    }
  }

  function checkStockVsBottles(issues: IntegrityIssue[]): void {
    if (!tableExists(deps.raw, 'stock_movements') || !tableExists(deps.raw, 'customer_balances')) {
      return
    }
    // Compare total with_customers from stock movements vs sum of customer_balances
    const stockRow = deps.raw
      .prepare(
        `SELECT coalesce(sum(
           CASE
             WHEN to_location = 'customer' THEN quantity
             WHEN from_location = 'customer' THEN -quantity
             ELSE 0
           END
         ), 0) AS with_customers
         FROM stock_movements`,
      )
      .get() as { with_customers: number }
    // Reversals are separate opposite rows — the sum above already nets them.
    const balRow = deps.raw
      .prepare(
        `SELECT coalesce(sum(bottles_with_customer), 0) AS bottles
         FROM customer_balances`,
      )
      .get() as { bottles: number }
    if (Number(stockRow.with_customers) !== Number(balRow.bottles)) {
      issues.push({
        id: 'stock-vs-balances',
        severity: 'warning',
        category: 'stock',
        message: 'Stock movements total with customers does not match customer_balances bottles',
        details: `stock=${stockRow.with_customers}, customer_balances=${balRow.bottles}. Not auto-fixable: recalculate_balances only heals the customer side; if stock movements are wrong, investigate movements manually.`,
        fixable: false,
        fixAction: 'none',
      })
    }
  }

  function checkInvoices(issues: IntegrityIssue[]): void {
    if (!tableExists(deps.raw, 'invoices') || !tableExists(deps.raw, 'invoice_lines')) return
    const orphans = deps.raw
      .prepare(
        `SELECT i.id, i.invoice_no FROM invoices i
         WHERE i.status != 'void'
           AND NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)
         LIMIT 20`,
      )
      .all() as { id: number; invoice_no: string }[]
    for (const row of orphans) {
      issues.push({
        id: `invoice-no-lines-${row.id}`,
        severity: 'warning',
        category: 'invoices',
        message: `Invoice ${row.invoice_no} has no lines`,
        fixable: false,
        fixAction: 'none',
      })
    }
  }

  function checkDeliveries(issues: IntegrityIssue[]): void {
    if (!tableExists(deps.raw, 'deliveries') || !tableExists(deps.raw, 'invoices')) return
    const rows = deps.raw
      .prepare(
        `SELECT d.id, d.invoice_id FROM deliveries d
         JOIN invoices i ON i.id = d.invoice_id
         WHERE d.status = 'recorded' AND i.status = 'void'
         LIMIT 20`,
      )
      .all() as { id: number; invoice_id: number }[]
    for (const row of rows) {
      issues.push({
        id: `delivery-void-invoice-${row.id}`,
        severity: 'warning',
        category: 'deliveries',
        message: `Delivery #${row.id} points at void invoice #${row.invoice_id}`,
        fixable: false,
        fixAction: 'none',
      })
    }
  }

  function checkOrphanedAttachments(issues: IntegrityIssue[]): void {
    const root = path.join(deps.getUserData(), 'attachments')
    if (!fs.existsSync(root)) return

    const referenced = new Set<string>()
    if (tableExists(deps.raw, 'expenses')) {
      const rows = deps.raw
        .prepare(`SELECT attachment_path FROM expenses WHERE attachment_path IS NOT NULL`)
        .all() as { attachment_path: string }[]
      for (const r of rows) referenced.add(r.attachment_path.replace(/\\/g, '/'))
    }
    if (tableExists(deps.raw, 'employees')) {
      try {
        const rows = deps.raw
          .prepare(`SELECT photo_path FROM employees WHERE photo_path IS NOT NULL`)
          .all() as { photo_path: string }[]
        for (const r of rows) {
          // photo may be absolute or relative under attachments
          const rel = r.photo_path.includes('attachments')
            ? (r.photo_path.split('attachments' + path.sep).pop() ?? r.photo_path)
            : r.photo_path
          referenced.add(rel.replace(/\\/g, '/'))
        }
      } catch {
        // photo_path column may differ
      }
    }

    let orphans = 0
    const walk = (dir: string, prefix: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const rel = prefix ? `${prefix}/${name}` : name
        const st = fs.statSync(full)
        if (st.isDirectory()) walk(full, rel.replace(/\\/g, '/'))
        else if (st.isFile()) {
          const norm = rel.replace(/\\/g, '/')
          if (!referenced.has(norm)) {
            orphans++
            if (orphans <= 10) {
              issues.push({
                id: `orphan-attachment-${orphans}`,
                severity: 'info',
                category: 'attachments',
                message: `Orphaned attachment file: ${norm}`,
                details:
                  'No expense/employee row references this file. Safe to leave; delete manually if sure.',
                fixable: false,
                fixAction: 'none',
              })
            }
          }
        }
      }
    }
    walk(root, '')
    if (orphans > 10) {
      issues.push({
        id: 'orphan-attachments-more',
        severity: 'info',
        category: 'attachments',
        message: `${orphans - 10} additional orphaned attachment files`,
        fixable: false,
        fixAction: 'none',
      })
    }
  }

  function runCheck(): IntegrityReport {
    const issues: IntegrityIssue[] = []

    const integrityText = (() => {
      try {
        const r = deps.raw.prepare('PRAGMA integrity_check').all() as Array<Record<string, string>>
        if (r.length === 1 && Object.values(r[0])[0] === 'ok') return 'ok'
        return JSON.stringify(r)
      } catch (err) {
        return err instanceof Error ? err.message : String(err)
      }
    })()
    const pragmaOk = integrityText === 'ok'
    if (!pragmaOk) {
      issues.push({
        id: 'pragma-integrity',
        severity: 'error',
        category: 'pragma',
        message: 'SQLite integrity_check failed',
        details: integrityText,
        fixable: false,
        fixAction: 'none',
      })
    }

    try {
      const fk = deps.raw.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (fk.length > 0) {
        issues.push({
          id: 'pragma-fk',
          severity: 'error',
          category: 'pragma',
          message: `${fk.length} foreign key violation(s)`,
          details: JSON.stringify(fk.slice(0, 10)),
          fixable: false,
          fixAction: 'none',
        })
      }
    } catch (err) {
      issues.push({
        id: 'pragma-fk-error',
        severity: 'warning',
        category: 'pragma',
        message: 'Could not run foreign_key_check',
        details: err instanceof Error ? err.message : String(err),
        fixable: false,
        fixAction: 'none',
      })
    }

    checkLedgerChains(issues)
    checkCustomerBalances(issues)
    checkStockVsBottles(issues)
    checkInvoices(issues)
    checkDeliveries(issues)
    checkOrphanedAttachments(issues)

    const stats = getStats()
    return {
      ranAt: new Date().toISOString(),
      pragmaOk,
      issues,
      tableCounts: stats.tableCounts,
      dbSizeBytes: stats.dbSizeBytes,
      oldestTransactionDate: stats.oldestTransactionDate,
      newestTransactionDate: stats.newestTransactionDate,
    }
  }

  function applyFix(fixAction: 'recalculate_balances'): { fixed: number; message: string } {
    if (fixAction === 'recalculate_balances') {
      const result = deps.balances.recalculate()
      return {
        fixed: result.updated,
        message: `Recalculated customer_balances for ${result.updated} customer(s)`,
      }
    }
    return { fixed: 0, message: 'No fix applied' }
  }

  function compactDatabase(): { beforeBytes: number; afterBytes: number } {
    const beforeBytes = fs.statSync(deps.getDbPath()).size
    deps.raw.exec('VACUUM')
    const afterBytes = fs.statSync(deps.getDbPath()).size
    return { beforeBytes, afterBytes }
  }

  function rebuildSummaries(): { updated: number } {
    return deps.balances.recalculate()
  }

  return {
    runCheck,
    applyFix,
    compactDatabase,
    rebuildSummaries,
    getStats,
  }
}

export type IntegrityService = ReturnType<typeof createIntegrityService>
