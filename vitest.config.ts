import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/main/ipc/trusted-ipc-sender.test.ts', 'src/server/web-app.test.ts', 'node_modules/**']
  }
})
