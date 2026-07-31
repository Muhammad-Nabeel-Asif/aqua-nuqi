/** Frozen after first stable release — renaming changes userData and hides client data. */
export const APP_ID = 'com.aquanuqi.app' as const
export const PRODUCT_NAME = 'Aqua Nuqi' as const
export const PACKAGE_NAME = 'aqua-nuqi' as const

/** Permanent Windows installer link (stable channel /releases/latest). */
export const DOWNLOAD_LATEST_URL =
  'https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi-Setup.exe' as const

/** Permanent Ubuntu AppImage link (stable channel). */
export const DOWNLOAD_LINUX_URL =
  'https://github.com/Muhammad-Nabeel-Asif/aqua-nuqi/releases/latest/download/Aqua-Nuqi.AppImage' as const

export const DB_FILE_NAME = 'aqua-nuqi.db' as const
export const DB_RELATIVE_DIR = 'data' as const
export const BACKUPS_RELATIVE_DIR = 'backups' as const
export const LOGS_RELATIVE_DIR = 'logs' as const

export const ROLES = ['owner', 'operator', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'void',
  'login',
  'logout',
  'settings_change',
  'backup',
  'restore',
  'period_close',
  'period_reopen',
  'export',
  'app_upgrade',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const BACKUP_KINDS = [
  'manual',
  'on_exit',
  'daily',
  'weekly',
  'pre_migration',
  'pre_restore',
] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]

/** Retention pruning must never delete these kinds. */
export const BACKUP_KINDS_EXEMPT_FROM_PRUNING: readonly BackupKind[] = [
  'pre_migration',
  'pre_restore',
]
