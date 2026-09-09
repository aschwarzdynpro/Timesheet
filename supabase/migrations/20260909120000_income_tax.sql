-- Nettoumsatz: Honorar abzueglich Einkommensteuer
--
-- Das Honorar ist, was der Kunde zahlt. Was davon uebrig bleibt, sieht der
-- Nutzer bisher nirgends. Der Steuersatz ist eine persoenliche Angabe und
-- gehoert deshalb ins Profil, nicht an Kunde oder Projekt: er liegt in
-- app_settings unter dem Schluessel 'income_tax_percent'.
--
-- Ohne Eintrag gelten 42 Prozent - der deutsche Spitzensteuersatz und der Wert,
-- mit dem der Nutzer rechnet. Ein Standard statt einer Leerstelle, damit die
-- Kennzahl nicht erst nach einem Besuch im Profil erscheint.
--
-- Gerechnet wird hier und nicht in der Oberflaeche: dieselbe Zahl steht in der
-- Wochenuebersicht und in den Auswertungen, und beide sollen sie aus derselben
-- Quelle beziehen.
--
-- Bewusst nicht historisiert wie die Stundensaetze: der Steuersatz bewertet
-- nicht die Leistung von damals, sondern schaetzt, was heute uebrig bleibt.
-- Eine Aenderung wirkt deshalb auf alle Zeitraeume.

-- Prueft den Wert dort, wo er landet - eine Zahl, und eine sinnvolle. Ohne das
-- brachte ein Tippfehler ("42%") den Cast in fn_income_tax_percent zu Fall, und
-- zwar erst beim Lesen der Zeiten, weit weg vom Formular.
alter table app_settings
  add constraint app_settings_income_tax_percent_valid check (
    key <> 'income_tax_percent'
    or (jsonb_typeof(value) = 'number'
        and (value)::numeric >= 0
        and (value)::numeric <= 100)
  );

-- Der gepflegte Satz, sonst der Standard.
create or replace function fn_income_tax_percent()
returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select (s.value)::numeric
       from app_settings s
      where s.owner_id = (select auth.uid())
        and s.key = 'income_tax_percent'),
    42)
$$;

comment on function fn_income_tax_percent is
  'Einkommensteuersatz in Prozent aus dem Profil; ohne Pflege 42';

-- Honorar abzueglich Einkommensteuer, auf den Cent gerundet.
create or replace function fn_net_revenue(p_amount numeric)
returns numeric
language sql stable security invoker set search_path = public as $$
  select round(coalesce(p_amount, 0) * (1 - fn_income_tax_percent() / 100), 2)
$$;

comment on function fn_net_revenue is
  'Nettoumsatz: Honorar abzueglich des im Profil gepflegten Einkommensteuersatzes';

-- ------------------------------------------------------------------- Sichten

-- Der Betrag steht jetzt einmal in einem lateralen Unterausdruck statt zweimal
-- im Auswahlblock: net_amount braucht ihn, und zwei Abschriften derselben
-- Formel laufen frueher oder spaeter auseinander. Die Spalten bleiben in
-- Reihenfolge und Typ, wie sie waren - create or replace view darf nur
-- anhaengen, und die Auswertungssichten haengen an dieser hier.
create or replace view v_time_entries_full
with (security_invoker = true) as
select
  t.id,
  t.owner_id,
  t.project_id,
  t.activity_type_id,
  t.work_date,
  t.start_time,
  t.end_time,
  t.duration_minutes,
  t.billable_minutes,
  t.is_billable,
  t.description,
  t.status,
  t.period_id,
  p.code            as project_code,
  p.name            as project_name,
  c.id              as customer_id,
  c.code            as customer_code,
  c.name            as customer_name,
  a.code            as activity_code,
  a.name            as activity_name,
  b.rate,
  b.amount,
  t.rate_snapshot is not null as rate_is_frozen,
  extract(isoyear from t.work_date)::int as iso_year,
  extract(week    from t.work_date)::int as iso_week,
  date_trunc('week',  t.work_date)::date as week_start,
  date_trunc('month', t.work_date)::date as month_start,
  extract(quarter from t.work_date)::int as quarter,
  extract(year    from t.work_date)::int as year,
  t.created_at,
  t.updated_at,
  t.work_package_id,
  w.code            as work_package_code,
  w.name            as work_package_name,
  fn_net_revenue(b.amount) as net_amount
from time_entries t
join projects   p on p.id = t.project_id
join customers  c on c.id = p.customer_id
left join activity_types a on a.id = t.activity_type_id
left join work_packages  w on w.id = t.work_package_id
cross join lateral (
  select
    coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.activity_type_id, t.work_date)) as rate,
    round(
      t.billable_minutes / 60.0
      * coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.activity_type_id, t.work_date), 0)
    , 2) as amount
) b;

-- Die Aggregate summieren die bereits gerundeten Zeilenwerte, statt die Summe
-- neu zu bewerten. Sonst wichen Wochenuebersicht und Auswertung um Cents
-- voneinander ab - und zwar unerklaerlich, weil beide "dasselbe" zeigen.
create or replace view v_report_week
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  iso_year, iso_week, week_start,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees,
  round(sum(net_amount), 2)                               as fees_net
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name,
         iso_year, iso_week, week_start;

create or replace view v_report_month
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  year, month_start,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees,
  round(sum(net_amount), 2)                               as fees_net
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name, year, month_start;

create or replace view v_report_year
with (security_invoker = true) as
select
  owner_id, customer_id, customer_name, project_id, project_name,
  year,
  sum(duration_minutes)                                   as minutes_tracked,
  sum(billable_minutes)                                   as minutes_billable,
  sum(duration_minutes) filter (where not is_billable)     as minutes_internal,
  round(sum(amount), 2)                                   as fees,
  round(sum(net_amount), 2)                               as fees_net
from v_time_entries_full
group by owner_id, customer_id, customer_name, project_id, project_name, year;
