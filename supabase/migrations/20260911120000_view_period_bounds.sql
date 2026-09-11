-- Meldeperiode in der Eintragssicht
--
-- Der Excel-Export beschriftete die Spalte "Periode" mit dem Monat des
-- Leistungstages (month_start). Die Sicht fuehrte nur period_id, nicht die
-- Grenzen oder den Zyklus der Periode - die Oberflaeche hatte also nichts
-- Besseres und riet. Bei woechentlicher Meldung ueber den Monatswechsel
-- (30.08. bis 05.09.) bekam dieselbe Periode damit zwei Werte.
--
-- Die Grenzen kommen aus reporting_periods, wo fn_ensure_period sie nach
-- Zyklus und Wochenbeginn des Kunden geschnitten hat. Die Oberflaeche zeigt
-- sie nur an und rechnet nichts nach.
--
-- Neue Spalten duerfen bei create or replace view nur ans Ende treten; deshalb
-- stehen sie hinter work_package_name. left join, weil period_id nullable ist.
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
  t.work_package_id,
  w.code            as work_package_code,
  w.name            as work_package_name,
  -- Die Meldeperiode, wie die Datenbank sie geschnitten hat: Zyklus, Grenzen
  -- und Status. Leer, solange dem Eintrag keine Periode zugeordnet ist.
  rp.cycle          as period_cycle,
  rp.period_start,
  rp.period_end,
  rp.status         as period_status
from time_entries t
join projects   p on p.id = t.project_id
join customers  c on c.id = p.customer_id
left join activity_types    a  on a.id  = t.activity_type_id
left join work_packages     w  on w.id  = t.work_package_id
left join reporting_periods rp on rp.id = t.period_id;
