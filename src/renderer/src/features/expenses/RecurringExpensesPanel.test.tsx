import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { RecurringExpensesPanel } from '@renderer/features/expenses/RecurringExpensesPanel'
import { ipcErr, ipcOk, mockInvoke } from '@renderer/test/mock-api'
import type { ExpenseCategoryDto, RecurringExpenseDto } from '@shared/contracts'

const rentCategory: ExpenseCategoryDto = {
  id: 1,
  uuid: 'cat-rent',
  name: 'Rent',
  parentId: null,
  parentName: null,
  isSystem: true,
  sortOrder: 1,
  isActive: true,
  usageCount: 0,
  thisMonthTotal: 0,
  thisYearTotal: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function createdItem(name: string, amount: number): RecurringExpenseDto {
  return {
    id: 1,
    uuid: 'rec-1',
    name,
    categoryId: 1,
    categoryName: 'Rent',
    amount,
    frequency: 'monthly',
    dayOfMonth: 1,
    vendorName: null,
    nextDueDate: '2026-08-01',
    lastRecordedDate: null,
    isActive: true,
    isDue: false,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('RecurringExpensesPanel', () => {
  beforeEach(() => {
    mockInvoke().mockReset()
  })

  it('creates a recurring expense from the manage form', async () => {
    const user = userEvent.setup()
    let items: RecurringExpenseDto[] = []
    mockInvoke().mockImplementation(async (channel, payload) => {
      if (channel === 'recurringExpenses:list') return ipcOk({ items })
      if (channel === 'recurringExpenses:create') {
        const body = payload as { name: string; categoryId: number; amount: number }
        const item = createdItem(body.name, body.amount)
        items = [item]
        return ipcOk({ item })
      }
      return ipcErr('INTERNAL', 'unexpected')
    })

    wrap(<RecurringExpensesPanel categories={[rentCategory]} onRecordDue={() => undefined} />)

    await user.click(screen.getByTestId('recurring-manage'))
    await user.type(screen.getByTestId('recurring-name'), 'Shop rent')
    await user.selectOptions(screen.getByTestId('recurring-category'), '1')
    await user.type(screen.getByTestId('recurring-amount'), '15000')
    await user.click(screen.getByTestId('recurring-add'))

    expect(mockInvoke()).toHaveBeenCalledWith(
      'recurringExpenses:create',
      expect.objectContaining({
        name: 'Shop rent',
        categoryId: 1,
        amount: 1_500_000,
      }),
    )
    expect(await screen.findByText('Shop rent')).toBeInTheDocument()
  })
})
