-- Schematest: prueft die Logik, die in der Datenbank sitzt.
-- Laeuft gegen ein frisches PostgreSQL mit eingespielten Migrationen und Seed.

\set ON_ERROR_STOP on

do $$
declare
  v_owner    uuid;
  v_acme     uuid;
  v_nord     uuid;
  v_p_crm    uuid;
  v_p_migr   uuid;
  v_p_intern uuid;
  v_consult  uuid;
  v_travel   uuid;
  v_period   uuid;
  v_entry    uuid;
  r          record;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  select id into v_acme  from customers where owner_id = v_owner and code = 'ACME';
  select id into v_nord  from customers where owner_id = v_owner and code = 'NORD';
  select id into v_p_crm    from projects where customer_id = v_acme and code = 'CRM';
  select id into v_p_intern from projects where customer_id = v_acme and code = 'INTERN';
  select id into v_p_migr   from projects where customer_id = v_nord and code = 'MIGR';
  select id into v_consult from activity_types where owner_id = v_owner and code = 'CONSULT';
  select id into v_travel  from activity_types where owner_id = v_owner and code = 'TRAVEL';

  raise notice 'Rundung';
  perform test_assert(fn_round_minutes(61, 15, 'up')      = 75, '61 min, 15er Takt, aufrunden -> 75');
  perform test_assert(fn_round_minutes(61, 15, 'nearest') = 60, '61 min, 15er Takt, kaufmaennisch -> 60');
  perform test_assert(fn_round_minutes(61, 15, 'none')    = 61, '61 min, ohne Rundung -> 61');
  perform test_assert(fn_round_minutes(60, 15, 'up')      = 60, 'volle 60 min bleiben 60 (kein Aufschlag)');
  perform test_assert(fn_round_minutes(1,  15, 'up')      = 15, '1 min -> 15 (Mindesttakt)');

  raise notice 'Satzermittlung';
  perform test_assert(fn_rate_for(v_p_crm, v_consult, date '2026-02-10') = 140.00,
                      'Beratung im ersten Halbjahr -> 140');
  perform test_assert(fn_rate_for(v_p_crm, v_consult, date '2026-08-10') = 150.00,
                      'Beratung nach Satzerhoehung -> 150');
  perform test_assert(fn_rate_for(v_p_crm, v_travel,  date '2026-02-10') =  70.00,
                      'Reisezeit schlaegt den Projektsatz -> 70');
  perform test_assert(fn_rate_for(v_p_crm, v_travel,  date '2026-08-10') =  70.00,
                      'Reisezeitsatz gilt weiter, auch nach der Erhoehung');
  perform test_assert(fn_rate_for(v_p_crm, null,      date '2026-02-10') = 140.00,
                      'ohne Taetigkeitsart -> allgemeiner Projektsatz');
  perform test_assert(fn_rate_for(v_p_crm, v_consult, date '2025-12-31') is null,
                      'vor Beginn der Historie -> kein Satz');

  raise notice 'Ueberlappungsfreiheit der Satzhistorie';
  perform test_expect_error(
    format('insert into project_rates (project_id, hourly_rate, valid_from, valid_to)
            values (%L, 999, date ''2026-03-01'', date ''2026-04-01'')', v_p_crm),
    'ueberlappender allgemeiner Satz wird abgelehnt');
  perform test_expect_error(
    format('insert into project_rates (project_id, activity_type_id, hourly_rate, valid_from)
            values (%L, %L, 999, date ''2026-05-01'')', v_p_crm, v_travel),
    'ueberlappender Reisezeitsatz wird abgelehnt');

  raise notice 'Periodenzuordnung';
  insert into time_entries (owner_id, project_id, activity_type_id, work_date, duration_minutes, description)
  values (v_owner, v_p_crm, v_consult, date '2026-03-31', 90, 'Workshop Vertrieb')
  returning id, period_id into v_entry, v_period;

  select * into r from reporting_periods where id = v_period;
  perform test_assert(r.cycle = 'monthly',                'ACME meldet monatlich');
  perform test_assert(r.period_start = date '2026-03-01', 'Monatsperiode beginnt am Monatsersten');
  perform test_assert(r.period_end   = date '2026-03-31', 'Monatsperiode endet am Monatsletzten');

  insert into time_entries (owner_id, project_id, activity_type_id, work_date, duration_minutes, description)
  values (v_owner, v_p_migr, v_consult, date '2026-03-05', 61, 'Feldanalyse')
  returning period_id into v_period;

  select * into r from reporting_periods where id = v_period;
  perform test_assert(r.cycle = 'weekly',                          'Nordwind meldet woechentlich');
  perform test_assert(extract(isodow from r.period_start)::int = 1, 'Woche beginnt am Montag (ISO-8601)');
  perform test_assert(r.period_end - r.period_start = 6,            'Woche umfasst sieben Tage');

  raise notice 'Rundung wirkt beim Speichern';
  perform test_assert(
    (select billable_minutes from time_entries where project_id = v_p_crm and work_date = date '2026-03-31') = 90,
    '90 min bei ACME (15er Takt) bleiben 90');
  perform test_assert(
    (select billable_minutes from time_entries where project_id = v_p_migr and work_date = date '2026-03-05') = 61,
    '61 min bei Nordwind (minutengenau) bleiben 61');

  raise notice 'Nicht abrechenbares Projekt';
  insert into time_entries (owner_id, project_id, work_date, duration_minutes, description, is_billable)
  values (v_owner, v_p_intern, date '2026-03-10', 120, 'Weiterbildung', true);
  perform test_assert(
    (select is_billable from time_entries where project_id = v_p_intern) = false,
    'ein nicht abrechenbares Projekt erzwingt nicht abrechenbare Zeit');
  perform test_assert(
    (select billable_minutes from time_entries where project_id = v_p_intern) = 0,
    'und damit null abrechenbare Minuten');

  raise notice 'Bewertung in der Auswertungssicht';
  select * into r from v_time_entries_full where id = v_entry;
  perform test_assert(r.rate   = 140.00, 'Satz aus der Historie: 140');
  perform test_assert(r.amount = 210.00, '90 min zu 140 EUR ergeben 210,00');
  perform test_assert(r.rate_is_frozen = false, 'solange offen, ist der Satz nicht eingefroren');
  perform test_assert(r.customer_name = 'ACME Industrie AG', 'Kunde wird mitgefuehrt');

  raise notice 'ISO-Wochen am Jahreswechsel';
  insert into time_entries (owner_id, project_id, activity_type_id, work_date, duration_minutes, description)
  values (v_owner, v_p_crm, v_consult, date '2027-01-01', 60, 'Jahreswechsel-Test');
  select * into r from v_time_entries_full where work_date = date '2027-01-01';
  perform test_assert(r.year = 2027,     'Kalenderjahr des 01.01.2027 ist 2027');
  perform test_assert(r.iso_year = 2026, 'ISO-Jahr des 01.01.2027 ist noch 2026');
  perform test_assert(r.iso_week = 53,   'und faellt in die KW 53');
  delete from time_entries where work_date = date '2027-01-01';

  raise notice 'Periodenfreigabe';
  select period_id into v_period from time_entries where id = v_entry;
  perform fn_submit_period(v_period);
  select * into r from reporting_periods where id = v_period;
  perform test_assert(r.status = 'submitted',   'Periode ist gemeldet');
  perform test_assert(r.total_minutes = 90,     'Summe der abrechenbaren Minuten');
  perform test_assert(r.total_fees = 210.00,    'Summe des Honorars');
  perform test_assert(
    (select rate_snapshot from time_entries where id = v_entry) = 140.00,
    'Satz ist im Eintrag eingefroren');

  raise notice 'Sperre gemeldeter Perioden';
  perform test_expect_error(
    format('update time_entries set duration_minutes = 120 where id = %L', v_entry),
    'Aendern eines gemeldeten Eintrags wird abgelehnt');
  perform test_expect_error(
    format('delete from time_entries where id = %L', v_entry),
    'Loeschen eines gemeldeten Eintrags wird abgelehnt');
  perform test_expect_error(
    format('insert into time_entries (owner_id, project_id, work_date, duration_minutes, description)
            values (%L, %L, date ''2026-03-15'', 60, ''Nachtrag'')', v_owner, v_p_crm),
    'Nachtragen in eine gemeldete Periode wird abgelehnt');
  perform test_expect_error(
    format('select fn_submit_period(%L)', v_period),
    'zweimaliges Freigeben wird abgelehnt');

  raise notice 'Schutz der Satzhistorie';
  perform test_expect_error(
    format('update project_rates set hourly_rate = 200 where project_id = %L and activity_type_id is null
            and valid_from = date ''2026-01-01''', v_p_crm),
    'ein bereits gemeldeter Satz kann nicht mehr geaendert werden');

  perform test_assert(
    (select amount from v_time_entries_full where id = v_entry) = 210.00,
    'der gemeldete Betrag bleibt unveraendert');

  raise notice 'Sollarbeitszeit';
  perform test_assert(fn_target_minutes(date '2026-03-02', date '2026-03-06') = 2400,
                      'eine volle Arbeitswoche ergibt 5 x 480 = 2400 min');
  insert into absences (owner_id, date_from, date_to, kind)
  values (v_owner, date '2026-03-04', date '2026-03-04', 'vacation');
  perform test_assert(fn_target_minutes(date '2026-03-02', date '2026-03-06') = 1920,
                      'ein Urlaubstag reduziert die Sollzeit auf 1920 min');

  raise notice 'Spalten, auf die sich die Oberflaeche verlaesst';
  -- Die Oberflaeche filtert und sortiert ueber PostgREST nach diesen Spalten.
  -- Fehlt eine, weist PostgREST die gesamte Abfrage mit 42703 ab - und die
  -- Seite bleibt leer, ohne dass ein Fehler sichtbar wird. Genau so waren
  -- gespeicherte Zeiten einmal unsichtbar.
  declare
    v_sicht text;
    v_spalte text;
    v_fehlend text[] := '{}';
  begin
    foreach v_sicht in array array['v_time_entries_full'] loop
      foreach v_spalte in array array[
        'work_date','created_at','project_id','activity_type_id','customer_id',
        'period_id','billable_minutes','duration_minutes','amount','rate','status',
        'is_billable','description','iso_year','iso_week','week_start','month_start','year'
      ] loop
        if not exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = v_sicht and column_name = v_spalte
        ) then
          v_fehlend := v_fehlend || (v_sicht || '.' || v_spalte);
        end if;
      end loop;
    end loop;

    foreach v_spalte in array array[
      'expense_date','created_at','project_id','customer_id','period_id',
      'amount_net','amount_recharged','is_rechargeable','markup_percent','status'
    ] loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'v_expenses_full' and column_name = v_spalte
      ) then
        v_fehlend := v_fehlend || ('v_expenses_full.' || v_spalte);
      end if;
    end loop;

    perform test_assert(cardinality(v_fehlend) = 0,
      'alle von der Oberflaeche genutzten Spalten sind in den Sichten vorhanden'
      || case when cardinality(v_fehlend) > 0
              then ' - fehlt: ' || array_to_string(v_fehlend, ', ') else '' end);
  end;

  raise notice 'ALLE ZUSICHERUNGEN ERFUELLT';
end $$;
