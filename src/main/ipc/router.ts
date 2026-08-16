import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ZodTypeAny, z } from 'zod'
import { log } from '@main/lib/logger'
import type { AuthService } from '@main/services/auth.service'
import type { Role } from '@shared/constants'
import { AppError, isAppError, type AppErrorPayload } from '@shared/errors'
import { zodErrorMessage } from '@shared/validation-message'
import { resolveHandlerAccess } from './access'

export type HandlerContext = {
  event: IpcMainInvokeEvent
  userId: number | null
  role: Role | null
}

/**
 * defineHandler({ channel, input, output, roles, handler })
 *
 * - `roles: 'public'` — no session required
 * - `roles: 'authenticated'` — any logged-in unlocked user
 * - `roles: ['owner', ...]` — one of the listed roles
 */
export type DefineHandlerArgs<TInput extends ZodTypeAny, TOutput extends ZodTypeAny> = {
  channel: string
  input: TInput
  output: TOutput
  roles: readonly Role[] | 'public' | 'authenticated'
  handler: (input: z.infer<TInput>, ctx: HandlerContext) => unknown | Promise<unknown>
}

export type IpcResult<T = unknown> = { ok: true; data: T } | { ok: false; error: AppErrorPayload }

let authServiceRef: AuthService | null = null

export function setRouterAuth(auth: AuthService): void {
  authServiceRef = auth
}

export function defineHandler<TInput extends ZodTypeAny, TOutput extends ZodTypeAny>(
  args: DefineHandlerArgs<TInput, TOutput>,
): void {
  ipcMain.removeHandler(args.channel)
  ipcMain.handle(args.channel, async (event, payload: unknown): Promise<IpcResult> => {
    try {
      const parsed = args.input.safeParse(payload ?? {})
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          zodErrorMessage(parsed.error),
          parsed.error.flatten(),
        )
      }

      const access = resolveHandlerAccess(args.roles, authServiceRef?.getSession() ?? null)

      const result = await args.handler(parsed.data, {
        event,
        userId: access.userId,
        role: access.role,
      })

      if (process.env.NODE_ENV !== 'production') {
        const out = args.output.safeParse(result)
        if (!out.success) {
          log.warn(`Output validation failed for ${args.channel}`, out.error.flatten())
        }
      }

      return { ok: true, data: result }
    } catch (err) {
      const error = toErrorPayload(err)
      if (error.code === 'INTERNAL') {
        log.error(`IPC ${args.channel} failed`, err)
      }
      return { ok: false, error }
    }
  })
}

function toErrorPayload(err: unknown): AppErrorPayload {
  if (isAppError(err)) return err.toPayload()
  if (err instanceof Error) {
    return { code: 'INTERNAL', message: 'An unexpected error occurred', details: err.message }
  }
  return { code: 'INTERNAL', message: 'An unexpected error occurred' }
}
