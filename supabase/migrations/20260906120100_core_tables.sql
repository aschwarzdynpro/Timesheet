-- Phase 1 – Fundament: Kerntabellen
--
-- Konventionen:
--   * Betraege in numeric, niemals float.
--   * Zeiten in Minuten (int), nicht in Dezimalstunden.
--   * Leistungsdatum als date, nicht timestamptz.
--   * currency ist Platzhalter und immer 'EUR' (siehe docs/02-architektur.md §3.2).

-- ---------------------------------------------------------------- Stammdaten

create table customers (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users on delete cascade,
  code                text not null check (length(btrim(code)) between 1 and 20),
  name                text not null check (length(btrim(name)) > 0),
  currency            char(3) not null default 'EUR',
  reporting_cycle     text not null default 'monthly'
                        check (reporting_cycle in ('weekly','monthly')),
  rounding_minutes    int  not null default 15 check (rounding_minutes between 1 and 120),
  rounding_mode       text not null default 'up'
                        check (rounding_mode in ('up','nearest','none')),
  invoice_email       text,
  notes               text,
  finops_legal_entity text,
  finops_customer_id  text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (owner_id, code)
);

comment on column customers.rounding_minutes is 'Abrechnungstakt in Minuten, Vorgabe 15';
comment on column customers.currency         is 'Platzhalter, aktuell immer EUR';

create table activity_types (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users on delete cascade,
  code                text not null check (length(btrim(code)) between 1 and 20),
  name                text not null check (length(btrim(name)) > 0),
  is_billable_default boolean not null default true,
  finops_category     text,
  sort_order          int not null default 100,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (owner_id, code)
);

create table projects (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references customers on delete restrict,
  code                   text not null check (length(btrim(code)) between 1 and 20),
  name                   text not null check (length(btrim(name)) > 0),
  description            text,
  status                 text not null default 'active'
                           check (status in ('active','paused','closed')),
  is_billable            boolean not null default true,
  start_date             date,
  end_date               date,
  budget_hours           numeric(10,2) check (budget_hours is null or budget_hours > 0),
  budget_amount          numeric(12,2) check (budget_amount is null or budget_amount > 0),
  -- NULL bedeutet jeweils: vom Kunden erben
  rounding_minutes       int  check (rounding_minutes is null or rounding_minutes between 1 and 120),
  rounding_mode          text check (rounding_mode is null or rounding_mode in ('up','nearest','none')),
  reporting_cycle        text check (reporting_cycle is null or reporting_cycle in ('weekly','monthly')),
  finops_project_id      text,
  finops_activity_number text,
  created_at             timestamptz not null default now(),
  unique (customer_id, code),
  constraint project_dates_valid check (end_date is null or start_date is null or end_date >= start_date)
);

create index projects_customer_idx on projects (customer_id);

-- ------------------------------------------------------- Stundesatz-Historie

create table project_rates (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects on delete cascade,
  activity_type_id uuid references activity_types on delete restrict,  -- NULL = gilt fuer alle
  hourly_rate      numeric(10,2) not null check (hourly_rate >= 0),
  currency         char(3) not null default 'EUR',
  valid_from       date not null,
  valid_to         date,                                               -- NULL = offen
  note             text,
  created_at       timestamptz not null default now(),
  constraint rate_period_valid check (valid_to is null or valid_to >= valid_from),
  -- Kein zweiter Satz fuer dieselbe Kombination im selben Zeitraum.
  -- coalesce faengt den NULL-Fall ab, weil NULL in EXCLUDE sonst nie kollidiert.
  constraint project_rates_no_overlap exclude using gist (
    project_id with =,
    coalesce(activity_type_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create index project_rates_project_idx on project_rates (project_id, valid_from desc);

-- --------------------------------------------------------- Reporting-Perioden

create table reporting_periods (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers on delete cascade,
  cycle          text not null check (cycle in ('weekly','monthly')),
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'open'
                   check (status in ('open','submitted','approved','invoiced')),
  submitted_at   timestamptz,
  total_minutes  int,
  total_fees     numeric(12,2),
  total_expenses numeric(12,2),
  created_at     timestamptz not null default now(),
  unique (customer_id, cycle, period_start),
  constraint period_bounds_valid check (period_end >= period_start)
);

create index reporting_periods_open_idx on reporting_periods (customer_id, status);

-- ------------------------------------------------------------- Zeiterfassung

create table time_entries (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users on delete cascade,
  project_id         uuid not null references projects on delete restrict,
  activity_type_id   uuid references activity_types on delete restrict,
  work_date          date not null,
  start_time         time,                                  -- optional, dokumentarisch
  end_time           time,
  duration_minutes   int not null check (duration_minutes > 0 and duration_minutes <= 1440),
  billable_minutes   int not null default 0 check (billable_minutes >= 0),
  is_billable        boolean not null default true,
  description        text not null check (length(btrim(description)) > 0),
  rate_snapshot      numeric(10,2),                         -- bei Periodenfreigabe eingefroren
  period_id          uuid references reporting_periods on delete restrict,
  status             text not null default 'draft'
                       check (status in ('draft','submitted','invoiced')),
  finops_sync_status text not null default 'none'
                       check (finops_sync_status in ('none','pending','synced','error')),
  finops_entry_id    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index time_entries_owner_date_idx on time_entries (owner_id, work_date desc);
create index time_entries_project_idx    on time_entries (project_id, work_date);
create index time_entries_period_idx     on time_entries (period_id) where period_id is not null;

-- -------------------------------------------------------------------- Spesen

create table expense_categories (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default auth.uid() references auth.users on delete cascade,
  code                    text not null check (length(btrim(code)) between 1 and 20),
  name                    text not null check (length(btrim(name)) > 0),
  entry_mode              text not null check (entry_mode in ('receipt','allowance')),
  unit_label              text,            -- 'km', 'Tag' – nur bei allowance
  default_unit_rate       numeric(10,4) check (default_unit_rate is null or default_unit_rate >= 0),
  is_rechargeable_default boolean not null default true,
  finops_category         text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  unique (owner_id, code),
  constraint allowance_needs_unit check (
    entry_mode <> 'allowance' or (unit_label is not null and default_unit_rate is not null)
  )
);

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users on delete cascade,
  project_id      uuid not null references projects on delete restrict,
  category_id     uuid not null references expense_categories on delete restrict,
  expense_date    date not null,
  description     text not null check (length(btrim(description)) > 0),
  quantity        numeric(10,2) check (quantity is null or quantity > 0),
  unit_rate       numeric(10,4) check (unit_rate is null or unit_rate >= 0),
  amount_net      numeric(12,2) not null check (amount_net >= 0),
  vat_rate        numeric(5,2) check (vat_rate is null or vat_rate between 0 and 100),
  amount_gross    numeric(12,2) check (amount_gross is null or amount_gross >= 0),
  currency        char(3) not null default 'EUR',
  is_rechargeable boolean not null default true,
  markup_percent  numeric(5,2) not null default 0 check (markup_percent >= 0),
  receipt_path    text,                    -- Storage-Pfad, NULL bei Pauschale
  period_id       uuid references reporting_periods on delete restrict,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','invoiced')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Menge und Satz treten nur gemeinsam auf (Pauschale) oder gar nicht (Beleg)
  constraint expense_mode check (
    (quantity is null and unit_rate is null) or
    (quantity is not null and unit_rate is not null)
  )
);

create index expenses_owner_date_idx on expenses (owner_id, expense_date desc);
create index expenses_project_idx    on expenses (project_id, expense_date);
create index expenses_period_idx     on expenses (period_id) where period_id is not null;

-- ------------------------------------------------- Arbeitszeit und Abwesenheit

create table work_schedules (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  valid_from  date not null,
  valid_to    date,
  minutes_mon int not null default 480 check (minutes_mon between 0 and 1440),
  minutes_tue int not null default 480 check (minutes_tue between 0 and 1440),
  minutes_wed int not null default 480 check (minutes_wed between 0 and 1440),
  minutes_thu int not null default 480 check (minutes_thu between 0 and 1440),
  minutes_fri int not null default 480 check (minutes_fri between 0 and 1440),
  minutes_sat int not null default 0   check (minutes_sat between 0 and 1440),
  minutes_sun int not null default 0   check (minutes_sun between 0 and 1440),
  created_at  timestamptz not null default now(),
  constraint schedule_period_valid check (valid_to is null or valid_to >= valid_from),
  constraint work_schedules_no_overlap exclude using gist (
    owner_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create table absences (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  date_from  date not null,
  date_to    date not null,
  kind       text not null check (kind in ('vacation','sick','training','other')),
  note       text,
  created_at timestamptz not null default now(),
  constraint absence_dates_valid check (date_to >= date_from)
);

create index absences_owner_idx on absences (owner_id, date_from);

create table holidays (
  owner_id     uuid not null default auth.uid() references auth.users on delete cascade,
  holiday_date date not null,
  region       text not null,            -- 'DE-BY', 'DE-NW', …
  name         text not null,
  primary key (owner_id, holiday_date, region)
);

-- ------------------------------------------------------ Export und Protokoll

create table export_profiles (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  target     text not null check (target in ('excel','csv','finops')),
  columns    jsonb not null default '[]'::jsonb,
  filters    jsonb not null default '{}'::jsonb,
  group_by   jsonb not null default '[]'::jsonb,
  customer_id uuid references customers on delete cascade,   -- optionaler Standard je Kunde
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table finops_sync_log (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  time_entry_id uuid references time_entries on delete set null,
  period_id     uuid references reporting_periods on delete set null,
  status        text not null check (status in ('success','error')),
  http_status   int,
  request       jsonb,
  response      jsonb,
  error_message text,
  created_at    timestamptz not null default now()
);

create index finops_sync_log_period_idx on finops_sync_log (period_id, created_at desc);

create table app_settings (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  key      text not null,
  value    jsonb not null,
  primary key (owner_id, key)
);
