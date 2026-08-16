import { BrowserWindow } from 'electron'
import { getAppContext } from '@main/app-context'
import {
  changePasswordInput,
  changePasswordOutput,
  clearPinInput,
  clearPinOutput,
  createUserInput,
  createUserOutput,
  forceLogoutInput,
  forceLogoutOutput,
  generateRecoveryCodeInput,
  generateRecoveryCodeOutput,
  listUsersInput,
  listUsersOutput,
  lockSessionInput,
  lockSessionOutput,
  loginInput,
  loginOutput,
  logoutInput,
  logoutOutput,
  passwordStrengthInput,
  passwordStrengthOutput,
  resetOwnerWithRecoveryInput,
  resetOwnerWithRecoveryOutput,
  resetPasswordInput,
  resetPasswordOutput,
  sessionGetInput,
  sessionGetOutput,
  setPinInput,
  setPinOutput,
  setUserActiveInput,
  setUserActiveOutput,
  unlockInput,
  unlockOutput,
  updateUserInput,
  updateUserOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerAuthHandlers(): void {
  defineHandler({
    channel: 'auth:login',
    input: loginInput,
    output: loginOutput,
    roles: 'public',
    handler: async (input) => {
      const { auth } = getAppContext()
      const user = await auth.login(input.username, input.password)
      return { user }
    },
  })

  defineHandler({
    channel: 'auth:logout',
    input: logoutInput,
    output: logoutOutput,
    roles: 'authenticated',
    handler: () => {
      getAppContext().auth.logout()
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:session',
    input: sessionGetInput,
    output: sessionGetOutput,
    roles: 'public',
    handler: () => {
      const ctx = getAppContext()
      const session = ctx.auth.getSession()
      return {
        user: session.user,
        locked: session.locked,
        setupRequired: ctx.setupRequired,
      }
    },
  })

  defineHandler({
    channel: 'auth:lock',
    input: lockSessionInput,
    output: lockSessionOutput,
    roles: 'authenticated',
    handler: () => {
      getAppContext().auth.lock()
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('auth:locked', {})
      }
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:unlock',
    input: unlockInput,
    output: unlockOutput,
    roles: 'public',
    handler: async (input) => {
      await getAppContext().auth.unlock(input)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:createUser',
    input: createUserInput,
    output: createUserOutput,
    roles: ['owner'],
    handler: async (input) => {
      const user = await getAppContext().auth.createUser(input)
      return { user }
    },
  })

  defineHandler({
    channel: 'auth:listUsers',
    input: listUsersInput,
    output: listUsersOutput,
    roles: ['owner'],
    handler: () => ({ items: getAppContext().auth.listUsers() }),
  })

  defineHandler({
    channel: 'auth:updateUser',
    input: updateUserInput,
    output: updateUserOutput,
    roles: ['owner'],
    handler: (input) => {
      const user = getAppContext().auth.updateUser(input.userId, {
        displayName: input.displayName,
        role: input.role,
      })
      return { user }
    },
  })

  defineHandler({
    channel: 'auth:setUserActive',
    input: setUserActiveInput,
    output: setUserActiveOutput,
    roles: ['owner'],
    handler: (input) => {
      const user = getAppContext().auth.setUserActive(input.userId, input.isActive)
      return { user }
    },
  })

  defineHandler({
    channel: 'auth:resetPassword',
    input: resetPasswordInput,
    output: resetPasswordOutput,
    roles: ['owner'],
    handler: async (input) => {
      await getAppContext().auth.resetPassword(input.userId, input.newPassword)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:clearPin',
    input: clearPinInput,
    output: clearPinOutput,
    roles: ['owner'],
    handler: async (input) => {
      await getAppContext().auth.clearPin(input.userId)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:forceLogout',
    input: forceLogoutInput,
    output: forceLogoutOutput,
    roles: ['owner'],
    handler: (input) => {
      getAppContext().auth.forceLogout(input.userId)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:changePassword',
    input: changePasswordInput,
    output: changePasswordOutput,
    roles: 'authenticated',
    handler: async (input, ctx) => {
      await getAppContext().auth.changePassword(
        ctx.userId!,
        input.currentPassword,
        input.newPassword,
      )
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:setPin',
    input: setPinInput,
    output: setPinOutput,
    roles: 'authenticated',
    handler: async (input, ctx) => {
      await getAppContext().auth.setPin(ctx.userId!, input.pin, input.password)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'auth:generateRecoveryCode',
    input: generateRecoveryCodeInput,
    output: generateRecoveryCodeOutput,
    roles: ['owner'],
    handler: async () => {
      const recoveryCode = await getAppContext().auth.generateRecoveryCode()
      return { recoveryCode }
    },
  })

  defineHandler({
    channel: 'auth:resetOwnerWithRecovery',
    input: resetOwnerWithRecoveryInput,
    output: resetOwnerWithRecoveryOutput,
    roles: 'public',
    handler: async (input) => {
      const user = await getAppContext().auth.resetOwnerWithRecovery(input)
      return { user }
    },
  })

  defineHandler({
    channel: 'auth:passwordStrength',
    input: passwordStrengthInput,
    output: passwordStrengthOutput,
    roles: 'public',
    handler: (input) => getAppContext().auth.passwordStrength(input.password),
  })
}
