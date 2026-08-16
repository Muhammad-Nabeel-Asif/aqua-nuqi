import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AttendancePage } from '@renderer/features/employees/AttendancePage'
import { ipcErr, ipcOk, mockInvoke } from '@renderer/test/mock-api'

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AttendancePage', () => {
  beforeEach(() => {
    mockInvoke().mockReset()
  })

  it('Present month calls markAllPresent for the visible period', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel) => {
      if (channel === 'attendance:getMonth') {
        return ipcOk({
          period: '2026-08',
          daysInMonth: 31,
          periodClosed: false,
          workingDaysBasis: 'calendar',
          rows: [
            {
              employeeId: 1,
              code: 'E-001',
              name: 'Attendee',
              role: 'delivery',
              cells: [
                {
                  date: '2026-08-03',
                  status: null,
                  overtimeHours: 0,
                  notes: null,
                  id: null,
                },
              ],
              present: 0,
              absent: 0,
              halfDays: 0,
              paidLeave: 0,
              unpaidLeave: 0,
              holidays: 0,
              overtimeHours: 0,
            },
          ],
        })
      }
      if (channel === 'attendance:today') {
        return ipcOk({
          date: '2026-08-16',
          periodClosed: false,
          items: [
            {
              employeeId: 1,
              code: 'E-001',
              name: 'Attendee',
              status: null,
              overtimeHours: 0,
            },
          ],
        })
      }
      if (channel === 'attendance:markAllPresent') return ipcOk({ updated: 22 })
      return ipcErr('INTERNAL', 'unexpected')
    })

    wrap(<AttendancePage />)
    expect(await screen.findByText('Attendee')).toBeInTheDocument()
    await user.click(screen.getByTestId('attendance-present-month'))

    expect(mockInvoke()).toHaveBeenCalledWith(
      'attendance:markAllPresent',
      expect.objectContaining({ period: expect.stringMatching(/^\d{4}-\d{2}$/) }),
    )
  })
})
