import { getAppContext } from '@main/app-context'
import {
  periodCloseInput,
  periodCloseOutput,
  periodIsClosedInput,
  periodIsClosedOutput,
  periodListInput,
  periodListOutput,
  periodReopenInput,
  periodReopenOutput,
} from '@shared/contracts'
import { defineHandler } from '../router'

export function registerPeriodHandlers(): void {
  defineHandler({
    channel: 'period:isClosed',
    input: periodIsClosedInput,
    output: periodIsClosedOutput,
    roles: 'authenticated',
    handler: (input) => ({ closed: getAppContext().period.isClosed(input.period) }),
  })

  defineHandler({
    channel: 'period:close',
    input: periodCloseInput,
    output: periodCloseOutput,
    roles: ['owner'],
    handler: (input, ctx) => {
      getAppContext().period.close(input.period, ctx.userId!, input.notes)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'period:reopen',
    input: periodReopenInput,
    output: periodReopenOutput,
    roles: ['owner'],
    handler: (input, ctx) => {
      getAppContext().period.reopen(input.period, ctx.userId!, input.reason)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'period:list',
    input: periodListInput,
    output: periodListOutput,
    roles: ['owner'],
    handler: () => ({ items: getAppContext().period.list() }),
  })
}
