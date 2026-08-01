import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Product UI must not bypass period lock (AC7). Service still accepts forceClosedPeriod
 * for privileged tooling, but expenses screens must not offer a confirm→force path.
 */
describe('expenses UI period-lock guards', () => {
  const files = [
    'src/renderer/src/features/expenses/ExpensesPage.tsx',
    'src/renderer/src/features/expenses/ExpenseSidePanel.tsx',
  ]

  it('does not force closed periods from the expenses product UI', () => {
    for (const rel of files) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(src, rel).not.toMatch(/forceClosedPeriod\s*[:=]/)
      expect(src, rel).not.toMatch(/Record anyway|Save anyway|Void anyway/)
    }
  })

  it('ExpensesPage wires recurring create UI and sortable columns', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/src/features/expenses/ExpensesPage.tsx'),
      'utf8',
    )
    expect(src).toContain('RecurringExpensesPanel')
    expect(src).toContain('sortBy')
    expect(src).toContain('paisaToDecimalString')
    expect(src).toContain('searchParams.get(')
  })

  it('RecurringExpensesPanel calls recurringExpenses.create', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/src/features/expenses/RecurringExpensesPanel.tsx'),
      'utf8',
    )
    expect(src).toContain('api.recurringExpenses.create')
    expect(src).toContain('api.recurringExpenses.update')
    expect(src).toContain('api.recurringExpenses.list')
  })
})
