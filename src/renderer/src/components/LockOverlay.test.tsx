import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { LockOverlay } from '@renderer/components/LockOverlay'
import { useSessionStore } from '@renderer/stores/session'
import { ipcErr, ipcOk, mockInvoke, ownerUser } from '@renderer/test/mock-api'

describe('LockOverlay', () => {
  beforeEach(() => {
    mockInvoke().mockReset()
    useSessionStore.setState({
      user: ownerUser,
      locked: true,
      setupRequired: false,
      ready: true,
    })
  })

  it('unlocks with the owner password', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel, payload) => {
      if (channel === 'auth:unlock') {
        const body = payload as { password?: string }
        if (body.password === 'secret12') return ipcOk({ ok: true })
        return ipcErr('UNAUTHORIZED', 'Incorrect password')
      }
      return ipcErr('INTERNAL', 'unexpected')
    })

    render(<LockOverlay />)
    expect(screen.getByText('Session locked')).toBeInTheDocument()
    await user.type(screen.getByTestId('lock-password'), 'secret12')
    await user.click(screen.getByTestId('lock-submit'))
    expect(useSessionStore.getState().locked).toBe(false)
  })

  it('unlocks with PIN when the user has one', async () => {
    const user = userEvent.setup()
    useSessionStore.setState({
      user: { ...ownerUser, hasPin: true },
      locked: true,
      setupRequired: false,
      ready: true,
    })
    mockInvoke().mockImplementation(async (channel, payload) => {
      if (channel === 'auth:unlock') {
        const body = payload as { pin?: string }
        if (body.pin === '1234') return ipcOk({ ok: true })
        return ipcErr('UNAUTHORIZED', 'Incorrect PIN')
      }
      return ipcErr('INTERNAL', 'unexpected')
    })

    render(<LockOverlay />)
    await user.type(screen.getByLabelText('PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Unlock with PIN' }))
    expect(useSessionStore.getState().locked).toBe(false)
  })
})
