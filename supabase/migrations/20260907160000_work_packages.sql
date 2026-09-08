-- Arbeitspakete je Projekt
--
-- Bisher war die feinste Gliederung einer Buchung Projekt + Taetigkeitsart.
-- Beides sagt aber nichts darueber, *woran* gearbeitet wurde: "Migration",
-- "Schulung", "Change 42". Genau darauf sollen spaeter Budgets und Auswertungen
-- laufen, deshalb ist es eine eigene Tabelle am Projekt und kein Textfeld.
--
-- Die Taetigkeitsart bleibt daneben bestehen: sie beschreibt die Art der Arbeit
-- (Beratung, Reisezeit) und traegt die Satzlogik. Das Arbeitspaket beschreibt
-- den Gegenstand. Ein Reisetag zum Arbeitspaket "Schulung" ist beides zugleich.

create table work_packages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects on delete cascade,
  code          text not null check (length(btrim(code)) between 1 and 20),
  name          text not null check (length(btrim(name)) > 0),
  description   text,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  -- Fuer die spaetere Budgetierung. Dieselbe Form wie am Projekt, damit die
  -- vorhandene Budgetampel spaeter ohne Schemaaenderung darauf zeigen kann.
  budget_hours  numeric(10,2) check (budget_hours is null or budget_hours > 0),
  budget_amount numeric(12,2) check (budget_amount is null or budget_amount > 0),
  created_at    timestamptz not null default now(),
  unique (project_id, code)
);

create index work_packages_project_idx on work_packages (project_id, sort_order);

comment on table work_packages is
  'Gliederung innerhalb eines Projekts; Traeger spaeterer Budgets und Auswertungen';

alter table work_packages enable row level security;

-- Wie bei reporting_periods haengt die Zugehoerigkeit am Eigentuemer des
-- Projekts, nicht an einer eigenen owner_id.
create policy work_packages_owner_all on work_packages
  for all to authenticated
  using (exists (
    select 1 from projects p join customers c on c.id = p.customer_id
    where p.id = work_packages.project_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from projects p join customers c on c.id = p.customer_id
    where p.id = work_packages.project_id and c.owner_id = (select auth.uid())
  ));

-- ------------------------------------------------------------- An der Buchung

-- Nullable: bestehende Zeiten haben keines, und nicht jedes Projekt gliedert.
-- restrict beim Loeschen, damit kein Paket verschwindet, auf das gebucht wurde.
alter table time_entries
  add column work_package_id uuid references work_packages on delete restrict;

create index time_entries_work_package_idx on time_entries (work_package_id);

comment on column time_entries.work_package_id is
  'Optionales Arbeitspaket; muss zum Projekt der Buchung gehoeren';

alter table expenses
  add column work_package_id uuid references work_packages on delete restrict;

create index expenses_work_package_idx on expenses (work_package_id);

-- Ein Arbeitspaket eines fremden Projekts waere eine stille Fehlbuchung, die
-- erst in der Auswertung auffiele. Die Regel gehoert deshalb in die Datenbank,
-- nicht in das Formular.
create or replace function fn_assert_work_package_fits(
  p_work_package_id uuid, p_project_id uuid
) returns void
language plpgsql stable security invoker set search_path = public as $$
declare
  v_project uuid;
begin
  if p_work_package_id is null then
    return;
  end if;

  select project_id into v_project from work_packages where id = p_work_package_id;

  if v_project is null then
    raise exception 'Arbeitspaket % existiert nicht', p_work_package_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_project <> p_project_id then
    raise exception 'Das Arbeitspaket gehoert zu einem anderen Projekt'
      using errcode = 'check_violation';
  end if;
end
$$;

-- Die Vorbereitungs-Trigger pruefen es mit, damit jeder Schreibweg erfasst ist.
create or replace function trg_time_entry_prepare()
returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid;
  v_cycle       text;
  v_billable    boolean;
  v_rounding    record;
begin
  select p.customer_id, fn_effective_cycle(p.id), p.is_billable
    into v_customer_id, v_cycle, v_billable
  from projects p
  where p.id = new.project_id;

  if v_customer_id is null then
    raise exception 'Projekt % existiert nicht', new.project_id using errcode = 'foreign_key_violation';
  end if;

  perform fn_assert_work_package_fits(new.work_package_id, new.project_id);

  -- Ein nicht abrechenbares Projekt kann keine abrechenbare Zeit haben.
  if not v_billable then
    new.is_billable := false;
  end if;

  select * into v_rounding from fn_effective_rounding(new.project_id);

  new.billable_minutes := case
    when new.is_billable
      then fn_round_minutes(new.duration_minutes, v_rounding.rounding_minutes, v_rounding.rounding_mode)
    else 0
  end;

  new.period_id  := fn_ensure_period(v_customer_id, v_cycle, new.work_date);
  new.updated_at := now();

  -- Sowohl die alte als auch die neue Periode muessen offen sein, sonst liesse
  -- sich ein Eintrag aus einer gemeldeten Periode herausbuchen.
  if tg_op = 'UPDATE' then
    perform fn_assert_period_open(old.period_id);
  end if;
  perform fn_assert_period_open(new.period_id);

  return new;
end
$$;

create or replace function trg_expense_prepare()
returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid;
  v_cycle       text;
begin
  select p.customer_id, fn_effective_cycle(p.id)
    into v_customer_id, v_cycle
  from projects p
  where p.id = new.project_id;

  if v_customer_id is null then
    raise exception 'Projekt % existiert nicht', new.project_id using errcode = 'foreign_key_violation';
  end if;

  perform fn_assert_work_package_fits(new.work_package_id, new.project_id);

  -- Pauschale: Betrag ergibt sich aus Menge mal Satz und wird nicht frei erfasst.
  if new.quantity is not null and new.unit_rate is not null then
    new.amount_net := round(new.quantity * new.unit_rate, 2);
  end if;

  new.period_id  := fn_ensure_period(v_customer_id, v_cycle, new.expense_date);
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    perform fn_assert_period_open(old.period_id);
  end if;
  perform fn_assert_period_open(new.period_id);

  return new;
end
$$;

-- ------------------------------------------------------------------- Sichten

create or replace view v_time_entries_full
with (security_invoker = true) as
select
  t.id,
  t.owner_id,
  t.project_id,
  t.activity_type_id,
  t.work_date,
  t.start_time,
  t.end_time,
  t.duration_minutes,
  t.billable_minutes,
  t.is_billable,
  t.description,
  t.status,
  t.period_id,
  p.code            as project_code,
  p.name            as project_name,
  c.id              as customer_id,
  c.code            as customer_code,
  c.name            as customer_name,
  a.code            as activity_code,
  a.name            as activity_name,
  coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.activity_type_id, t.work_date)) as rate,
  round(
    t.billable_minutes / 60.0
    * coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.activity_type_id, t.work_date), 0)
  , 2)              as amount,
  t.rate_snapshot is not null as rate_is_frozen,
  extract(isoyear from t.work_date)::int as iso_year,
  extract(week    from t.work_date)::int as iso_week,
  date_trunc('week',  t.work_date)::date as week_start,
  date_trunc('month', t.work_date)::date as month_start,
  extract(quarter from t.work_date)::int as quarter,
  extract(year    from t.work_date)::int as year,
  t.created_at,
  t.updated_at,
  -- Angehaengt statt eingeschoben: create or replace view darf Spalten nur
  -- ergaenzen, und die Auswertungssichten haengen an dieser hier.
  t.work_package_id,
  w.code            as work_package_code,
  w.name            as work_package_name
from time_entries t
join projects   p on p.id = t.project_id
join customers  c on c.id = p.customer_id
left join activity_types a on a.id = t.activity_type_id
left join work_packages  w on w.id = t.work_package_id;

create or replace view v_expenses_full
with (security_invoker = true) as
select
  e.id,
  e.owner_id,
  e.project_id,
  e.expense_date,
  e.description,
  e.quantity,
  e.unit_rate,
  e.amount_net,
  e.vat_rate,
  e.amount_gross,
  e.is_rechargeable,
  e.markup_percent,
  e.receipt_path,
  e.status,
  e.period_id,
  round(e.amount_net * (1 + e.markup_percent / 100.0), 2) as amount_recharged,
  cat.code          as category_code,
  cat.name          as category_name,
  cat.entry_mode    as category_entry_mode,
  p.code            as project_code,
  p.name            as project_name,
  c.id              as customer_id,
  c.code            as customer_code,
  c.name            as customer_name,
  extract(isoyear from e.expense_date)::int as iso_year,
  extract(week    from e.expense_date)::int as iso_week,
  date_trunc('week',  e.expense_date)::date as week_start,
  date_trunc('month', e.expense_date)::date as month_start,
  extract(year    from e.expense_date)::int as year,
  e.created_at,
  e.updated_at,
  e.work_package_id,
  w.code            as work_package_code,
  w.name            as work_package_name
from expenses e
join expense_categories cat on cat.id = e.category_id
join projects  p on p.id = e.project_id
join customers c on c.id = p.customer_id
left join work_packages w on w.id = e.work_package_id;
