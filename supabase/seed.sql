-- Beispieldaten fuer die lokale Entwicklung.
-- Haengt sich an den ersten vorhandenen Benutzer; ohne Benutzer passiert nichts.

do $$
declare
  v_owner    uuid;
  v_acme     uuid;
  v_nordwind uuid;
  v_p_crm    uuid;
  v_p_migr   uuid;
  v_p_intern uuid;
  v_consult  uuid;
  v_travel   uuid;
  v_internal uuid;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'Kein Benutzer vorhanden - Seed uebersprungen.';
    return;
  end if;

  if exists (select 1 from customers where owner_id = v_owner) then
    raise notice 'Stammdaten bereits vorhanden - Seed uebersprungen.';
    return;
  end if;

  -- Taetigkeitsarten -------------------------------------------------------
  insert into activity_types (owner_id, code, name, is_billable_default, sort_order)
  values (v_owner, 'CONSULT',  'Beratung',      true,  10),
         (v_owner, 'TRAVEL',   'Reisezeit',     true,  20),
         (v_owner, 'INTERNAL', 'Intern',        false, 90);

  select id into v_consult  from activity_types where owner_id = v_owner and code = 'CONSULT';
  select id into v_travel   from activity_types where owner_id = v_owner and code = 'TRAVEL';
  select id into v_internal from activity_types where owner_id = v_owner and code = 'INTERNAL';

  -- Kunden -----------------------------------------------------------------
  -- ACME meldet monatlich, Nordwind woechentlich und rechnet minutengenau ab.
  insert into customers (owner_id, code, name, reporting_cycle, rounding_minutes, rounding_mode, invoice_email)
  values (v_owner, 'ACME', 'ACME Industrie AG',   'monthly', 15, 'up',   'rechnung@acme.example'),
         (v_owner, 'NORD', 'Nordwind Logistik GmbH', 'weekly', 1, 'none', 'ap@nordwind.example');

  select id into v_acme     from customers where owner_id = v_owner and code = 'ACME';
  select id into v_nordwind from customers where owner_id = v_owner and code = 'NORD';

  -- Projekte ---------------------------------------------------------------
  insert into projects (customer_id, code, name, description, budget_hours, start_date)
  values (v_acme,     'CRM',   'CRM-Einfuehrung',    'Dynamics 365 Sales, Rollout Vertrieb', 400, date '2026-01-05'),
         (v_nordwind, 'MIGR',  'Datenmigration',     'Altsystem nach Dataverse',             120, date '2026-03-02');

  insert into projects (customer_id, code, name, description, is_billable)
  values (v_acme, 'INTERN', 'Nicht abrechenbar', 'Akquise, Weiterbildung, Verwaltung', false);

  select id into v_p_crm    from projects where customer_id = v_acme     and code = 'CRM';
  select id into v_p_migr   from projects where customer_id = v_nordwind and code = 'MIGR';
  select id into v_p_intern from projects where customer_id = v_acme     and code = 'INTERN';

  -- Stundensaetze ----------------------------------------------------------
  -- Satzerhoehung zum Jahreswechsel und ein eigener Satz fuer Reisezeit:
  -- beides sind Datensaetze, kein Sonderfall im Code.
  insert into project_rates (project_id, activity_type_id, hourly_rate, valid_from, valid_to, note)
  values (v_p_crm,  null,     140.00, date '2026-01-01', date '2026-06-30', 'Rahmenvertrag 2026 H1'),
         (v_p_crm,  null,     150.00, date '2026-07-01', null,              'Anpassung zum 01.07.'),
         (v_p_crm,  v_travel,  70.00, date '2026-01-01', null,              'Reisezeit zu 50 Prozent'),
         (v_p_migr, null,     125.00, date '2026-03-01', null,              null);

  -- Spesenarten (Stammdaten fuer Phase 2b) ---------------------------------
  insert into expense_categories (owner_id, code, name, entry_mode, unit_label, default_unit_rate)
  values (v_owner, 'MILEAGE', 'Kilometergeld',   'allowance', 'km',  0.3000),
         (v_owner, 'PER_DIEM','Verpflegung',     'allowance', 'Tag', 28.0000),
         (v_owner, 'HOTEL',   'Uebernachtung',   'receipt',   null,  null),
         (v_owner, 'TRAIN',   'Bahnfahrt',       'receipt',   null,  null);

  -- Arbeitszeitmodell (Basis der Auslastung, Phase 3) ----------------------
  insert into work_schedules (owner_id, valid_from)
  values (v_owner, date '2026-01-01');

  raise notice 'Seed eingespielt fuer Benutzer %.', v_owner;
end $$;
