import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SetupWizard } from '@renderer/features/setup/SetupWizard'
import { useSessionStore } from '@renderer/stores/session'
import { ipcOk, mockInvoke, ownerUser } from '@renderer/test/mock-api'

describe('SetupWizard', () => {
  beforeEach(() => {
    mockInvoke().mockReset()
    useSessionStore.setState({
      user: null,
      locked: false,
      setupRequired: true,
      ready: true,
    })
  })

  it('offers new-business and restore paths', () => {
    render(
      <MemoryRouter>
        <SetupWizard />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('setup-new-business')).toHaveTextContent('Set up a new business')
    expect(screen.getByTestId('setup-restore-backup')).toHaveTextContent('Restore from a backup')
  })

  it('completes a new business and shows the recovery code', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel) => {
      if (channel === 'setup:complete') {
        return ipcOk({ user: ownerUser, recoveryCode: 'ABCD-EFGH-IJKL-MNOP' })
      }
      return ipcOk({})
    })

    render(
      <MemoryRouter>
        <SetupWizard />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('setup-new-business'))
    await user.click(screen.getByTestId('setup-continue'))
    await user.click(screen.getByTestId('setup-continue'))
    await user.click(screen.getByTestId('setup-continue'))
    await user.type(screen.getByTestId('setup-owner-password'), 'secret12')
    await user.type(screen.getByTestId('setup-owner-password2'), 'secret12')
    await user.click(screen.getByTestId('setup-finish'))

    expect(await screen.findByText('Save your recovery code')).toBeInTheDocument()
    expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument()
    expect(mockInvoke()).toHaveBeenCalledWith(
      'setup:complete',
      expect.objectContaining({ ownerPassword: 'secret12', businessName: 'Aqua Nuqi' }),
    )
  })

  it('restore path invokes setup:restore with the chosen file', async () => {
    const user = userEvent.setup()
    mockInvoke().mockImplementation(async (channel) => {
      if (channel === 'dialog:pickFile') return ipcOk({ path: '/tmp/backup.zip' })
      if (channel === 'setup:restore') return ipcOk({ ok: true })
      if (channel === 'auth:session') {
        return ipcOk({ user: ownerUser, locked: false, setupRequired: false })
      }
      return ipcOk({})
    })

    render(
      <MemoryRouter>
        <SetupWizard />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('setup-restore-backup'))
    await user.click(screen.getByRole('button', { name: 'Browse' }))
    expect(await screen.findByDisplayValue('/tmp/backup.zip')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore and continue' }))
    expect(mockInvoke()).toHaveBeenCalledWith('setup:restore', {
      backupFilePath: '/tmp/backup.zip',
    })
  })
})
