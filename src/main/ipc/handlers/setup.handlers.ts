import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, dialog } from 'electron'
import { getAppContext, setAppContext } from '@main/app-context'
import { closeDatabase, getDb, getRawDb } from '@main/db/client'
import {
  getBundledSchemaVersion,
  resolveMigrationsFolder,
  runBootMigrations,
} from '@main/db/migrate'
import { readPathConfig, writePathConfig } from '@main/lib/paths'
import { createAuditService } from '@main/services/audit.service'
import { createAuthService } from '@main/services/auth.service'
import { createBackupService, getSessionEncryptionPassword } from '@main/services/backup.service'
import { createPeriodService } from '@main/services/period.service'
import { createSettingsService } from '@main/services/settings.service'
import {
  pickFileInput,
  pickFileOutput,
  pickFolderInput,
  pickFolderOutput,
  setupCompleteInput,
  setupCompleteOutput,
  setupRestoreInput,
  setupRestoreOutput,
  setupStatusInput,
  setupStatusOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'
import { assertSetupRequired } from '../access'
import { defineHandler, setRouterAuth } from '../router'

export function registerSetupHandlers(): void {
  defineHandler({
    channel: 'setup:status',
    input: setupStatusInput,
    output: setupStatusOutput,
    roles: 'public',
    handler: () => {
      const ctx = getAppContext()
      return {
        setupRequired: ctx.setupRequired,
        dbPath: ctx.paths.dbPath,
        defaultBackupFolder: ctx.paths.backupsDir,
      }
    },
  })

  defineHandler({
    channel: 'setup:complete',
    input: setupCompleteInput,
    output: setupCompleteOutput,
    roles: 'public',
    handler: async (input) => {
      const ctx = getAppContext()
      assertSetupRequired(ctx.setupRequired)
      if (ctx.auth.hasAnyUser()) {
        throw new AppError('CONFLICT', 'An owner account already exists')
      }

      if (input.backupFolder) {
        fs.mkdirSync(input.backupFolder, { recursive: true })
        const existing = readPathConfig(ctx.paths.configPath)
        writePathConfig(ctx.paths.configPath, {
          ...existing,
          backupsDir: input.backupFolder,
        })
        ctx.paths.backupsDir = input.backupFolder
      }

      ctx.settings.setMany(
        {
          'business.name': input.businessName,
          'business.address': input.address,
          'business.phone': input.phone,
          'locale.currencyCode': input.currencyCode,
          'locale.currencySymbol': input.currencySymbol,
          'locale.dateFormat': input.dateFormat,
          'locale.decimalPlaces': input.decimalPlaces,
          'backup.folder': input.backupFolder || ctx.paths.backupsDir,
        },
        { allowOwnerOnly: true },
      )

      await ctx.auth.createUser({
        username: input.ownerUsername,
        displayName: input.ownerDisplayName,
        password: input.ownerPassword,
        role: 'owner',
      })

      const loggedIn = await ctx.auth.login(input.ownerUsername, input.ownerPassword)
      const recoveryCode = await ctx.auth.generateRecoveryCode()
      ctx.setupRequired = false
      return { user: loggedIn, recoveryCode }
    },
  })

  defineHandler({
    channel: 'setup:restore',
    input: setupRestoreInput,
    output: setupRestoreOutput,
    roles: 'public',
    handler: (input) => {
      const ctx = getAppContext()
      assertSetupRequired(ctx.setupRequired)
      if (!fs.existsSync(input.backupFilePath)) {
        throw new AppError('NOT_FOUND', 'Backup file not found')
      }

      if (fs.existsSync(ctx.paths.dbPath)) {
        try {
          ctx.backup.createBackup('pre_restore', { skipPrune: true })
        } catch {
          // empty/partial DB — continue
        }
      }

      closeDatabase()
      if (ctx.backup.isLegacyDbBackup(input.backupFilePath)) {
        ctx.backup.restoreDatabaseFile(input.backupFilePath, ctx.paths.dbPath)
      } else {
        const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aquanuqi-setup-restore-'))
        try {
          const extracted = ctx.backup.extractBackup(input.backupFilePath, staging)
          ctx.backup.restoreDatabaseFile(extracted.dbPath, ctx.paths.dbPath)
          ctx.backup.restoreAttachmentFolders(staging)
        } finally {
          fs.rmSync(staging, { recursive: true, force: true })
        }
      }

      const migrationsFolder = resolveMigrationsFolder(app.getAppPath(), process.resourcesPath)
      const outcome = runBootMigrations({
        paths: ctx.paths,
        migrationsFolder,
        appVersion: ctx.appVersion,
      })

      if (outcome.kind === 'refused_downgrade') {
        throw new AppError(
          'APP_OLDER_THAN_DATA',
          `This version of Aqua Nuqi is older than your data (schema ${outcome.schemaVersion}).`,
          outcome,
        )
      }

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

      audit.record({
        action: 'restore',
        summary: `Restored database from ${input.backupFilePath}`,
        after: { backupFilePath: input.backupFilePath },
      })

      const schemaVersion =
        outcome.kind === 'migrated'
          ? outcome.to
          : outcome.kind === 'fresh' || outcome.kind === 'up_to_date'
            ? outcome.schemaVersion
            : getBundledSchemaVersion(migrationsFolder)

      setAppContext({
        ...ctx,
        db,
        raw,
        auth,
        settings,
        audit,
        period,
        backup,
        schemaVersion,
        setupRequired: !auth.hasAnyUser(),
        bootFatal: null,
      })
      setRouterAuth(auth)

      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'dialog:pickFolder',
    input: pickFolderInput,
    output: pickFolderOutput,
    roles: 'public',
    handler: async (input) => {
      const result = await dialog.showOpenDialog({
        title: input.title ?? 'Select folder',
        defaultPath: input.defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      })
      return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
    },
  })

  defineHandler({
    channel: 'dialog:pickFile',
    input: pickFileInput,
    output: pickFileOutput,
    roles: 'public',
    handler: async (input) => {
      const result = await dialog.showOpenDialog({
        title: input.title ?? 'Select file',
        properties: ['openFile'],
        filters: input.filters ?? [{ name: 'SQLite backup', extensions: ['db', 'sqlite'] }],
      })
      return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
    },
  })
}
