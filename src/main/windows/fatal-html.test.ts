import { describe, expect, it } from 'vitest'
import { DOWNLOAD_LATEST_URL } from '@shared/constants'
import { buildFatalHtml } from './fatal-html'

describe('buildFatalHtml', () => {
  it('includes Download latest and Open my data folder for older-than-data', () => {
    const { html } = buildFatalHtml(
      {
        type: 'app_older_than_data',
        schemaVersion: 19,
        bundledMax: 14,
        appVersion: '0.6.12',
      },
      { userData: '/home/user/.config/Aqua Nuqi' },
    )
    expect(html).toContain('Download latest')
    expect(html).toContain('Open my data folder')
    expect(html).toContain(DOWNLOAD_LATEST_URL)
    expect(html).toContain('aqua-nuqi-fatal://open-data')
    expect(html).toContain('Your data is safe and has not been changed')
  })
})
