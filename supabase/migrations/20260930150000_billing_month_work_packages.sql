-- Monatsuebersicht: Arbeitspakete als vierte Ebene
--
-- Unter jedem Projekt kann die Monatsuebersicht jetzt aufklappen, wie sich
-- Stunden und Umsatz auf seine Arbeitspakete verteilen. Die Summen dafuer
-- bildet - wie fuer Projekt, Kunde und gesamt - die Sicht selbst, im selben
-- GROUPING SETS.
--
-- level = 'work_package' ist die neue Ebene. Zeit ohne Arbeitspaket steht dort
-- als eigene Zeile mit work_package_id null ("ohne Arbeitspaket"): So ergeben
-- die Paketzeilen eines Projekts immer genau die Projektzeile, und nichts
-- faellt beim Aufklappen still heraus. Unterschieden wird die Ebene deshalb
-- ueber grouping(), nicht ueber work_package_id is null.
--
-- Die neuen Spalten haengen am Ende an: create or replace view darf nur
-- anhaengen, und ein Frontend, das die Ebene noch nicht kennt, filtert nach
-- level und sieht die zusaetzlichen Zeilen gar nicht.
create or replace view v_billing_month
with (security_invoker = true) as
select
  owner_id,
  month_start,
  case
    when grouping(customer_id)     = 1 then 'total'
    when grouping(project_id)      = 1 then 'customer'
    when grouping(work_package_id) = 1 then 'project'
    else 'work_package'
  end                                                             as level,
  customer_id,
  customer_code,
  customer_name,
  project_id,
  project_code,
  project_name,
  sum(billable_minutes) filter (where is_billable)::int           as minutes_billable,
  round(coalesce(sum(amount) filter (where is_billable), 0), 2)   as fees,
  round(
    sum(amount) filter (where is_billable and rate is not null)
    / nullif(sum(billable_minutes) filter (where is_billable and rate is not null), 0)
    * 60
  , 2)                                                            as avg_rate,
  coalesce(sum(billable_minutes) filter (where is_billable and rate is null), 0)::int
                                                                  as minutes_without_rate,
  count(distinct period_id) filter (where period_status = 'open')::int
                                                                  as open_periods,
  work_package_id,
  work_package_code,
  work_package_name
from v_time_entries_full
group by grouping sets (
  (owner_id, month_start, customer_id, customer_code, customer_name,
   project_id, project_code, project_name,
   work_package_id, work_package_code, work_package_name),
  (owner_id, month_start, customer_id, customer_code, customer_name,
   project_id, project_code, project_name),
  (owner_id, month_start, customer_id, customer_code, customer_name),
  (owner_id, month_start)
)
having coalesce(sum(billable_minutes) filter (where is_billable), 0) > 0;
