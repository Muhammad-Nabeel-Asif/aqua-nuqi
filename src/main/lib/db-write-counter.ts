/**
 * Monotonic counter bumped on every business mutation (via audit.record).
 * Report cache keys include this so stale aggregates are never served after a write.
 */
let writeCounter = 0

export function getDbWriteCounter(): number {
  return writeCounter
}

export function bumpDbWriteCounter(): void {
  writeCounter += 1
}

/** Test helper — reset between suites. */
export function resetDbWriteCounter(): void {
  writeCounter = 0
}
