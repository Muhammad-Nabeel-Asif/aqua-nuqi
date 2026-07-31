import { getAppContext } from '@main/app-context'
import {
  changePasswordInput,
  changePasswordOutput,
  createUserInput,
  createUserOutput,
  listUsersInput,
  listUsersOutput,
  lockSessionInput,
  lockSessionOutput,
  loginInput,
  loginOutput,
  logoutInput,
  logoutOutput,
  sessionGetInput,
  sessionGetOutput,
  setPinInput,
  setPinOutput,
  unlockInput,
  unlockOutput,
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
}
