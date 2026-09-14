import type { Page, Route } from '@playwright/test'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
}

const customer = {
  id: 'c1', owner_id: user.id, code: 'ACME', name: 'ACME GmbH', currency: 'EUR',
  reporting_cycle: 'weekly', week_start_day: 'monday', rounding_minutes: 15,
  rounding_mode: 'nearest', invoice_email: null, notes: null, finops_legal_entity: null,
  finops_customer_id: null, is_active: true, created_at: '2026-01-01T00:00:00.000Z',
}

const project = {
  id: 'p1', customer_id: customer.id, code: 'CONS', name: 'Consulting', description: null,
  status: 'active', is_billable: true, start_date: null, end_date: null, budget_hours: null,
  budget_amount: null, rounding_minutes: null, rounding_mode: null, reporting_cycle: null,
  finops_project_id: null, finops_activity_number: null, created_at: '2026-01-01T00:00:00.000Z',
}

const activity = {
  id: 'a1', owner_id: user.id, code: 'CONS', name: 'Consulting', is_billable_default: true,
  is_default: true, rate_factor: 1, finops_category: null, sort_order: 10, is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

function isoToday() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function mockSupabase(page: Page) {
  const entries: Record<string, unknown>[] = []

  await page.addInitScript(({ user }) => {
    const now = Math.floor(Date.now() / 1000)
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: 'e2e-access-token', refresh_token: 'e2e-refresh-token', token_type: 'bearer',
      expires_in: 3600, expires_at: now + 3600, user,
    }))
  }, { user })

  await page.route('https://e2e.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.startsWith('/auth/v1/')) {
      return json(route, user)
    }

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      return json(route, 120)
    }

    if (!url.pathname.startsWith('/rest/v1/')) {
      return json(route, {})
    }

    const table = url.pathname.slice('/rest/v1/'.length)
    if (request.method() === 'POST' && table === 'time_entries') {
      const body = request.postDataJSON() as Record<string, unknown>
      entries.push({
        id: `te-${entries.length + 1}`, owner_id: user.id, project_id: project.id,
        activity_type_id: activity.id, work_package_id: null, work_date: body.work_date ?? isoToday(),
        start_time: null, end_time: null, duration_minutes: body.duration_minutes ?? 0,
        billable_minutes: body.duration_minutes ?? 0, is_billable: true,
        description: body.description ?? '', rate_snapshot: 120, period_id: null, status: 'draft',
        project_code: project.code, project_name: project.name, customer_id: customer.id,
        customer_code: customer.code, customer_name: customer.name, activity_code: activity.code,
        activity_name: activity.name, work_package_code: null, work_package_name: null,
        rate: 120, amount: 0, net_amount: 0, rate_is_frozen: false,
        iso_year: new Date().getFullYear(), iso_week: 1, week_start: isoToday(),
        month_start: isoToday().slice(0, 7) + '-01', year: new Date().getFullYear(),
        period_cycle: null, period_start: null, period_end: null, period_status: null,
      })
      return json(route, entries.at(-1), 201)
    }

    const single = request.headers()['accept']?.includes('application/vnd.pgrst.object+json')
    const data = tableData(table, entries, url)
    return json(route, single ? (Array.isArray(data) ? data[0] ?? null : data) : data)
  })
}

function tableData(table: string, entries: Record<string, unknown>[], url: URL): unknown {
  switch (table) {
    case 'customers': return [customer]
    case 'projects': return [project]
    case 'activity_types': return [activity]
    case 'v_work_package_budget': return []
    case 'work_packages': return []
    case 'reporting_periods': return []
    case 'v_time_entries_full': return entries
    case 'time_entries': return []
    case 'app_settings': {
      const key = url.searchParams.get('key') ?? ''
      if (key.includes('show_timer')) return { value: false }
      if (key.includes('income_tax_percent')) return { value: 42 }
      if (key.includes('theme')) return { value: 'system' }
      return null
    }
    default: return []
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: JSON.stringify(body),
  })
}
