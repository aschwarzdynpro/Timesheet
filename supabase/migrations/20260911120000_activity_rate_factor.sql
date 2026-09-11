-- Satzfaktor an der Taetigkeitsart
--
-- Bisher entstand ein abweichender Satz ausschliesslich als eigener Eintrag in
-- der Satzhistorie: "Reisezeit zu 70 EUR" ist ein project_rates-Satz mit
-- activity_type_id. Das ist genau richtig, solange der abweichende Satz eine
-- Abmachung mit *diesem* Kunden ist.
--
-- Fuer einen Zuschlag, der ueberall gleich gilt, ist es der falsche Ort: Ein
-- Wochenendzuschlag von 50 Prozent muesste dann je Projekt einzeln gepflegt
-- werden - und bei jedem Projekt, an dem er fehlt, faellt die Satzermittlung
-- still auf den Normalsatz zurueck. Still ist das Problem: Die Oberflaeche
-- warnt nur, wenn *gar kein* Satz gefunden wird. Ein gefundener, aber falscher
-- Satz sieht aus wie ein richtiger, und der Zuschlag geht unbemerkt verloren.
--
-- Deshalb traegt die Taetigkeitsart einen Faktor auf den allgemeinen
-- Projektsatz. "Wochenende +50 %" und "Reisezeit zum halben Satz" sind damit
-- eine Angabe an einer Stelle statt einer je Projekt.
--
-- Die Rangfolge bleibt, wie sie war, und der Faktor ordnet sich darunter ein:
--
--   1. Satz fuer genau diese Taetigkeitsart  -> gilt unveraendert
--   2. allgemeiner Projektsatz               -> mal Faktor der Taetigkeitsart
--
-- Ein ausgehandelter Satz wird also nie nachtraeglich multipliziert. Wer fuer
-- ein Projekt "Reisezeit 70 EUR" vereinbart hat, bekommt 70 EUR, auch wenn die
-- Art daneben einen Faktor traegt. Andernfalls wuerde eine Aenderung an der
-- Taetigkeitsart stillschweigend Vertraege umschreiben.

alter table activity_types
  add column rate_factor numeric(6,4) not null default 1;

-- Die Obergrenze faengt den Tippfehler ab, der hier am naechsten liegt: 150
-- statt 1,5 - also einen Faktor, der aus 125 EUR 18.750 EUR machen wuerde.
-- Die Untergrenze ist echt groesser als null: Ein Faktor von 0 ergaebe eine
-- abrechenbare Zeit zu 0,00 EUR, und genau diese stille Null war der Fehler,
-- den die Satzwarnung beheben sollte. Wer nicht berechnen will, nimmt das
-- Kennzeichen "abrechenbar" weg - das sagt dasselbe, aber sichtbar.
alter table activity_types
  add constraint activity_types_rate_factor_valid
    check (rate_factor > 0 and rate_factor <= 10);

comment on column activity_types.rate_factor is
  'Faktor auf den allgemeinen Projektsatz; ein eigener Satz fuer diese Art schlaegt ihn';

-- ------------------------------------------------------------ Satzermittlung

-- Unveraendert in der Auswahl des Satzes - nur die Bewertung des Treffers ist
-- neu. Der Verbund auf activity_types haengt am Parameter und nicht an der
-- gefundenen Zeile: er vervielfacht das Ergebnis deshalb nicht.
--
-- Gerundet wird auf den Cent, weil der Satz auch angezeigt wird. Ein Satz, der
-- als 187,50 EUR in der Zeile steht, aber mit 187,4999 rechnet, waere ein
-- Cent-Unterschied, den niemand erklaeren kann.
create or replace function fn_rate_for(
  p_project_id       uuid,
  p_activity_type_id uuid,
  p_on_date          date
) returns numeric
language sql stable security invoker set search_path = public as $$
  select case
    when r.activity_type_id is not null then r.hourly_rate
    else round(r.hourly_rate * coalesce(a.rate_factor, 1), 2)
  end
  from project_rates r
  left join activity_types a on a.id = p_activity_type_id
  where r.project_id = p_project_id
    and daterange(r.valid_from, r.valid_to, '[]') @> p_on_date
    and (r.activity_type_id is null or r.activity_type_id = p_activity_type_id)
  order by (r.activity_type_id is not null) desc
  limit 1
$$;

comment on function fn_rate_for(uuid, uuid, date) is
  'Gueltiger Satz zum Leistungsdatum: eigener Satz der Taetigkeitsart, sonst Projektsatz mal deren Faktor';

-- Die Sichten rufen die Funktion beim Lesen auf und brauchen deshalb keine
-- Neufassung. Bereits gemeldete Zeiten tragen ihren eingefrorenen Satz in
-- rate_snapshot; an ihnen aendert ein Faktor nichts - was gemeldet wurde,
-- bleibt, wie es gemeldet wurde.
