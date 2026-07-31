import log from 'electron-log/main'

let configured = false

export function configureLogger(logsDir: string): typeof log {
  if (!configured) {
    log.transports.file.resolvePathFn = () => `${logsDir}/main.log`
    log.transports.file.maxSize = 5 * 1024 * 1024
    log.transports.console.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    configured = true
  }
  return log
}

export { log }
