-- Wochenbeginn je Kunde
--
-- Manche Kunden zaehlen die Meldewoche ab Sonntag statt ab Montag. Bisher war
-- der Montag fest verdrahtet: date_trunc('week', …) folgt ISO-8601 und kennt
-- nichts anderes. Der Wochenbeginn haengt am Kunden, nicht am Projekt - ein
-- Kunde meldet nicht zwei verschiedene Wochenschnitte nebeneinander.
--
-- Die eigenen Auswertungen (v_report_week, das Wochenraster) bleiben bewusst
-- bei ISO-Wochen: sie gehoeren dem Nutzer, nicht dem Kunden.

alter table customers
  add column week_start_day text not null default 'monday'
    check (week_start_day in ('monday', 'sunday'));

comment on column customers.week_start_day is
  'Erster Tag der Meldewoche; wirkt nur bei woechentlicher Meldung';

-- ----------------------------------------------------------- Periodengrenzen

-- Der dritte Parameter kommt mit Vorgabewert, damit bestehende Aufrufe mit
-- zwei Argumenten weiter aufloesen. Die alte Fassung muss vorher weg, sonst
-- waeren beide Signaturen fuer einen Zweiargument-Aufruf gleich gut.
drop function if exists fn_period_bounds(text, date);

create function fn_period_bounds(
  p_cycle      text,
  p_date       date,
  p_week_start text default 'monday'
) returns table (period_start date, period_end date)
language sql immutable set search_path = public as $$
  with grenze as (
    select case
      when p_cycle <> 'weekly' then date_trunc('month', p_date)::date
      -- Einen Tag vorziehen, ISO-Montag bestimmen, wieder zurueck: das ergibt
      -- den Sonntag derselben Woche.
      when p_week_start = 'sunday'
        then (date_trunc('week', p_date + 1) - interval '1 day')::date
      else date_trunc('week', p_date)::date
    end as anfang
  )
  select anfang,
         case when p_cycle = 'weekly'
              then anfang + 6
              else (anfang + interval '1 month' - interval '1 day')::date
         end
  from grenze
$$;

comment on function fn_period_bounds(text, date, text) is
  'Grenzen der Meldeperiode; p_week_start wirkt nur bei cycle = weekly';

-- Der Wochenbeginn steht am Kunden, und den kennt diese Funktion ohnehin.
-- Damit bleiben alle Aufrufer unveraendert.
create or replace function fn_ensure_period(
  p_customer_id uuid,
  p_cycle       text,
  p_date        date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_start      date;
  v_end        date;
  v_id         uuid;
  v_week_start text;
begin
  select week_start_day into v_week_start from customers where id = p_customer_id;

  select period_start, period_end into v_start, v_end
  from fn_period_bounds(p_cycle, p_date, coalesce(v_week_start, 'monday'));

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

-- ------------------------------------------------- Umstellung eines Bestands

-- Eine Umstellung verschiebt jede kuenftige Wochengrenze. Fuer bereits
-- gemeldete Wochen ginge damit der Zeitraum verloren, den der Kunde bekommen
-- hat - deshalb ist der Wechsel ab der ersten Meldung gesperrt.
create or replace function trg_customer_week_start_guard()
returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_gemeldet int;
begin
  if new.week_start_day is not distinct from old.week_start_day then
    return new;
  end if;

  select count(*) into v_gemeldet
  from reporting_periods
  where customer_id = new.id and cycle = 'weekly' and status <> 'open';

  if v_gemeldet > 0 then
    raise exception
      'Der Wochenbeginn laesst sich nicht mehr aendern: fuer diesen Kunden gibt es % gemeldete Wochenperiode(n). Sonst wuerde ein bereits gemeldeter Zeitraum nachtraeglich verschoben.',
      v_gemeldet using errcode = 'check_violation';
  end if;

  return new;
end
$$;

create trigger customers_week_start_guard
  before update of week_start_day on customers
  for each row execute function trg_customer_week_start_guard();

-- Offene Wochen werden neu geschnitten. Die Vorbereitungs-Trigger rechnen
-- period_id ohnehin bei jedem Schreibvorgang neu; eine Aktualisierung ohne
-- inhaltliche Aenderung genuegt, um sie erneut auszuloesen.
create or replace function trg_customer_week_start_rebuild()
returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.week_start_day is not distinct from old.week_start_day then
    return null;
  end if;

  update time_entries t set work_date = t.work_date
  where t.period_id in (
    select id from reporting_periods where customer_id = new.id and cycle = 'weekly');

  update expenses e set expense_date = e.expense_date
  where e.period_id in (
    select id from reporting_periods where customer_id = new.id and cycle = 'weekly');

  -- Was danach leer zurueckbleibt, ist eine Woche im alten Schnitt.
  delete from reporting_periods rp
  where rp.customer_id = new.id
    and rp.cycle = 'weekly'
    and rp.status = 'open'
    and not exists (select 1 from time_entries t where t.period_id = rp.id)
    and not exists (select 1 from expenses e where e.period_id = rp.id);

  return null;
end
$$;

create trigger customers_week_start_rebuild
  after update of week_start_day on customers
  for each row execute function trg_customer_week_start_rebuild();
