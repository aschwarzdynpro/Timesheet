-- Phase 1 – Fundament: Views fuer Auswertungen
--
-- security_invoker = true ist hier keine Feinheit, sondern notwendig: ohne das
-- wuerden Views mit den Rechten ihres Eigentuemers laufen und die RLS-Policies
-- der Basistabellen umgehen.

create view v_time_entries_full
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
  -- Eingefrorener Satz gewinnt, sonst der zum Leistungsdatum gueltige.
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
  extract(year    from t.work_date)::int as year
from time_entries t
join projects   p on p.id = t.project_id
join customers  c on c.id = p.customer_id
left join activity_types a on a.id = t.activity_type_id;

create view v_expenses_full
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
  extract(year    from e.expense_date)::int as year
from expenses e
join expense_categories cat on cat.id = e.category_id
join projects  p on p.id = e.project_id
join customers c on c.id = p.customer_id;

-- Aggregate. Bewusst je Kunde und Projekt gruppiert – das ist die Granularitaet,
-- in der gemeldet und abgerechnet wird.

create view v_report_week
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  iso_year, iso_week, week_start,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name,
         iso_year, iso_week, week_start;

create view v_report_month
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  year, month_start,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name, year, month_start;

create view v_report_year
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  year,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name, year;

-- Aktueller Satz je Projekt und Taetigkeitsart – fuer die Stammdatenpflege,
-- damit die Oberflaeche nicht selbst durch die Historie laufen muss.
create view v_project_current_rate
with (security_invoker = true) as
select
  p.id            as project_id,
  r.activity_type_id,
  a.name          as activity_name,
  r.hourly_rate,
  r.valid_from,
  r.valid_to
from projects p
join project_rates r on r.project_id = p.id
                    and daterange(r.valid_from, r.valid_to, '[]') @> current_date
left join activity_types a on a.id = r.activity_type_id;
