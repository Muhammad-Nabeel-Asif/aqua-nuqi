import { create } from 'zustand'

type UiStore = {
  sidebarCollapsed: boolean
  commandOpen: boolean
  toggleSidebar: () => void
  setCommandOpen: (open: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}))
