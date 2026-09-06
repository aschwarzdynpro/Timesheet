-- Phase 1 – Fundament: Trigger
--
-- Die Periodensperre sitzt bewusst in der Datenbank und nicht im Formular:
-- auch ein direkter API-Aufruf, ein Import oder ein SQL-Zugriff darf gemeldete
-- Perioden nicht mehr veraendern.

-- ------------------------------------------------------------- Zeiteintraege

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

create trigger time_entries_prepare
  before insert or update on time_entries
  for each row execute function trg_time_entry_prepare();

create or replace function trg_time_entry_guard_delete()
returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  perform fn_assert_period_open(old.period_id);
  return old;
end
$$;

create trigger time_entries_guard_delete
  before delete on time_entries
  for each row execute function trg_time_entry_guard_delete();

-- -------------------------------------------------------------------- Spesen

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

create trigger expenses_prepare
  before insert or update on expenses
  for each row execute function trg_expense_prepare();

create or replace function trg_expense_guard_delete()
returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  perform fn_assert_period_open(old.period_id);
  return old;
end
$$;

create trigger expenses_guard_delete
  before delete on expenses
  for each row execute function trg_expense_guard_delete();

-- --------------------------------------------------------------- Stammdaten
-- Ein Stundensatz darf nicht mehr veraendert werden, sobald er in einer
-- gemeldeten Periode verwendet wurde. Der Snapshot schuetzt bereits den
-- gemeldeten Betrag; diese Pruefung verhindert zusaetzlich stille Aenderungen
-- an der Historie selbst.

create or replace function trg_project_rate_guard()
returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_used int;
begin
  -- Bei UPDATE zaehlen beide Zeitraeume: der alte (dort wurde bereits gemeldet)
  -- und der neue (dorthin darf der Satz nicht verschoben werden).
  select count(*) into v_used
  from time_entries t
  join reporting_periods p on p.id = t.period_id
  where p.status <> 'open'
    and (
      (tg_op in ('UPDATE','DELETE')
        and t.project_id = old.project_id
        and daterange(old.valid_from, old.valid_to, '[]') @> t.work_date)
      or
      (tg_op = 'UPDATE'
        and t.project_id = new.project_id
        and daterange(new.valid_from, new.valid_to, '[]') @> t.work_date)
    );

  if v_used > 0 then
    raise exception
      'Dieser Satz liegt bereits gemeldeten Zeiten zugrunde und kann nicht mehr geaendert werden'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger project_rates_guard
  before update or delete on project_rates
  for each row execute function trg_project_rate_guard();
