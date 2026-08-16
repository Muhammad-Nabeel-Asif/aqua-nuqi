import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('delivery grid initial focus', () => {
  it('does not auto-select a qty cell when Daily entry or Month matrix opens', () => {
    const daily = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/src/features/deliveries/DailyEntryPage.tsx'),
      'utf8',
    )
    const matrix = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/src/features/deliveries/MonthMatrixPage.tsx'),
      'utf8',
    )
    expect(daily).toMatch(/useState<\{ row: number; col: FocusCol \} \| null>\(null\)/)
    expect(matrix).toMatch(/useState<\{ row: number; day: number \} \| null>\(null\)/)
    expect(daily).not.toMatch(/useState<\{ row: number; col: FocusCol \}>\(\{ row: 0/)
    expect(matrix).not.toMatch(/useState\(\{ row: 0, day: 1 \}\)/)
  })
})
