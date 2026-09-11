-- Budgetstand je Arbeitspaket
--
-- Die Budgetspalten liegen seit der vorigen Migration in work_packages. Was
-- fehlte, ist der Gegenwert: was auf das Paket schon gebucht wurde.
--
-- Anders als die Projektampel in den Auswertungen zaehlt diese Sicht ueber die
-- gesamte Laufzeit und nicht je Jahr. Ein Arbeitspaket laeuft, bis es fertig
-- ist; ein Budget, das im Januar von vorn begaenne, waere keines.

create or replace view v_work_package_budget
with (security_invoker = true) as
select
  w.id                as work_package_id,
  w.project_id,
  w.code,
  w.name,
  w.is_active,
  w.sort_order,
  w.budget_hours,
  w.budget_amount,
  coalesce(z.tracked_minutes, 0)  as tracked_minutes,
  coalesce(z.billable_minutes, 0) as billable_minutes,
  coalesce(z.fees, 0)             as fees,
  coalesce(z.entry_count, 0)      as entry_count,
  -- Weiterberechnete Spesen stehen daneben, statt in das Honorar zu wandern:
  -- ob sie ein Budget belasten, ist eine kaufmaennische Frage und keine, die
  -- eine Sicht still fuer den Nutzer entscheiden sollte.
  coalesce(s.expenses_recharged, 0) as expenses_recharged,
  -- Die Oberflaeche bearbeitet das Paket direkt aus dieser Sicht heraus. Ohne
  -- die Beschreibung wuerde ein Speichern sie stillschweigend leeren.
  w.description
from work_packages w
left join (
  select
    t.work_package_id,
    sum(t.duration_minutes)  as tracked_minutes,
    sum(t.billable_minutes)  as billable_minutes,
    -- Derselbe Ausdruck wie in v_time_entries_full: eingefrorener Satz zuerst.
    round(sum(
      t.billable_minutes / 60.0
      * coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.activity_type_id, t.work_date), 0)
    ), 2) as fees,
    count(*) as entry_count
  from time_entries t
  where t.work_package_id is not null
  group by t.work_package_id
) z on z.work_package_id = w.id
left join (
  select
    e.work_package_id,
    round(sum(e.amount_net * (1 + e.markup_percent / 100.0)), 2) as expenses_recharged
  from expenses e
  where e.work_package_id is not null and e.is_rechargeable
  group by e.work_package_id
) s on s.work_package_id = w.id;

comment on view v_work_package_budget is
  'Arbeitspakete mit Budget und dem, was ueber die gesamte Laufzeit gebucht wurde';
