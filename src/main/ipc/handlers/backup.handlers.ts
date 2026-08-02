import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { BrowserWindow, app, shell } from 'electron'
import { getAppContext, setAppContext } from '@main/app-context'
import { closeDatabase, getDb, getRawDb, openDatabase } from '@main/db/client'
import {
  getBundledSchemaVersion,
  resolveMigrationsFolder,
  runBootMigrations,
} from '@main/db/migrate'
import {
  clearPendingRestoreIntent,
  finalizeRestoreAuditAfterSuccess,
} from '@main/lib/pending-restore'
import { isPortableBuild } from '@main/lib/portable'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import {
  createBackupService,
  getSessionEncryptionPassword,
  setSessionEncryptionPassword,
} from '@main/services/backup.service'
import { createBalanceService } from '@main/services/balance.service'
import { createIntegrityService } from '@main/services/integrity.service'
import { createPeriodService } from '@main/services/period.service'
import { createSettingsService } from '@main/services/settings.service'
import {
  backupCloseReadonlyInput,
  backupCloseReadonlyOutput,
  backupCreateInput,
  backupCreateOutput,
  backupInspectInput,
  backupInspectOutput,
  backupListInput,
  backupListOutput,
  backupOpenReadonlyInput,
  backupOpenReadonlyOutput,
  backupRestoreInput,
  backupRestoreOutput,
  backupSetEncryptionPasswordInput,
  backupSetEncryptionPasswordOutput,
  backupStatusInput,
  backupStatusOutput,
  backupVerifyInput,
  backupVerifyOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'
import { defineHandler, setRouterAuth } from '../router'

function emitProgress(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('backup:progress', payload)
  }
}

function rebuildCoreServices(): void {
  const ctx = getAppContext()
  const db = getDb()
  const raw = getRawDb()
  const audit = createAuditService(db)
  const auth = createAuthService(db, audit)
  const settings = createSettingsService(db, audit)
  const period = createPeriodService(db, audit)
  const backup = createBackupService({
    db,
    raw,
    getBackupFolder: () => (settings.get('backup.folder') as string) || ctx.paths.backupsDir,
    getSecondaryFolder: () => String(settings.get('backup.secondaryFolder') || ''),
    getUserData: () => ctx.paths.userData,
    getDbPath: () => ctx.paths.dbPath,
    getAppVersion: () => ctx.appVersion,
    getKeepDaily: () => Number(settings.get('backup.keepDaily') || 14),
    getKeepWeekly: () => Number(settings.get('backup.keepWeekly') || 8),
    isEncryptionEnabled: () => Boolean(settings.get('backup.encryptionEnabled')),
    getEncryptionPassword: () => getSessionEncryptionPassword(),
  })
  const balances = createBalanceService(db, raw)
  const integrity = createIntegrityService({
    db,
    raw,
    balances,
    getDbPath: () => ctx.paths.dbPath,
    getUserData: () => ctx.paths.userData,
  })
  setAppContext({
    ...ctx,
    db,
    raw,
    auth,
    settings,
    audit,
    period,
    backup,
    balances,
    integrity,
    setupRequired: !auth.hasAnyUser(),
    bootFatal: null,
  })
  setRouterAuth(auth)
}

export function registerBackupHandlers(): void {
  defineHandler({
    channel: 'backup:create',
    input: backupCreateInput,
    output: backupCreateOutput,
    roles: ['owner'],
    handler: (input) => {
      const ctx = getAppContext()
      if (input.password) {
        setSessionEncryptionPassword(input.password)
      }
      if (
        ctx.settings.get('backup.encryptionEnabled') &&
        !input.password &&
        !getSessionEncryptionPassword()
      ) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Encryption is enabled — provide a password for this backup (kept for this session for scheduled backups)',
        )
      }
      const result = ctx.backup.createBackup(input.kind, {
        password: input.password,
        onProgress: emitProgress,
      })
      ctx.audit.record({
        userId: ctx.auth.getSession().user?.id,
        action: 'backup',
        summary: `Created ${input.kind} backup`,
        after: {
          filePath: result.filePath,
          sizeBytes: result.sizeBytes,
          secondaryWarning: result.secondaryWarning,
        },
      })
      return result
    },
  })

  defineHandler({
    channel: 'backup:list',
    input: backupListInput,
    output: backupListOutput,
    roles: ['owner'],
    handler: () => getAppContext().backup.listBackups(),
  })

  defineHandler({
    channel: 'backup:status',
    input: backupStatusInput,
    output: backupStatusOutput,
    roles: ['owner'],
    handler: () => {
      const ctx = getAppContext()
      const list = ctx.backup.listBackups()
      const freshnessHours = Number(ctx.settings.get('backup.freshnessHours') || 24)
      let isStale = true
      if (list.lastSuccessAt) {
        const ageMs = Date.now() - new Date(list.lastSuccessAt).getTime()
        isStale = ageMs > freshnessHours * 3600_000
      }
      return {
        lastSuccessAt: list.lastSuccessAt,
        freshnessHours,
        isStale,
        storageUsedBytes: list.storageUsedBytes,
        primaryFolder: (ctx.settings.get('backup.folder') as string) || ctx.paths.backupsDir,
        secondaryFolder: String(ctx.settings.get('backup.secondaryFolder') || ''),
        nextDailyDue: list.nextDailyDue,
        nextWeeklyDue: list.nextWeeklyDue,
        encryptionEnabled: Boolean(ctx.settings.get('backup.encryptionEnabled')),
        hasSessionEncryptionPassword: Boolean(getSessionEncryptionPassword()),
        isPortable: isPortableBuild(),
      }
    },
  })

  defineHandler({
    channel: 'backup:setEncryptionPassword',
    input: backupSetEncryptionPasswordInput,
    output: backupSetEncryptionPasswordOutput,
    roles: ['owner'],
    handler: (input) => {
      setSessionEncryptionPassword(input.password)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'backup:verify',
    input: backupVerifyInput,
    output: backupVerifyOutput,
    roles: ['owner'],
    handler: (input) => getAppContext().backup.verifyBackup(input.filePath, input.password),
  })

  defineHandler({
    channel: 'backup:inspect',
    input: backupInspectInput,
    output: backupInspectOutput,
    roles: ['owner'],
    handler: (input) => getAppContext().backup.inspectBackup(input.filePath, input.password),
  })

  defineHandler({
    channel: 'backup:restore',
    input: backupRestoreInput,
    output: backupRestoreOutput,
    roles: ['owner'],
    handler: (input) => {
      const ctx = getAppContext()
      const bundledMax = getBundledSchemaVersion(
        resolveMigrationsFolder(app.getAppPath(), process.resourcesPath),
      )

      // Validate first — cancel-safe before any mutation
      let schemaVersion: number
      if (ctx.backup.isLegacyDbBackup(input.filePath)) {
        const tmp = new BetterSqlite3(input.filePath, { readonly: true, fileMustExist: true })
        try {
          const row = tmp
            .prepare(`SELECT value FROM app_meta WHERE key = 'schema_version'`)
            .get() as { value: string } | undefined
          schemaVersion = row ? Number(row.value) || 0 : 0
        } finally {
          tmp.close()
        }
      } else {
        const inspected = ctx.backup.inspectBackup(input.filePath, input.password)
        if (!inspected.validChecksum) {
          throw new AppError('VALIDATION_FAILED', 'Backup checksum validation failed')
        }
        schemaVersion = inspected.manifest.schemaVersion
      }

      if (schemaVersion > bundledMax) {
        throw new AppError(
          'APP_OLDER_THAN_DATA',
          `This backup was created with a newer schema (v${schemaVersion}) than this app supports (v${bundledMax}). Update Aqua Nuqi first, then restore.`,
          { schemaVersion, bundledMax },
        )
      }

      // Safety snapshot of current data
      const preRestore = ctx.backup.createBackup('pre_restore', {
        skipPrune: true,
        onProgress: emitProgress,
      })

      // Persist restore intent so boot can finish the audit if we crash mid-restore
      const intentPath = path.join(ctx.paths.userData, 'pending-restore.json')
      const restoreIntent = {
        from: input.filePath,
        preRestorePath: preRestore.filePath,
        at: new Date().toISOString(),
        userId: ctx.auth.getSession().user?.id ?? null,
      }
      fs.writeFileSync(intentPath, JSON.stringify(restoreIntent), 'utf8')

      let staging: string | null = null
      try {
        closeDatabase()

        if (ctx.backup.isLegacyDbBackup(input.filePath)) {
          ctx.backup.restoreDatabaseFile(input.filePath, ctx.paths.dbPath)
        } else {
          staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-restore-'))
          const extracted = ctx.backup.extractBackup(input.filePath, staging, input.password)
          ctx.backup.restoreDatabaseFile(extracted.dbPath, ctx.paths.dbPath)
          ctx.backup.restoreAttachmentFolders(staging)
        }

        const migrationsFolder = resolveMigrationsFolder(app.getAppPath(), process.resourcesPath)
        const outcome = runBootMigrations({
          paths: ctx.paths,
          migrationsFolder,
          appVersion: ctx.appVersion,
        })
        if (outcome.kind === 'refused_downgrade') {
          // Roll back to pre-restore
          closeDatabase()
          if (preRestore.filePath.endsWith('.zip')) {
            const rollStaging = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-rollback-'))
            const extracted = ctx.backup.extractBackup(preRestore.filePath, rollStaging)
            ctx.backup.restoreDatabaseFile(extracted.dbPath, ctx.paths.dbPath)
            ctx.backup.restoreAttachmentFolders(rollStaging)
            fs.rmSync(rollStaging, { recursive: true, force: true })
          }
          throw new AppError(
            'APP_OLDER_THAN_DATA',
            `This version of Aqua Nuqi is older than the backup data (schema ${outcome.schemaVersion}).`,
            outcome,
          )
        }

        rebuildCoreServices()
        const live = getAppContext()
        // Delete intent before audit so a crash between the two cannot double-audit on boot.
        finalizeRestoreAuditAfterSuccess({
          intentPath,
          intent: restoreIntent,
          record: (entry) => live.audit.record(entry),
        })

        // Restart so all services rebind cleanly
        setTimeout(() => {
          app.relaunch()
          app.exit(0)
        }, 400)

        return {
          ok: true as const,
          restartRequired: true as const,
          preRestorePath: preRestore.filePath,
        }
      } catch (err) {
        // Failed restore must not leave an intent that boot would treat as success.
        clearPendingRestoreIntent(intentPath)
        // If we already closed the DB, try to reopen from pre-restore
        try {
          closeDatabase()
          const live = getAppContext()
          if (preRestore.filePath.endsWith('.zip')) {
            const rollStaging = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-rollback-'))
            const extracted = live.backup.extractBackup(preRestore.filePath, rollStaging)
            live.backup.restoreDatabaseFile(extracted.dbPath, live.paths.dbPath)
            live.backup.restoreAttachmentFolders(rollStaging)
            fs.rmSync(rollStaging, { recursive: true, force: true })
          }
          openDatabase(live.paths.dbPath)
          rebuildCoreServices()
        } catch {
          // fatal — caller sees original error
        }
        throw err
      } finally {
        if (staging) {
          try {
            fs.rmSync(staging, { recursive: true, force: true })
          } catch {
            // ignore
          }
        }
      }
    },
  })

  defineHandler({
    channel: 'backup:openReadonly',
    input: backupOpenReadonlyInput,
    output: backupOpenReadonlyOutput,
    roles: ['owner'],
    handler: (input) => {
      const ctx = getAppContext()
      const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-inspect-'))
      const extracted = ctx.backup.extractBackup(input.filePath, stagingDir, input.password)
      ctx.audit.record({
        userId: ctx.auth.getSession().user?.id,
        action: 'export',
        summary: `Opened backup read-only for inspection: ${input.filePath}`,
        after: { stagingDir, dbPath: extracted.dbPath },
      })
      return {
        stagingDir,
        dbPath: extracted.dbPath,
        manifest: extracted.manifest,
      }
    },
  })

  defineHandler({
    channel: 'backup:closeReadonly',
    input: backupCloseReadonlyInput,
    output: backupCloseReadonlyOutput,
    roles: ['owner'],
    handler: (input) => {
      const resolved = path.resolve(input.stagingDir)
      const tmpRoot = path.resolve(os.tmpdir())
      if (!resolved.startsWith(tmpRoot + path.sep) || !resolved.includes('aquanuqi-inspect-')) {
        throw new AppError('VALIDATION_FAILED', 'Invalid inspection staging directory')
      }
      fs.rmSync(resolved, { recursive: true, force: true })
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'backup:openFolder',
    input: backupStatusInput,
    output: backupStatusOutput,
    roles: ['owner'],
    handler: async () => {
      const ctx = getAppContext()
      const folder = (ctx.settings.get('backup.folder') as string) || ctx.paths.backupsDir
      fs.mkdirSync(folder, { recursive: true })
      await shell.openPath(folder)
      // Return status for convenience
      const list = ctx.backup.listBackups()
      const freshnessHours = Number(ctx.settings.get('backup.freshnessHours') || 24)
      let isStale = true
      if (list.lastSuccessAt) {
        const ageMs = Date.now() - new Date(list.lastSuccessAt).getTime()
        isStale = ageMs > freshnessHours * 3600_000
      }
      return {
        lastSuccessAt: list.lastSuccessAt,
        freshnessHours,
        isStale,
        storageUsedBytes: list.storageUsedBytes,
        primaryFolder: folder,
        secondaryFolder: String(ctx.settings.get('backup.secondaryFolder') || ''),
        nextDailyDue: list.nextDailyDue,
        nextWeeklyDue: list.nextWeeklyDue,
        encryptionEnabled: Boolean(ctx.settings.get('backup.encryptionEnabled')),
        hasSessionEncryptionPassword: Boolean(getSessionEncryptionPassword()),
        isPortable: isPortableBuild(),
      }
    },
  })
}
