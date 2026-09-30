-- Monatsuebersicht fuer die Rechnungsstellung
--
-- Je Leistungsmonat: abrechenbare Stunden und Honorar je Projekt, darueber die
-- Summe je Kunde und die Summe ueber alle Kunden. Alle drei Ebenen entstehen
-- hier in einem GROUPING SETS, damit Oberflaeche, Excel-Datei und spaeter der
-- FinOps-Adapter dieselbe Kundensumme lesen, statt sie jeder fuer sich zu
-- bilden.
--
-- Summiert werden die bereits gerundeten Zeilenbetraege aus
-- v_time_entries_full, wie in v_report_month auch - sonst wichen Rechnung und
-- Auswertung um Cents voneinander ab.
--
-- avg_rate ist ein Quercheck, kein Rechnungsposten: Honorar geteilt durch die
-- Stunden, fuer die ein Satz gilt. Stunden ohne Satz stehen mit 0,00 EUR im
-- Honorar und zaehlen gesondert in minutes_without_rate - sie wuerden den
-- Durchschnitt sonst still nach unten ziehen.
--
-- open_periods zaehlt die Meldeperioden, in denen Zeiten dieses Monats liegen
-- und die noch nicht gemeldet sind. Gezaehlt wird ueber die Eintraege, nicht
-- ueber die Ueberlappung der Grenzen: eine offene Woche 30.03.-05.04. mit nur
-- Aprilzeiten betrifft die Maerzrechnung nicht. Interne Zeit zaehlt mit, denn
-- gemeldet wird die Periode als Ganzes.
--
-- Zeilen ohne abrechenbare Zeit fallen weg: ein Projekt mit 0,00 h waere auf
-- einer Rechnungsgrundlage nur Rauschen.
create view v_billing_month
with (security_invoker = true) as
select
  owner_id,
  month_start,
  case
    when grouping(customer_id) = 1 then 'total'
    when grouping(project_id)  = 1 then 'customer'
    else 'project'
  end                                                             as level,
  customer_id,
  customer_code,
  customer_name,
  project_id,
  project_code,
  project_name,
  sum(billable_minutes) filter (where is_billable)::int           as minutes_billable,
  round(coalesce(sum(amount) filter (where is_billable), 0), 2)   as fees,
  round(
    sum(amount) filter (where is_billable and rate is not null)
    / nullif(sum(billable_minutes) filter (where is_billable and rate is not null), 0)
    * 60
  , 2)                                                            as avg_rate,
  coalesce(sum(billable_minutes) filter (where is_billable and rate is null), 0)::int
                                                                  as minutes_without_rate,
  count(distinct period_id) filter (where period_status = 'open')::int
                                                                  as open_periods
from v_time_entries_full
group by grouping sets (
  (owner_id, month_start, customer_id, customer_code, customer_name,
   project_id, project_code, project_name),
  (owner_id, month_start, customer_id, customer_code, customer_name),
  (owner_id, month_start)
)
having coalesce(sum(billable_minutes) filter (where is_billable), 0) > 0;
