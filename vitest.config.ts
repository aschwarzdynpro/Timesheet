import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Geprueft wird in der Zeitzone, in der die App laeuft. In UTC faellt keine
    // der Zeitzonenfallen auf, vor denen AGENTS.md warnt: lokale Mitternacht
    // und UTC-Mitternacht sind dort dasselbe, und ein Datum, das beim Umrechnen
    // einen Tag verliert, bliebe gruen.
    env: { TZ: 'Europe/Berlin' },
  },
})
