-- Periode wieder oeffnen
--
-- Der Lebenszyklus war bisher eine Einbahnstrasse: open -> submitted -> ...
-- Im Alltag weist ein Kunde aber Positionen zurueck und bittet um Umbuchung.
-- Ohne Rueckweg bliebe nur, die Zahlen falsch stehen zu lassen oder an der App
-- vorbei in der Datenbank zu arbeiten - beides schlechter als ein Weg, der
-- festhaelt, dass es ihn gab.

-- ------------------------------------------------------------ Was passiert ist

create table period_events (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references reporting_periods on delete cascade,
  event         text not null check (event in ('submitted', 'reopened')),
  note          text,
  -- Die Summen zum Zeitpunkt des Ereignisses. Beim Wiederoeffnen verliert die
  -- Periode ihre eingefrorenen Zahlen; hier bleibt nachlesbar, was gemeldet war.
  total_minutes int,
  total_fees    numeric(12,2),
  created_at    timestamptz not null default now()
);

create index period_events_period_idx on period_events (period_id, created_at desc);

comment on table period_events is
  'Protokoll der Meldungen und Wiedereroeffnungen je Periode';

alter table period_events enable row level security;

-- Wie bei reporting_periods haengt die Zugehoerigkeit am Kunden.
create policy period_events_owner_all on period_events
  for all to authenticated
  using (exists (
    select 1 from reporting_periods p join customers c on c.id = p.customer_id
    where p.id = period_events.period_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from reporting_periods p join customers c on c.id = p.customer_id
    where p.id = period_events.period_id and c.owner_id = (select auth.uid())
  ));

alter table reporting_periods
  add column reopened_at  timestamptz,
  add column reopen_count int not null default 0;

comment on column reporting_periods.reopen_count is
  'Wie oft die Periode nach einer Meldung wieder geoeffnet wurde';

-- ------------------------------------------------------------------- Melden

-- Unveraendert bis auf den Protokolleintrag am Ende.
create or replace function fn_submit_period(p_period_id uuid)
returns reporting_periods
language plpgsql security invoker set search_path = public as $$
declare
  v_period reporting_periods;
begin
  select * into v_period from reporting_periods where id = p_period_id for update;

  if v_period.id is null then
    raise exception 'Periode % existiert nicht', p_period_id using errcode = 'no_data_found';
  end if;
  if v_period.status <> 'open' then
    raise exception 'Periode ist bereits %', v_period.status using errcode = 'check_violation';
  end if;

  -- Satz einfrieren, solange die Periode noch offen ist: danach greift die Sperre.
  update time_entries t
     set rate_snapshot = coalesce(
           t.rate_snapshot,
           fn_rate_for(t.project_id, t.activity_type_id, t.work_date)
         ),
         status  = 'submitted',
         updated_at = now()
   where t.period_id = p_period_id;

  update expenses e
     set status = 'submitted', updated_at = now()
   where e.period_id = p_period_id;

  update reporting_periods p
     set status         = 'submitted',
         submitted_at   = now(),
         total_minutes  = coalesce((
           select sum(t.billable_minutes) from time_entries t where t.period_id = p_period_id
         ), 0),
         total_fees     = coalesce((
           select round(sum(t.billable_minutes / 60.0 * coalesce(t.rate_snapshot, 0)), 2)
           from time_entries t where t.period_id = p_period_id
         ), 0),
         total_expenses = coalesce((
           select round(sum(e.amount_net * (1 + e.markup_percent / 100.0)), 2)
           from expenses e where e.period_id = p_period_id and e.is_rechargeable
         ), 0)
   where p.id = p_period_id
   returning * into v_period;

  insert into period_events (period_id, event, total_minutes, total_fees)
  values (p_period_id, 'submitted', v_period.total_minutes, v_period.total_fees);

  return v_period;
end
$$;

-- -------------------------------------------------------------- Wieder oeffnen

create or replace function fn_reopen_period(p_period_id uuid, p_note text default null)
returns reporting_periods
language plpgsql security invoker set search_path = public as $$
declare
  v_period reporting_periods;
begin
  select * into v_period from reporting_periods where id = p_period_id for update;

  if v_period.id is null then
    raise exception 'Periode % existiert nicht', p_period_id using errcode = 'no_data_found';
  end if;
  if v_period.status = 'open' then
    raise exception 'Periode ist bereits offen' using errcode = 'check_violation';
  end if;
  -- Eine abgerechnete Periode steht in einer Rechnung. Sie hier still wieder zu
  -- oeffnen wuerde die Buchhaltung von der Zeiterfassung abkoppeln, ohne dass
  -- es jemand merkt. Wer wirklich umbuchen muss, storniert zuerst.
  if v_period.status = 'invoiced' then
    raise exception 'Periode ist bereits abgerechnet und laesst sich nicht wieder oeffnen'
      using errcode = 'check_violation';
  end if;

  -- Das Protokoll haelt fest, was gemeldet war - die Periode verliert es gleich.
  insert into period_events (period_id, event, note, total_minutes, total_fees)
  values (p_period_id, 'reopened', nullif(btrim(coalesce(p_note, '')), ''),
          v_period.total_minutes, v_period.total_fees);

  -- Zuerst die Periode oeffnen: die Sperre auf Zeiten und Spesen prueft den
  -- Status der Periode, an der sie haengen.
  update reporting_periods p
     set status         = 'open',
         submitted_at   = null,
         total_minutes  = null,
         total_fees     = null,
         total_expenses = null,
         reopened_at    = now(),
         reopen_count   = p.reopen_count + 1
   where p.id = p_period_id
   returning * into v_period;

  -- Der eingefrorene Satz faellt weg: die Periode ist nicht mehr endgueltig,
  -- also gilt wieder die Satzhistorie. Beim erneuten Melden wird neu eingefroren.
  update time_entries t
     set rate_snapshot = null,
         status        = 'draft',
         updated_at    = now()
   where t.period_id = p_period_id;

  update expenses e
     set status = 'draft', updated_at = now()
   where e.period_id = p_period_id;

  return v_period;
end
$$;

comment on function fn_reopen_period(uuid, text) is
  'Nimmt eine Meldung zurueck: Status offen, Saetze wieder beweglich, Protokolleintrag';
