import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    name: 'renderer',
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.test.tsx'],
    setupFiles: ['./src/renderer/src/test/setup.ts'],
  },
})
