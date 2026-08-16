import type { Page } from '@playwright/test'

export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }

export async function invokeRaw<T>(
  page: Page,
  channel: string,
  payload: unknown = {},
): Promise<IpcResult<T>> {
  await page.waitForFunction('Boolean(window.api)')
  return page.evaluate(
    `window.api.invoke(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`,
  ) as Promise<IpcResult<T>>
}

export async function invoke<T>(page: Page, channel: string, payload: unknown = {}): Promise<T> {
  const result = await invokeRaw<T>(page, channel, payload)
  if (!result.ok) {
    const err = new Error(`${result.error.code}: ${result.error.message}`) as Error & {
      code: string
    }
    err.code = result.error.code
    throw err
  }
  return result.data
}
