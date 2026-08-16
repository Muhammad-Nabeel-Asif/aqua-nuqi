import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { RequireAuth, RequireOwner, RequireSetup } from '@renderer/route-guards'
import { useSessionStore } from '@renderer/stores/session'
import { operatorUser, ownerUser } from '@renderer/test/mock-api'

function renderGuards(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/setup" element={<div>setup page</div>} />
        <Route path="/login" element={<div>login page</div>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <div>home page</div>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireOwner>
              <div>settings content</div>
            </RequireOwner>
          }
        />
        <Route
          path="/wizard"
          element={
            <RequireSetup>
              <div>wizard page</div>
            </RequireSetup>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('route guards', () => {
  beforeEach(() => {
    useSessionStore.setState({
      user: null,
      locked: false,
      setupRequired: false,
      ready: true,
    })
  })

  it('sends setupRequired to /setup', () => {
    useSessionStore.setState({ setupRequired: true, user: null, locked: false, ready: true })
    renderGuards('/')
    expect(screen.getByText('setup page')).toBeInTheDocument()
  })

  it('sends a missing user to /login', () => {
    renderGuards('/')
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('shows Owner only when an operator opens settings', () => {
    useSessionStore.setState({
      user: operatorUser,
      locked: false,
      setupRequired: false,
      ready: true,
    })
    renderGuards('/settings')
    expect(screen.getByText('Owner only')).toBeInTheDocument()
    expect(screen.queryByText('settings content')).toBeNull()
  })

  it('lets the owner through settings and an authenticated user through home', () => {
    useSessionStore.setState({
      user: ownerUser,
      locked: false,
      setupRequired: false,
      ready: true,
    })
    renderGuards('/')
    expect(screen.getByText('home page')).toBeInTheDocument()
  })
})
