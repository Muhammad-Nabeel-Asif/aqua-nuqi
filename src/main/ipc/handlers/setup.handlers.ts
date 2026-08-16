import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog } from 'electron'
import { getAppContext } from '@main/app-context'
import { bootstrapApp } from '@main/bootstrap'
import { closeDatabase } from '@main/db/client'
import { readPathConfig, writePathConfig } from '@main/lib/paths'
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
import { defineHandler } from '../router'

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

      // Rebind the full service graph to the restored DB. A partial rebuild left
      // customers/deliveries/etc. holding the closed connection.
      const result = bootstrapApp()
      if (!result.ok) {
        if (result.fatal.type === 'app_older_than_data') {
          throw new AppError(
            'APP_OLDER_THAN_DATA',
            `This version of Aqua Nuqi is older than your data (schema ${result.fatal.schemaVersion}).`,
            result.fatal,
          )
        }
        throw new AppError(
          'INTERNAL',
          'Restore succeeded but the app failed to reopen the database',
        )
      }

      getAppContext().audit.record({
        action: 'restore',
        summary: `Restored database from ${input.backupFilePath}`,
        after: { backupFilePath: input.backupFilePath },
      })

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
