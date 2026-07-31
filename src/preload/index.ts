import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type IpcResult<T = unknown> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }

const api = {
  invoke: <T = unknown>(channel: string, payload?: unknown): Promise<IpcResult<T>> => {
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
  },
  on: (channel: string, cb: (payload: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
