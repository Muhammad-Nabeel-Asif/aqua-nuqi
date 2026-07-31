import { create } from 'zustand'
import type { UserDto } from '@shared/contracts'

type SessionStore = {
  user: UserDto | null
  locked: boolean
  setupRequired: boolean
  ready: boolean
  setSession: (s: { user: UserDto | null; locked: boolean; setupRequired: boolean }) => void
  setReady: (ready: boolean) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  user: null,
  locked: false,
  setupRequired: false,
  ready: false,
  setSession: (s) => set(s),
  setReady: (ready) => set({ ready }),
}))
