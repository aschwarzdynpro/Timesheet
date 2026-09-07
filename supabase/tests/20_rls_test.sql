-- Prueft, dass Row Level Security tatsaechlich greift.
-- Laeuft in der Rolle 'authenticated', nicht als Eigentuemer der Tabellen:
-- fuer den Eigentuemer waere RLS wirkungslos und der Test wertlos.

\set ON_ERROR_STOP on

set role authenticated;

-- Der eingespielte Benutzer
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
begin
  perform test_assert((select count(*) from customers)    = 2, 'eigener Benutzer sieht seine 2 Kunden');
  perform test_assert((select count(*) from projects)     = 3, 'eigener Benutzer sieht seine 3 Projekte');
  perform test_assert((select count(*) from project_rates) > 0, 'eigener Benutzer sieht seine Saetze');
  perform test_assert((select count(*) from time_entries) > 0, 'eigener Benutzer sieht seine Zeiten');
  perform test_assert((select count(*) from period_events) > 0, 'eigener Benutzer sieht sein Periodenprotokoll');
end $$;

-- Ein fremder Benutzer
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  perform test_assert((select count(*) from customers)         = 0, 'fremder Benutzer sieht keine Kunden');
  perform test_assert((select count(*) from projects)          = 0, 'fremder Benutzer sieht keine Projekte');
  perform test_assert((select count(*) from project_rates)     = 0, 'fremder Benutzer sieht keine Saetze');
  perform test_assert((select count(*) from time_entries)      = 0, 'fremder Benutzer sieht keine Zeiten');
  perform test_assert((select count(*) from reporting_periods) = 0, 'fremder Benutzer sieht keine Perioden');
  perform test_assert((select count(*) from period_events)     = 0, 'fremder Benutzer sieht kein Periodenprotokoll');
  perform test_assert((select count(*) from v_time_entries_full) = 0,
                      'auch die Auswertungssicht bleibt leer (security_invoker greift)');
end $$;

reset role;
