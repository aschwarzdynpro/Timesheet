-- Phase 1 – Fundament: Row Level Security
--
-- Auch bei einem einzigen Nutzer: ohne RLS legt ein exponierter publishable Key
-- die gesamte Datenbank offen. Tabellen mit owner_id pruefen direkt, abhaengige
-- Tabellen ueber ihren Elterndatensatz.

-- ------------------------------------------------- Tabellen mit eigener owner_id

do $$
declare t text;
begin
  foreach t in array array[
    'customers','activity_types','expense_categories','time_entries','expenses',
    'work_schedules','absences','holidays','export_profiles','finops_sync_log','app_settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$I_owner_all on %1$I
        for all to authenticated
        using (owner_id = (select auth.uid()))
        with check (owner_id = (select auth.uid()))
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------- Abhaengige Tabellen

alter table projects enable row level security;

create policy projects_owner_all on projects
  for all to authenticated
  using (exists (
    select 1 from customers c
    where c.id = projects.customer_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from customers c
    where c.id = projects.customer_id and c.owner_id = (select auth.uid())
  ));

alter table project_rates enable row level security;

create policy project_rates_owner_all on project_rates
  for all to authenticated
  using (exists (
    select 1 from projects p
    join customers c on c.id = p.customer_id
    where p.id = project_rates.project_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from projects p
    join customers c on c.id = p.customer_id
    where p.id = project_rates.project_id and c.owner_id = (select auth.uid())
  ));

alter table reporting_periods enable row level security;

create policy reporting_periods_owner_all on reporting_periods
  for all to authenticated
  using (exists (
    select 1 from customers c
    where c.id = reporting_periods.customer_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from customers c
    where c.id = reporting_periods.customer_id and c.owner_id = (select auth.uid())
  ));

-- Fremdschluessel-Ziele muessen lesbar sein, damit die Policies der Kindtabellen
-- greifen koennen. Die Indizes darauf sind bereits gesetzt.
create index if not exists customers_owner_idx       on customers (owner_id);
create index if not exists activity_types_owner_idx  on activity_types (owner_id);
