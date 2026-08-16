export type BackupChip = {
  label: string
  tone: 'ok' | 'danger'
}

/**
 * Navbar backup freshness label. Hours were previously rounded with
 * `Math.max(1, Math.round(ageHours))`, so a backup from seconds ago showed
 * “Backed up 1h ago”.
 */
export function backupChipFromStatus(input: {
  lastSuccessAt: string | null | undefined
  freshnessHours?: number
  nowMs?: number
}): BackupChip {
  const last = input.lastSuccessAt
  const freshnessHours = input.freshnessHours ?? 24
  if (!last) return { label: 'No backup yet', tone: 'danger' }

  const ageMs = Math.max(0, (input.nowMs ?? Date.now()) - new Date(last).getTime())
  const ageMinutes = ageMs / 60_000
  const ageHours = ageMs / 3_600_000

  // Match backup:status isStale (ageMs > threshold) — equal threshold is still fresh.
  if (ageHours <= freshnessHours) {
    if (ageMinutes < 1) {
      return { label: 'Backed up just now', tone: 'ok' }
    }
    if (ageHours < 1) {
      const minutes = Math.max(1, Math.round(ageMinutes))
      return { label: `Backed up ${minutes}m ago`, tone: 'ok' }
    }
    const hours = Math.max(1, Math.round(ageHours))
    return { label: `Backed up ${hours}h ago`, tone: 'ok' }
  }

  const days = Math.round(ageHours / 24)
  return {
    label: days >= 1 ? `No backup for ${days} day${days === 1 ? '' : 's'}` : 'Backup overdue',
    tone: 'danger',
  }
}
