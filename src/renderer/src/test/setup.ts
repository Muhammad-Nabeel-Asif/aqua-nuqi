import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.stubGlobal('api', {
  invoke: vi.fn(),
  on: vi.fn(() => () => undefined),
} satisfies Window['api'])

afterEach(() => {
  cleanup()
})
