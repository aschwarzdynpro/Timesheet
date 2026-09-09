/**
 * Handgeschriebene Typen zum Schema aus supabase/migrations.
 *
 * Sobald ein Supabase-Projekt verbunden ist, laesst sich diese Datei mit
 * `npm run db:types` aus der Datenbank erzeugen. Bis dahin ist sie die
 * Vertragsgrundlage zwischen Oberflaeche und Schema und muss bei
 * Schemaaenderungen mitgepflegt werden.
 */

export type ReportingCycle = 'weekly' | 'monthly'
/** Erster Tag der Meldewoche; wirkt nur bei woechentlicher Meldung. */
export type WeekStartDay = 'monday' | 'sunday'
export type RoundingMode = 'up' | 'nearest' | 'none'
export type ProjectStatus = 'active' | 'paused' | 'closed'

export interface Customer {
  id: string
  owner_id: string
  code: string
  name: string
  currency: string
  reporting_cycle: ReportingCycle
  week_start_day: WeekStartDay
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
  /** Vorbelegung fuer neue Zeiteintraege. Hoechstens eine Art traegt sie - die
      Datenbank setzt die vorige beim Speichern zurueck. */
  is_default: boolean
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

/** Gliederung innerhalb eines Projekts; traegt spaeter Budgets und Auswertungen. */
export interface WorkPackage {
  id: string
  project_id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  budget_hours: number | null
  budget_amount: number | null
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
export type ActivityTypeInsert = Insertable<ActivityType, 'owner_id' | 'is_active' | 'is_default'>
export type ProjectInsert = Insertable<Project, never>
export type ProjectRateInsert = Insertable<ProjectRate, 'currency'>

/** Sicht v_work_package_budget: Budget und Verbrauch ueber die Laufzeit. */
export interface WorkPackageBudget {
  work_package_id: string
  project_id: string
  code: string
  name: string
  is_active: boolean
  sort_order: number
  budget_hours: number | null
  budget_amount: number | null
  tracked_minutes: number
  billable_minutes: number
  fees: number
  entry_count: number
  expenses_recharged: number
  description: string | null
}
export type WorkPackageInsert = Insertable<WorkPackage, 'is_active' | 'sort_order'>

export type TimeEntryStatus = 'draft' | 'submitted' | 'invoiced'

export interface TimeEntry {
  id: string
  owner_id: string
  project_id: string
  activity_type_id: string | null
  /** Optional; muss zum Projekt gehoeren - die Datenbank prueft das mit. */
  work_package_id: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  /** Vom Trigger gesetzt: gerundet nach Kunden-/Projektregel. Nie selbst schreiben. */
  billable_minutes: number
  is_billable: boolean
  description: string
  rate_snapshot: number | null
  /** Vom Trigger gesetzt. */
  period_id: string | null
  status: TimeEntryStatus
  created_at: string
  updated_at: string
}

/** Angereicherte Sicht v_time_entries_full – enthaelt Satz und Betrag. */
export interface TimeEntryFull extends Omit<TimeEntry, 'created_at' | 'updated_at'> {
  work_package_code: string | null
  work_package_name: string | null
  project_code: string
  project_name: string
  customer_id: string
  customer_code: string
  customer_name: string
  activity_code: string | null
  activity_name: string | null
  rate: number | null
  amount: number
  /**
   * Honorar abzueglich des Einkommensteuersatzes aus dem Profil.
   *
   * Optional getypt, obwohl die Sicht die Spalte immer liefert: Solange eine
   * Migration noch nicht eingespielt ist, fehlt sie in der Antwort - und eine
   * stillschweigende 0,00 EUR waere eine erfundene Zahl.
   */
  net_amount?: number
  rate_is_frozen: boolean
  iso_year: number
  iso_week: number
  week_start: string
  month_start: string
  year: number
}

/** Was die Oberflaeche schreiben darf. billable_minutes und period_id gehoeren dem Trigger. */
export interface TimeEntryInput {
  project_id: string
  activity_type_id: string | null
  work_package_id: string | null
  work_date: string
  duration_minutes: number
  description: string
  is_billable: boolean
}

export interface ReportingPeriod {
  id: string
  customer_id: string
  cycle: ReportingCycle
  period_start: string
  period_end: string
  status: 'open' | 'submitted' | 'approved' | 'invoiced'
  submitted_at: string | null
  total_minutes: number | null
  total_fees: number | null
  total_expenses: number | null
  reopened_at: string | null
  reopen_count: number
}

/** Protokoll je Periode: was wann gemeldet und was zurueckgenommen wurde. */
export interface PeriodEvent {
  id: string
  period_id: string
  event: 'submitted' | 'reopened'
  note: string | null
  total_minutes: number | null
  total_fees: number | null
  created_at: string
}

export type ExpenseEntryMode = 'receipt' | 'allowance'

export interface ExpenseCategory {
  id: string
  owner_id: string
  code: string
  name: string
  entry_mode: ExpenseEntryMode
  /** Nur bei Pauschalen: die Einheit, z. B. "km" oder "Tag". */
  unit_label: string | null
  default_unit_rate: number | null
  is_rechargeable_default: boolean
  finops_category: string | null
  is_active: boolean
  created_at: string
}

export type ExpenseCategoryInsert = Omit<ExpenseCategory, 'id' | 'created_at' | 'owner_id'> &
  Partial<Pick<ExpenseCategory, 'owner_id'>>

export interface Expense {
  id: string
  owner_id: string
  project_id: string
  /** Optional; muss zum Projekt gehoeren - die Datenbank prueft das mit. */
  work_package_id: string | null
  category_id: string
  expense_date: string
  description: string
  /** Pauschale: Menge und Satz gemeinsam. Beleg: beide leer. */
  quantity: number | null
  unit_rate: number | null
  amount_net: number
  vat_rate: number | null
  amount_gross: number | null
  currency: string
  is_rechargeable: boolean
  markup_percent: number
  receipt_path: string | null
  period_id: string | null
  status: 'draft' | 'submitted' | 'invoiced'
  created_at: string
  updated_at: string
}

/** Angereicherte Sicht v_expenses_full. */
export interface ExpenseFull extends Omit<Expense, 'created_at' | 'updated_at' | 'category_id'> {
  work_package_code: string | null
  work_package_name: string | null
  amount_recharged: number
  category_code: string
  category_name: string
  category_entry_mode: ExpenseEntryMode
  project_code: string
  project_name: string
  customer_id: string
  customer_code: string
  customer_name: string
  iso_year: number
  iso_week: number
  week_start: string
  month_start: string
  year: number
}

export interface ExpenseInput {
  project_id: string
  work_package_id: string | null
  category_id: string
  expense_date: string
  description: string
  quantity: number | null
  unit_rate: number | null
  amount_net: number
  vat_rate: number | null
  amount_gross: number | null
  is_rechargeable: boolean
  markup_percent: number
  receipt_path: string | null
}

export interface WorkSchedule {
  id: string
  owner_id: string
  valid_from: string
  valid_to: string | null
  minutes_mon: number
  minutes_tue: number
  minutes_wed: number
  minutes_thu: number
  minutes_fri: number
  minutes_sat: number
  minutes_sun: number
  created_at: string
}

export type WorkScheduleInsert = Omit<WorkSchedule, 'id' | 'created_at' | 'owner_id'>

export type AbsenceKind = 'vacation' | 'sick' | 'training' | 'other'

export interface Absence {
  id: string
  owner_id: string
  date_from: string
  date_to: string
  kind: AbsenceKind
  note: string | null
  created_at: string
}

export type AbsenceInsert = Omit<Absence, 'id' | 'created_at' | 'owner_id'>

export interface HolidayRow {
  owner_id: string
  holiday_date: string
  region: string
  name: string
}
