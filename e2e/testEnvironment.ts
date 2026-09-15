// One source for the build, route interception and Supabase storage key.
export const SUPABASE_URL = 'https://e2e.supabase.co'
export const SUPABASE_KEY = 'e2e-anon-key'
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
export const FIXED_NOW = '2027-01-01T12:00:00+01:00'
export const TODAY = '2027-01-01'
