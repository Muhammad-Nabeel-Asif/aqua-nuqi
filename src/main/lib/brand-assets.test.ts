import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_ASSETS, BRAND_COLOURS, BRAND_NAME } from '@shared/brand'
import { PRODUCT_NAME } from '@shared/constants'
import {
  __clearBrandAssetCache,
  brandAssetDataUrl,
  brandPrintLogoDataUrl,
  MAIN_BRAND_ASSETS,
  resolveBrandAssetPath,
} from './brand-assets'

const root = path.resolve(__dirname, '../../..')
const brandDir = path.join(root, 'resources', 'brand')

describe('brand assets', () => {
  it('ships every artwork file the app references', () => {
    const required = [
      ...Object.values(BRAND_ASSETS),
      ...Object.values(MAIN_BRAND_ASSETS),
      'installerHeader.bmp',
      'installerSidebar.bmp',
    ]
    for (const file of required) {
      const full = path.join(brandDir, file)
      expect(fs.existsSync(full), `missing brand asset: ${file}`).toBe(true)
      expect(fs.statSync(full).size).toBeGreaterThan(0)
    }
  })

  it('keeps the generator source in the repo so artwork can be regenerated', () => {
    expect(fs.existsSync(path.join(brandDir, 'source', 'aqua-nuqi-logo-source.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'scripts', 'generate-brand-assets.py'))).toBe(true)
  })

  it('mirrors renderer copies so Vite bundles the same artwork', () => {
    const rendererDir = path.join(root, 'src', 'renderer', 'src', 'assets', 'brand')
    for (const file of [
      'logo-full.png',
      'logo-full-light.png',
      'logo-mark.png',
      'favicon-64.png',
    ]) {
      const a = path.join(brandDir, file)
      const b = path.join(rendererDir, file)
      expect(fs.existsSync(b), `renderer copy missing: ${file}`).toBe(true)
      // Byte-identical, or the two surfaces drift apart on the next logo change.
      expect(fs.readFileSync(b).equals(fs.readFileSync(a)), `renderer copy stale: ${file}`).toBe(
        true,
      )
    }
  })

  it('resolves and encodes the print lockup as a data URL', () => {
    __clearBrandAssetCache()
    expect(resolveBrandAssetPath(MAIN_BRAND_ASSETS.logoPrint, [root])).not.toBeNull()

    const dataUrl = brandPrintLogoDataUrl([root])
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
    // Embedded into every generated PDF — keep it small.
    expect(dataUrl!.length).toBeLessThan(120_000)
  })

  it('caches data URLs so a batch export re-encodes nothing', () => {
    __clearBrandAssetCache()
    const first = brandPrintLogoDataUrl([root])
    const second = brandPrintLogoDataUrl([root])
    expect(second).toBe(first)
  })

  it('returns null rather than throwing for unknown artwork', () => {
    __clearBrandAssetCache()
    expect(brandAssetDataUrl('does-not-exist.png', [root])).toBeNull()
  })

  it('keeps the shared brand name aligned with the frozen product name', () => {
    expect(BRAND_NAME).toBe(PRODUCT_NAME)
    for (const colour of Object.values(BRAND_COLOURS)) {
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
