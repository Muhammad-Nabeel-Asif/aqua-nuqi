import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { LoginPage } from '@renderer/features/auth/LoginPage'
import { useSessionStore } from '@renderer/stores/session'
import { ipcErr, ipcOk, mockInvoke, ownerUser } from '@renderer/test/mock-api'

describe('LoginPage', () => {
  beforeEach(() => {
    mockInvoke().mockReset()
    useSessionStore.setState({
      user: null,
      locked: false,
      setupRequired: false,
      ready: true,
    })
  })

  it('signs in with a valid password', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel, payload) => {
      if (channel === 'auth:login') {
        const body = payload as { username: string; password: string }
        if (body.username === 'owner' && body.password === 'secret12') {
          return ipcOk({ user: ownerUser })
        }
        return ipcErr('UNAUTHORIZED', 'Invalid username or password')
      }
      return ipcErr('INTERNAL', 'unexpected')
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByTestId('login-username'), 'owner')
    await user.type(screen.getByTestId('login-password'), 'secret12')
    await user.click(screen.getByTestId('login-submit'))

    expect(useSessionStore.getState().user?.username).toBe('owner')
    expect(screen.queryByTestId('login-error')).toBeNull()
  })

  it('shows an error and stays on the form for a wrong password', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel) => {
      if (channel === 'auth:login') return ipcErr('UNAUTHORIZED', 'Invalid username or password')
      return ipcErr('INTERNAL', 'unexpected')
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByTestId('login-username'), 'owner')
    await user.type(screen.getByTestId('login-password'), 'nope')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Invalid username or password',
    )
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('switches to recovery mode', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('login-recovery-toggle'))
    expect(screen.getByText('Account recovery')).toBeInTheDocument()
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument()
  })
})
