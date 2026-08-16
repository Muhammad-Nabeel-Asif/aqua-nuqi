import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('onboarding tour removal', () => {
  it('does not mount a first-run tour in the app shell', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/src/components/AppShell.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/OnboardingTour/)
    expect(
      fs.existsSync(path.join(process.cwd(), 'src/renderer/src/components/OnboardingTour.tsx')),
    ).toBe(false)
  })
})
