/**
 * Handgeschriebene Typen zum Schema aus supabase/migrations.
 *
 * Sobald ein Supabase-Projekt verbunden ist, laesst sich diese Datei mit
 * `npm run db:types` aus der Datenbank erzeugen. Bis dahin ist sie die
 * Vertragsgrundlage zwischen Oberflaeche und Schema und muss bei
 * Schemaaenderungen mitgepflegt werden.
 */

export type ReportingCycle = 'weekly' | 'monthly'
export type RoundingMode = 'up' | 'nearest' | 'none'
export type ProjectStatus = 'active' | 'paused' | 'closed'

export interface Customer {
  id: string
  owner_id: string
  code: string
  name: string
  currency: string
  reporting_cycle: ReportingCycle
  rounding_minutes: number
  rounding_mode: RoundingMode
  invoice_email: string | null
  notes: string | null
  finops_legal_entity: string | null
  finops_customer_id: string | null
  is_active: boolean
  created_at: string
}

export interface ActivityType {
  id: string
  owner_id: string
  code: string
  name: string
  is_billable_default: boolean
  finops_category: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Project {
  id: string
  customer_id: string
  code: string
  name: string
  description: string | null
  status: ProjectStatus
  is_billable: boolean
  start_date: string | null
  end_date: string | null
  budget_hours: number | null
  budget_amount: number | null
  rounding_minutes: number | null
  rounding_mode: RoundingMode | null
  reporting_cycle: ReportingCycle | null
  finops_project_id: string | null
  finops_activity_number: string | null
  created_at: string
}

export interface ProjectRate {
  id: string
  project_id: string
  activity_type_id: string | null
  hourly_rate: number
  currency: string
  valid_from: string
  valid_to: string | null
  note: string | null
  created_at: string
}

type Insertable<T, Optional extends keyof T> = Omit<T, 'id' | 'created_at' | Optional> &
  Partial<Pick<T, Optional>>

export type CustomerInsert = Insertable<Customer, 'owner_id' | 'currency' | 'is_active'>
export type ActivityTypeInsert = Insertable<ActivityType, 'owner_id' | 'is_active'>
export type ProjectInsert = Insertable<Project, never>
export type ProjectRateInsert = Insertable<ProjectRate, 'currency'>
