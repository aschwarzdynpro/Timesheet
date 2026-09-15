import { defineConfig, devices } from '@playwright/test'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}; see docs/09-e2e-testing.md`)
  return value
}

const supabaseUrl = required('E2E_AUTH_SUPABASE_URL')
const publishableKey = required('E2E_AUTH_PUBLISHABLE_KEY')
if (new URL(supabaseUrl).protocol !== 'https:') throw new Error('The test Supabase URL must use HTTPS')
if (!publishableKey.startsWith('sb_publishable_')) throw new Error('Use a publishable key for the browser test')
required('E2E_AUTH_EMAIL')
required('E2E_AUTH_PASSWORD')

export default defineConfig({
  testDir: './auth',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    // Auth credentials and sessions must never appear in uploaded artifacts.
    trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'auth-chromium', use: { browserName: 'chromium', viewport: { width: 1400, height: 900 } } },
    { name: 'auth-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm --prefix .. run build && npm --prefix .. run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    env: { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: publishableKey },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
