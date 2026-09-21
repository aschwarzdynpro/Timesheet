import type { Page, Route } from '@playwright/test'
import type { ReportingPeriod, ReportingPeriodStatus } from '../../src/types/database'
import { AUTH_STORAGE_KEY, FIXED_NOW, SUPABASE_URL, TODAY } from '../testEnvironment'
import { fromIsoDate, isoWeek, mondayOf, toIsoDate } from '../../src/lib/week'

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

function timeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const workDate = String(overrides.work_date ?? TODAY)
  const date = fromIsoDate(workDate)
  const week = isoWeek(date)
  return {
    id: 'te-existing', owner_id: user.id, project_id: project.id,
    activity_type_id: activity.id, work_package_id: null, work_date: workDate,
    start_time: null, end_time: null, duration_minutes: 60,
    billable_minutes: 60, is_billable: true,
    description: 'Bestehender E2E-Eintrag', rate_snapshot: 120, period_id: null, status: 'draft',
    project_code: project.code, project_name: project.name, customer_id: customer.id,
    customer_code: customer.code, customer_name: customer.name, activity_code: activity.code,
    activity_name: activity.name, work_package_code: null, work_package_name: null,
    rate: 120, amount: 120, net_amount: 69.6, rate_is_frozen: false,
    iso_year: week.year, iso_week: week.week, week_start: toIsoDate(mondayOf(date)),
    month_start: workDate.slice(0, 7) + '-01', year: date.getFullYear(),
    period_cycle: null, period_start: null, period_end: null, period_status: null,
    ...overrides,
  }
}

function session(now: number) {
  return {
    access_token: 'e2e-access-token', refresh_token: 'e2e-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user,
  }
}

type WriteMethod = 'POST' | 'PATCH' | 'DELETE'
export type MockWrite = { method: WriteMethod; id: string | null; body: Record<string, unknown> | null }
export type MockOptions = { periodStatus?: ReportingPeriodStatus }

export async function mockSupabase(page: Page, options: MockOptions = {}) {
  await page.clock.setFixedTime(new Date(FIXED_NOW))
  const entries: Record<string, unknown>[] = [
    timeEntry(options.periodStatus && options.periodStatus !== 'open' ? {
      status: options.periodStatus === 'invoiced' ? 'invoiced' : 'submitted',
      period_id: 'period-current', period_status: options.periodStatus,
    } : {}),
    timeEntry({ id: 'te-previous', work_date: '2026-12-25', description: 'Vorwoche' }),
    timeEntry({ id: 'te-next', work_date: '2027-01-08', description: 'Folgewoche' }),
  ]

  const periods: ReportingPeriod[] = options.periodStatus ? [{
    id: 'period-current', customer_id: customer.id, cycle: 'weekly',
    period_start: '2026-12-28', period_end: '2027-01-03', status: options.periodStatus,
    submitted_at: null, total_minutes: 60, total_fees: 120, total_expenses: 0,
    reopened_at: null, reopen_count: 0,
  }] : []
  const writes: MockWrite[] = []
  let nextFailure: { method: WriteMethod; message: string; status: number } | undefined
  let nextId = entries.length + 1

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value))
  }, { key: AUTH_STORAGE_KEY, value: session(Date.parse(FIXED_NOW)) })

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/auth/v1/user' && method === 'GET') return json(route, user)
    if (url.pathname === '/auth/v1/token' && method === 'POST'
      && url.searchParams.get('grant_type') === 'refresh_token') {
      return json(route, session(await page.evaluate(() => Date.now())))
    }
    if (url.pathname === '/rest/v1/rpc/fn_rate_for' && method === 'POST') {
      return json(route, 120)
    }
    if (!url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/rest/v1/rpc/')) {
      throw new Error(`Unmocked Supabase request: ${method} ${url.pathname}`)
    }

    const table = url.pathname.slice('/rest/v1/'.length)
    if (table === 'time_entries' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      const idFilter = url.searchParams.get('id')
      if (method !== 'POST' && (!idFilter?.startsWith('eq.') || url.searchParams.getAll('id').length !== 1)) {
        throw new Error(`Expected one id=eq filter for ${method}`)
      }
      const id = idFilter?.slice(3) ?? null
      const body = method === 'DELETE' ? null : request.postDataJSON() as Record<string, unknown>
      // The trigger owns these; sending them from the browser would put the
      // rounding and period rules into the interface a second time.
      for (const owned of ['billable_minutes', 'period_id', 'rate_snapshot']) {
        if (body && owned in body) throw new Error(`The database owns ${owned}; the interface must not send it`)
      }
      writes.push({ method: method as WriteMethod, id, body })
      if (nextFailure?.method === method) {
        const failure = nextFailure
        nextFailure = undefined
        return json(route, { code: 'P0001', message: failure.message }, failure.status)
      }
      if (method === 'POST') {
        const entry = timeEntry({
          ...body,
          id: `te-${nextId++}`,
          // Canned database outputs; these mocks do not validate rates/rounding/RLS.
          billable_minutes: body?.duration_minutes, amount: 0, net_amount: 0,
        })
        entries.push(entry)
        return json(route, entry, 201)
      }
      const index = entries.findIndex((entry) => entry.id === id)
      if (index < 0) throw new Error(`Unknown time entry: ${id}`)
      if (method === 'DELETE') {
        entries.splice(index, 1)
        return route.fulfill({ status: 204 })
      }
      // Same fixture as on insert, but a PATCH that leaves the duration alone
      // must not blank the value the previous write established.
      const updated = { ...entries[index], ...body }
      if (body && 'duration_minutes' in body) updated.billable_minutes = body.duration_minutes
      entries[index] = updated
      return json(route, updated)
    }
    if (method !== 'GET') throw new Error(`Unmocked Supabase method: ${method} ${table}`)

    const single = request.headers()['accept']?.includes('application/vnd.pgrst.object+json')
    const data = tableData(table, entries, periods, url)
    return json(route, single ? (Array.isArray(data) ? data[0] ?? null : data) : data)
  })
  return {
    writes,
    failNextWrite(method: WriteMethod, message: string, status = 500) {
      nextFailure = { method, message, status }
    },
  }
}

function tableData(table: string, entries: Record<string, unknown>[], periods: ReportingPeriod[], url: URL): unknown {
  switch (table) {
    case 'customers': return [customer]
    case 'projects': return [project]
    case 'activity_types': return [activity]
    case 'v_work_package_budget': return []
    case 'work_packages': return []
    case 'reporting_periods': return periods.filter((period) => {
      const start = url.searchParams.get('period_start')
      const end = url.searchParams.get('period_end')
      if (!start?.startsWith('lte.') || !end?.startsWith('gte.')) {
        throw new Error('Expected reporting period overlap filters')
      }
      return period.period_start <= start.slice(4) && period.period_end >= end.slice(4)
    })
    case 'v_time_entries_full': {
      const filters = url.searchParams.getAll('work_date')
      return entries.filter((entry) => filters.every((filter) => {
        const match = /^(gte|lte|eq)\.(\d{4}-\d{2}-\d{2})$/.exec(filter)
        if (!match) throw new Error(`Unsupported work_date filter: ${filter}`)
        const [, operator, date] = match
        const value = String(entry.work_date)
        if (!date) throw new Error('Missing work_date filter value')
        return operator === 'gte' ? value >= date : operator === 'lte' ? value <= date : value === date
      }))
    }
    case 'v_report_month': {
      // Die Zeitenansicht liest daraus das Honorar nach Steuern des Monats.
      // Fixture wie oben: dieselben Eintraege, je Monat zu einer Zeile addiert.
      const filter = url.searchParams.get('month_start')
      const match = /^eq\.(\d{4}-\d{2}-\d{2})$/.exec(filter ?? '')
      if (!match) throw new Error(`Unsupported month_start filter: ${filter}`)
      const month = match[1] as string
      const rows = entries.filter((entry) => entry.month_start === month)
      if (rows.length === 0) return []
      const sum = (feld: string) => rows.reduce((n, entry) => n + Number(entry[feld] ?? 0), 0)
      return [{
        owner_id: user.id, customer_id: customer.id, customer_name: customer.name,
        project_id: project.id, project_name: project.name,
        year: Number(month.slice(0, 4)), month_start: month,
        minutes_tracked: sum('duration_minutes'), minutes_billable: sum('billable_minutes'),
        minutes_internal: null, fees: sum('amount'), fees_net: sum('net_amount'),
      }]
    }
    case 'time_entries': return [] // recent-description suggestions
    case 'app_settings': {
      const key = url.searchParams.get('key')
      if (key === 'eq.show_timer') return { value: false }
      if (key === 'eq.income_tax_percent') return { value: 42 }
      if (key === 'eq.theme') return { value: 'system' }
      throw new Error(`Unmocked app setting: ${key}`)
    }
    default: throw new Error(`Unmocked Supabase table: ${table}`)
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}
