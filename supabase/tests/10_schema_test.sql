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
  v_paket    uuid;
  v_fremd    uuid;
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

  raise notice 'Wochenbeginn je Kunde';
  -- Der 05.03.2026 ist ein Donnerstag. Ab Montag beginnt seine Woche am 02.03.,
  -- ab Sonntag am 01.03. - dieselbe Zeit, ein anderer Schnitt.
  select period_start, period_end into r
  from fn_period_bounds('weekly', date '2026-03-05', 'monday');
  perform test_assert(r.period_start = date '2026-03-02', 'Montagswoche des 05.03. beginnt am 02.03.');
  perform test_assert(r.period_end   = date '2026-03-08', 'und endet am 08.03.');

  select period_start, period_end into r
  from fn_period_bounds('weekly', date '2026-03-05', 'sunday');
  perform test_assert(r.period_start = date '2026-03-01', 'Sonntagswoche des 05.03. beginnt am 01.03.');
  perform test_assert(r.period_end   = date '2026-03-07', 'und endet am 07.03.');

  -- Der Sonntag selbst gehoert zur Woche, die er eroeffnet, nicht zur vorigen.
  select period_start into r from fn_period_bounds('weekly', date '2026-03-01', 'sunday');
  perform test_assert(r.period_start = date '2026-03-01', 'ein Sonntag eroeffnet seine eigene Woche');
  select period_start into r from fn_period_bounds('weekly', date '2026-03-01', 'monday');
  perform test_assert(r.period_start = date '2026-02-23', 'bei Montagsbeginn schliesst er die vorige ab');

  -- Der Monatsrhythmus darf sich davon nicht beirren lassen.
  select period_start, period_end into r
  from fn_period_bounds('monthly', date '2026-03-05', 'sunday');
  perform test_assert(r.period_start = date '2026-03-01' and r.period_end = date '2026-03-31',
                      'der Wochenbeginn laesst den Monatsrhythmus unberuehrt');

  raise notice 'Umstellung schneidet offene Wochen neu';
  update customers set week_start_day = 'sunday' where id = v_nord;
  select * into r from reporting_periods rp
    join time_entries t on t.period_id = rp.id
   where t.project_id = v_p_migr and t.work_date = date '2026-03-05';
  perform test_assert(r.period_start = date '2026-03-01',
                      'die offene Woche wandert auf den Sonntagsschnitt');
  perform test_assert(not exists (
    select 1 from reporting_periods
    where customer_id = v_nord and cycle = 'weekly' and period_start = date '2026-03-02'),
    'die leere Montagswoche bleibt nicht zurueck');

  -- Und wieder zurueck, damit die folgenden Zusicherungen den Ausgangsstand sehen.
  update customers set week_start_day = 'monday' where id = v_nord;
  perform test_assert((
    select rp.period_start from reporting_periods rp
      join time_entries t on t.period_id = rp.id
     where t.project_id = v_p_migr and t.work_date = date '2026-03-05') = date '2026-03-02',
    'zurueckgestellt gilt wieder der Montagsschnitt');

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

  raise notice 'Wochenbeginn nach der ersten Meldung';
  -- Ab der ersten gemeldeten Woche ist der Schnitt gegenueber dem Kunden
  -- verbindlich; ein Wechsel wuerde ihn nachtraeglich verschieben.
  select rp.id into v_period
  from reporting_periods rp
    join time_entries t on t.period_id = rp.id
  where t.project_id = v_p_migr and t.work_date = date '2026-03-05';
  perform fn_submit_period(v_period);
  perform test_expect_error(
    format('update customers set week_start_day = ''sunday'' where id = %L', v_nord),
    'Wochenbeginn nach einer Meldung zu aendern wird abgelehnt');
  perform test_assert(
    (select week_start_day from customers where id = v_nord) = 'monday',
    'und der bisherige Wochenbeginn bleibt stehen');

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

  raise notice 'Periode wieder oeffnen';
  -- Der Kunde weist eine Position zurueck: die Meldung muss zuruecknehmbar sein.
  -- v_period zeigt inzwischen auf die Nordwind-Woche; hier geht es um die
  -- gemeldete ACME-Monatsperiode, in der v_entry liegt.
  select period_id into v_period from time_entries where id = v_entry;
  perform test_assert(
    (select count(*) from period_events where period_id = v_period and event = 'submitted') = 1,
    'die Meldung steht im Protokoll');

  perform fn_reopen_period(v_period, 'Kunde hat Workshop-Position zurueckgewiesen');
  select * into r from reporting_periods where id = v_period;
  perform test_assert(r.status = 'open',            'Periode ist wieder offen');
  perform test_assert(r.submitted_at is null,       'der Meldezeitpunkt ist zurueckgenommen');
  perform test_assert(r.total_minutes is null,      'die eingefrorene Summe ist weg');
  perform test_assert(r.reopen_count = 1,           'die Wiedereroeffnung ist gezaehlt');
  perform test_assert(r.reopened_at is not null,    'und mit Zeitpunkt vermerkt');

  select * into r from period_events where period_id = v_period and event = 'reopened';
  perform test_assert(r.note = 'Kunde hat Workshop-Position zurueckgewiesen',
                      'der Grund steht im Protokoll');
  perform test_assert(r.total_minutes = 90,
                      'und was gemeldet war, bleibt dort nachlesbar');

  perform test_assert(
    (select rate_snapshot from time_entries where id = v_entry) is null,
    'der eingefrorene Satz ist wieder beweglich');
  perform test_assert(
    (select status from time_entries where id = v_entry) = 'draft',
    'der Eintrag ist wieder ein Entwurf');

  -- Und jetzt laesst sich wirklich umbuchen.
  update time_entries set duration_minutes = 120 where id = v_entry;
  perform test_assert(
    (select billable_minutes from time_entries where id = v_entry) = 120,
    'nach dem Oeffnen ist der Eintrag wieder aenderbar');

  perform test_expect_error(
    format('select fn_reopen_period(%L)', v_period),
    'eine offene Periode nochmals zu oeffnen wird abgelehnt');

  -- Erneut melden friert zum heutigen Stand ein.
  perform fn_submit_period(v_period);
  select * into r from reporting_periods where id = v_period;
  perform test_assert(r.status = 'submitted',   'die berichtigte Periode ist wieder gemeldet');
  perform test_assert(r.total_minutes = 120,    'mit der berichtigten Summe');
  perform test_assert(
    (select count(*) from period_events where period_id = v_period) = 3,
    'Melden, Oeffnen, Melden - drei Eintraege im Protokoll');

  -- Abgerechnet ist Schluss: dahinter haengt eine Rechnung.
  update reporting_periods set status = 'invoiced' where id = v_period;
  perform test_expect_error(
    format('select fn_reopen_period(%L)', v_period),
    'eine abgerechnete Periode laesst sich nicht wieder oeffnen');
  update reporting_periods set status = 'submitted' where id = v_period;

  raise notice 'Arbeitspakete';
  insert into work_packages (project_id, code, name, sort_order)
  values (v_p_crm, 'MIGR', 'Datenmigration', 1) returning id into v_paket;
  insert into work_packages (project_id, code, name)
  values (v_p_migr, 'ROLL', 'Rollout') returning id into v_fremd;

  perform test_expect_error(
    format('insert into work_packages (project_id, code, name) values (%L, ''MIGR'', ''Doppelt'')', v_p_crm),
    'zwei Arbeitspakete mit gleichem Kuerzel im Projekt werden abgelehnt');
  insert into work_packages (project_id, code, name) values (v_p_migr, 'MIGR', 'Gleiches Kuerzel, anderes Projekt');
  perform test_assert(true, 'dasselbe Kuerzel in einem anderen Projekt ist erlaubt');

  -- Buchen auf ein Paket des eigenen Projekts.
  insert into time_entries (owner_id, project_id, work_package_id, work_date, duration_minutes, description)
  values (v_owner, v_p_crm, v_paket, date '2026-06-08', 120, 'Feldmapping')
  returning id into v_entry;
  select * into r from v_time_entries_full where id = v_entry;
  perform test_assert(r.work_package_code = 'MIGR', 'die Sicht fuehrt das Kuerzel mit');
  perform test_assert(r.work_package_name = 'Datenmigration', 'und den Namen');

  -- Das Paket eines fremden Projekts waere eine stille Fehlbuchung.
  perform test_expect_error(
    format('insert into time_entries (owner_id, project_id, work_package_id, work_date,
                                      duration_minutes, description)
            values (%L, %L, %L, date ''2026-06-09'', 60, ''Fehlbuchung'')',
           v_owner, v_p_crm, v_fremd),
    'ein Arbeitspaket aus einem anderen Projekt wird abgelehnt');
  perform test_expect_error(
    format('update time_entries set work_package_id = %L where id = %L', v_fremd, v_entry),
    'auch nachtraeglich laesst es sich nicht umhaengen');

  -- Ohne Paket bleibt alles wie bisher.
  perform test_assert(
    (select work_package_id from time_entries where id = v_entry) = v_paket,
    'das eigene Paket bleibt stehen');
  update time_entries set work_package_id = null where id = v_entry;
  perform test_assert(
    (select work_package_id from time_entries where id = v_entry) is null,
    'ein Arbeitspaket ist optional');

  -- Ein bebuchtes Paket darf nicht verschwinden.
  update time_entries set work_package_id = v_paket where id = v_entry;
  perform test_expect_error(
    format('delete from work_packages where id = %L', v_paket),
    'ein bebuchtes Arbeitspaket kann nicht geloescht werden');

  -- Mit dem Projekt geht es allerdings mit.
  perform test_assert(
    (select count(*) from work_packages where project_id = v_p_migr) = 2,
    'Nordwind hat zwei Arbeitspakete');

  delete from time_entries where id = v_entry;
  delete from work_packages where id = v_paket;

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
        'is_billable','description','iso_year','iso_week','week_start','month_start','year',
        'customer_code','project_code','activity_name',
        'work_package_id','work_package_code','work_package_name'
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

    -- Die Arbeitszeitseite sortiert direkt ueber die Tabellen.
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='work_schedules'
                     and column_name='valid_from') then
      v_fehlend := v_fehlend || 'work_schedules.valid_from';
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='absences'
                     and column_name='date_from') then
      v_fehlend := v_fehlend || 'absences.date_from';
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='holidays'
                     and column_name='holiday_date') then
      v_fehlend := v_fehlend || 'holidays.holiday_date';
    end if;

    -- Die Periodenseite liest den Zaehler und sortiert das Protokoll.
    foreach v_spalte in array array['reopen_count','reopened_at'] loop
      if not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='reporting_periods'
                       and column_name=v_spalte) then
        v_fehlend := v_fehlend || ('reporting_periods.' || v_spalte);
      end if;
    end loop;
    foreach v_spalte in array array['period_id','created_at','event','note','total_minutes','total_fees'] loop
      if not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='period_events'
                       and column_name=v_spalte) then
        v_fehlend := v_fehlend || ('period_events.' || v_spalte);
      end if;
    end loop;

    perform test_assert(cardinality(v_fehlend) = 0,
      'alle von der Oberflaeche genutzten Spalten sind in den Sichten vorhanden'
      || case when cardinality(v_fehlend) > 0
              then ' - fehlt: ' || array_to_string(v_fehlend, ', ') else '' end);
  end;

  -- Der Feiertagsimport nennt PostgREST diese Spalten als Konfliktziel. Passt der
  -- Schluessel nicht exakt dazu, scheitert jeder Import mit 42P10.
  perform test_assert(exists (
    select 1 from pg_constraint
    where conrelid = 'public.holidays'::regclass
      and contype in ('p','u')
      and (select array_agg(attname::text order by attname::text)
             from pg_attribute
            where attrelid = conrelid and attnum = any(conkey))
          = array['holiday_date','owner_id','region']
  ), 'holidays hat den Schluessel, auf den der Feiertagsimport aufsetzt');

  raise notice 'ALLE ZUSICHERUNGEN ERFUELLT';
end $$;
