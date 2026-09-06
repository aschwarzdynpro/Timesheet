-- Phase 1 – Fundament: Funktionen
--
-- Die Bewertungslogik liegt in der Datenbank, damit Oberflaeche, Excel-Export
-- und spaeterer FinOps-Adapter identisch rechnen.

-- Gueltiger Stundensatz zum Leistungsdatum.
-- Aufloesung nach spezifischstem Treffer: Satz fuer genau diese Taetigkeitsart
-- schlaegt den allgemeinen Projektsatz.
create or replace function fn_rate_for(
  p_project_id       uuid,
  p_activity_type_id uuid,
  p_on_date          date
) returns numeric
language sql stable security invoker set search_path = public as $$
  select r.hourly_rate
  from project_rates r
  where r.project_id = p_project_id
    and daterange(r.valid_from, r.valid_to, '[]') @> p_on_date
    and (r.activity_type_id is null or r.activity_type_id = p_activity_type_id)
  order by (r.activity_type_id is not null) desc
  limit 1
$$;

-- Rundungsregel mit Kundenvererbung: Projektwert gewinnt, sonst Kundenwert.
create or replace function fn_effective_rounding(p_project_id uuid)
returns table (rounding_minutes int, rounding_mode text)
language sql stable security invoker set search_path = public as $$
  select coalesce(p.rounding_minutes, c.rounding_minutes),
         coalesce(p.rounding_mode,    c.rounding_mode)
  from projects p
  join customers c on c.id = p.customer_id
  where p.id = p_project_id
$$;

-- Reporting-Rhythmus mit Kundenvererbung.
create or replace function fn_effective_cycle(p_project_id uuid)
returns text
language sql stable security invoker set search_path = public as $$
  select coalesce(p.reporting_cycle, c.reporting_cycle)
  from projects p
  join customers c on c.id = p.customer_id
  where p.id = p_project_id
$$;

-- Abrechenbare Minuten aus erfassten Minuten.
create or replace function fn_round_minutes(
  p_minutes   int,
  p_increment int,
  p_mode      text
) returns int
language sql immutable set search_path = public as $$
  select case
    when p_minutes is null then null
    when p_mode = 'none' or coalesce(p_increment, 0) <= 0 then p_minutes
    when p_mode = 'nearest'
      then (round(p_minutes::numeric / p_increment) * p_increment)::int
    else (ceil(p_minutes::numeric / p_increment) * p_increment)::int
  end
$$;

-- Grenzen der Periode, in die ein Datum faellt.
-- Wochen sind ISO-8601: date_trunc('week', …) liefert immer den Montag.
create or replace function fn_period_bounds(p_cycle text, p_date date)
returns table (period_start date, period_end date)
language sql immutable set search_path = public as $$
  select
    case when p_cycle = 'weekly'
         then date_trunc('week', p_date)::date
         else date_trunc('month', p_date)::date end,
    case when p_cycle = 'weekly'
         then (date_trunc('week', p_date) + interval '6 days')::date
         else (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date end
$$;

-- Periode finden oder anlegen. Wird vom Trigger auf Zeiten und Spesen gerufen.
create or replace function fn_ensure_period(
  p_customer_id uuid,
  p_cycle       text,
  p_date        date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_start date;
  v_end   date;
  v_id    uuid;
begin
  select period_start, period_end into v_start, v_end
  from fn_period_bounds(p_cycle, p_date);

  select id into v_id
  from reporting_periods
  where customer_id = p_customer_id and cycle = p_cycle and period_start = v_start;

  if v_id is null then
    insert into reporting_periods (customer_id, cycle, period_start, period_end)
    values (p_customer_id, p_cycle, v_start, v_end)
    on conflict (customer_id, cycle, period_start) do nothing
    returning id into v_id;

    -- Falls parallel angelegt: erneut lesen.
    if v_id is null then
      select id into v_id
      from reporting_periods
      where customer_id = p_customer_id and cycle = p_cycle and period_start = v_start;
    end if;
  end if;

  return v_id;
end
$$;

-- Wirft, sobald eine Periode nicht mehr offen ist.
create or replace function fn_assert_period_open(p_period_id uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_status text;
  v_start  date;
begin
  if p_period_id is null then
    return;
  end if;

  select status, period_start into v_status, v_start
  from reporting_periods where id = p_period_id;

  if v_status is not null and v_status <> 'open' then
    raise exception
      'Periode ab % ist bereits % und damit gesperrt', v_start, v_status
      using errcode = 'check_violation';
  end if;
end
$$;

-- Sollarbeitszeit im Zeitraum, abzueglich Feiertagen und Abwesenheiten.
create or replace function fn_target_minutes(p_from date, p_to date)
returns int
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(
    case extract(isodow from d)::int
      when 1 then s.minutes_mon when 2 then s.minutes_tue when 3 then s.minutes_wed
      when 4 then s.minutes_thu when 5 then s.minutes_fri when 6 then s.minutes_sat
      else s.minutes_sun
    end
  ), 0)::int
  from generate_series(p_from, p_to, interval '1 day') g(d)
  join work_schedules s
    on s.owner_id = auth.uid()
   and daterange(s.valid_from, s.valid_to, '[]') @> g.d::date
  where not exists (
    select 1 from holidays h
    where h.owner_id = auth.uid() and h.holiday_date = g.d::date
  )
  and not exists (
    select 1 from absences a
    where a.owner_id = auth.uid() and g.d::date between a.date_from and a.date_to
  )
$$;

-- Periode freigeben: Saetze einfrieren, Summen schreiben, Status setzen.
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

  return v_period;
end
$$;
