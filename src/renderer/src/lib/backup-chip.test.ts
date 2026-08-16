import { describe, expect, it } from 'vitest'
import { backupChipFromStatus } from './backup-chip'

const NOW = Date.parse('2026-08-16T14:00:00.000Z')

function isoMinutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString()
}

function isoHoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString()
}

describe('backupChipFromStatus', () => {
  it('shows no backup when lastSuccessAt is missing', () => {
    expect(backupChipFromStatus({ lastSuccessAt: null, nowMs: NOW })).toEqual({
      label: 'No backup yet',
      tone: 'danger',
    })
  })

  it('shows just now for a backup from seconds ago (not 1h ago)', () => {
    expect(
      backupChipFromStatus({
        lastSuccessAt: new Date(NOW - 8_000).toISOString(),
        nowMs: NOW,
      }),
    ).toEqual({ label: 'Backed up just now', tone: 'ok' })
  })

  it('shows minutes when age is under one hour', () => {
    expect(backupChipFromStatus({ lastSuccessAt: isoMinutesAgo(5), nowMs: NOW })).toEqual({
      label: 'Backed up 5m ago',
      tone: 'ok',
    })
    expect(backupChipFromStatus({ lastSuccessAt: isoMinutesAgo(29), nowMs: NOW })).toEqual({
      label: 'Backed up 29m ago',
      tone: 'ok',
    })
    expect(backupChipFromStatus({ lastSuccessAt: isoMinutesAgo(45), nowMs: NOW })).toEqual({
      label: 'Backed up 45m ago',
      tone: 'ok',
    })
  })

  it('shows hours when age is at least one hour and still fresh', () => {
    expect(backupChipFromStatus({ lastSuccessAt: isoHoursAgo(1), nowMs: NOW })).toEqual({
      label: 'Backed up 1h ago',
      tone: 'ok',
    })
    expect(backupChipFromStatus({ lastSuccessAt: isoHoursAgo(3.4), nowMs: NOW })).toEqual({
      label: 'Backed up 3h ago',
      tone: 'ok',
    })
  })

  it('treats age equal to freshnessHours as still fresh', () => {
    expect(
      backupChipFromStatus({
        lastSuccessAt: isoHoursAgo(24),
        freshnessHours: 24,
        nowMs: NOW,
      }),
    ).toEqual({ label: 'Backed up 24h ago', tone: 'ok' })
  })

  it('marks overdue backups past the freshness window', () => {
    expect(
      backupChipFromStatus({
        lastSuccessAt: isoHoursAgo(25),
        freshnessHours: 24,
        nowMs: NOW,
      }),
    ).toEqual({ label: 'No backup for 1 day', tone: 'danger' })
    expect(
      backupChipFromStatus({
        lastSuccessAt: isoHoursAgo(72),
        freshnessHours: 24,
        nowMs: NOW,
      }),
    ).toEqual({ label: 'No backup for 3 days', tone: 'danger' })
  })
})
