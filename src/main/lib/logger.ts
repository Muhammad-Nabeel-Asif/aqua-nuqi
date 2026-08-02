import fs from 'node:fs'
import path from 'node:path'
import log from 'electron-log/main'

let configured = false

const LOG_RETENTION_DAYS = 14

function pruneOldLogs(logsDir: string): void {
  try {
    if (!fs.existsSync(logsDir)) return
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const name of fs.readdirSync(logsDir)) {
      const full = path.join(logsDir, name)
      try {
        const st = fs.statSync(full)
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full)
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // ignore
  }
}

export function configureLogger(logsDir: string): typeof log {
  if (!configured) {
    log.transports.file.resolvePathFn = () => `${logsDir}/main.log`
    log.transports.file.maxSize = 5 * 1024 * 1024
    log.transports.console.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    configured = true
  }
  pruneOldLogs(logsDir)
  return log
}

export { log }
