import { defineConfig } from '@playwright/test'
import { SUPABASE_KEY, SUPABASE_URL } from './testEnvironment'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    timezoneId: 'Europe/Berlin',
    locale: 'de-DE',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  // Chromium touch/viewport coverage; this does not emulate Safari or iOS.
  projects: [
    { name: 'mobile-320', use: { viewport: { width: 320, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'desktop-1400', use: { viewport: { width: 1400, height: 900 } } },
  ],
  webServer: {
    command: 'npm --prefix .. run build && npm --prefix .. run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    env: { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: SUPABASE_KEY },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
