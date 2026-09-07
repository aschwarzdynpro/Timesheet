# Phasen 3 und 5 – Auswertungen, Arbeitszeit und Perioden-Workflow

Stand: 2026-09-06

## Auswertungen (`/auswertungen`)

Alle Zahlen kommen aus den vorbereiteten Sichten `v_report_week`, `v_report_month` und
`v_report_year`. Die Oberfläche summiert nur, was ohnehin zusammengehört, und rechnet
keine Bewertung nach — dieselbe Grundlage, die später Export und Kundenmeldung nutzen.

**Steuerung:** Jahr · Auflösung (Monat oder Kalenderwoche) · Kunde.

**Kennzahlen:** erfasste Stunden · abrechenbare Stunden mit Anteil · Honorar ·
Ø realisierter Satz · Auslastung.

Der **Ø realisierte Satz** teilt das Honorar durch die *erfassten*, nicht durch die
berechneten Stunden. Genau diese Kennzahl macht ein Projekt sichtbar, das nominell zu
150 € läuft und tatsächlich 105 € einbringt, weil ein Drittel der Zeit nicht abrechenbar
war. Die **Auslastung** erscheint nur, wenn ein Arbeitszeitmodell hinterlegt ist —
ohne Sollzeit gibt es keine Quote, und eine erfundene Zahl wäre schlimmer als keine.

**Diagramme.** Zwei, beide als Inline-SVG ohne Diagrammbibliothek: der Verlauf als
gestapelte Säulen (abrechenbar / intern) und das Honorar je Kunde als waagerechte Balken
mit direkter Beschriftung. Die beiden Farben stammen aus einer geprüften Palette und
bestehen Helligkeitsband, Chroma-Untergrenze, Farbsehschwächen-Abstand (ΔE 24,7) und
Kontrast gegen weiße Fläche. Das Konzept nannte Recharts; zwei einfache Formen
rechtfertigen keine Bibliothek, und von Hand lassen sich Details wie die 2 px Luft
zwischen gestapelten Flächen und die selektive Achsenbeschriftung genauer einhalten.

**Budgetampel.** Je Projekt der Stand gegen Stunden- oder Betragsbudget. Der Zustand
steckt in Balken, Prozentzahl *und* Wort („im Rahmen“, „knapp“, „überschritten“) — nie
allein in der Farbe.

## Arbeitszeit (`/einstellungen`)

Die Auslastungsquote der Auswertungen kommt aus `fn_target_minutes(von, bis)`. Diese
Funktion war seit Phase 1 da, ihre drei Datenquellen aber ohne Oberfläche — die Quote
blieb deshalb dauerhaft ausgeblendet. Die Seite füllt genau diese Lücke.

**Arbeitszeitmodell.** Sollstunden je Wochentag, historisiert über `valid_from`/`valid_to`.
Ein Wechsel von 40 auf 32 Stunden legt einen zweiten Zeitraum an, statt den ersten zu
überschreiben; ältere Auswertungen rechnen dadurch weiter mit dem, was damals galt. Eine
`EXCLUDE`-Bedingung in der Datenbank verhindert überlappende Zeiträume, die Meldung dazu
ist ins Deutsche übersetzt. Die Eingabe je Tag versteht dieselben Schreibweisen wie die
Zeiterfassung — `8`, `7,5`, `7:30`.

**Feiertage.** Nicht abgetippt, sondern gerechnet: `src/lib/holidays.ts` bestimmt den
Ostersonntag nach dem anonymen gregorianischen Algorithmus und leitet daraus Karfreitag,
Ostermontag, Christi Himmelfahrt, Pfingstmontag und Fronleichnam ab; die festen Tage und
die Länderunterschiede stehen als Tabelle daneben. Bundesland und Jahr wählen, die
berechnete Liste steht sofort als Vorschau da, ein Klick übernimmt sie.

Übernommen wird mit `on_conflict=(owner_id, holiday_date, region)` und
`ignoreDuplicates` — ein zweiter Lauf legt nichts doppelt an und läuft ohne Fehler durch.

Bewusst **nicht** enthalten sind Tage, die sich nicht am Bundesland festmachen lassen:
Mariä Himmelfahrt gilt in Bayern nur in überwiegend katholischen Gemeinden, Fronleichnam
in Sachsen und Thüringen nur in einzelnen, das Augsburger Friedensfest nur in Augsburg.
Eine Liste, die solche Tage pauschal setzt, wäre für die meisten Nutzungen falsch; sie
lassen sich bei Bedarf als Abwesenheit nachtragen. Buß- und Bettag (nur Sachsen) ist
dagegen drin, weil er landesweit gilt — als Mittwoch vor dem 23. November berechnet.

**Abwesenheiten.** Urlaub, Krankheit, Weiterbildung, Sonstiges als Zeitraum. Sie ziehen
die Sollzeit ab; ohne sie fällt die Quote in Urlaubswochen künstlich niedrig aus.

## Perioden (`/perioden`)

Die Liste aller Meldeperioden mit Status, Summen und Positionen. Offene Perioden rechnen
live aus den Einträgen; gemeldete tragen ihre Summen selbst, weil sie beim Freigeben
zusammen mit dem Stundensatz eingefroren wurden.

Oben steht eine Warnung für **abgelaufene, noch nicht gemeldete Perioden** — der Fall,
den man im Alltag tatsächlich vergisst und der im Fachkonzept als wichtigster
Dashboard-Punkt genannt ist.

### Wochenbeginn je Kunde

Bei wöchentlicher Meldung steht am Kunden, ob die Woche am **Montag oder am Sonntag**
beginnt. `date_trunc('week', …)` in PostgreSQL kennt nur ISO-8601 und damit nur den
Montag; der Sonntagsschnitt entsteht, indem ein Tag vorgezogen, der ISO-Montag bestimmt
und wieder ein Tag zurückgegangen wird. Der Wochenbeginn geht als dritter Parameter in
`fn_period_bounds`; `fn_ensure_period` liest ihn beim Kunden, sodass kein Aufrufer davon
weiß — dieselbe Linie wie bei Rundung und Rhythmus: die Regel steht in der Datenbank.

Zwei Fälle waren zu entscheiden:

- **Umstellung mit Bestand.** Jede Wochengrenze verschiebt sich. Offene Wochen werden
  deshalb neu geschnitten: die Vorbereitungs-Trigger rechnen `period_id` ohnehin bei
  jedem Schreibvorgang neu, eine Aktualisierung ohne inhaltliche Änderung genügt, um sie
  erneut auszulösen. Was danach leer zurückbleibt, ist eine Woche im alten Schnitt und
  wird gelöscht.
- **Umstellung nach einer Meldung.** Sie ist gesperrt. Der gemeldete Zeitraum ist
  gegenüber dem Kunden verbindlich; ihn nachträglich zu verschieben wäre ein stiller
  Widerspruch zu dem, was er bereits bekommen hat. Ein Trigger lehnt den Wechsel ab,
  sobald für den Kunden eine Wochenperiode nicht mehr `open` ist.

Die eigenen Auswertungen (`v_report_week`, das Wochenraster) bleiben bei ISO-Wochen ab
Montag. Sie beantworten „wie war meine Woche", nicht „was bekommt dieser Kunde" — ein
kundenabhängiger Schnitt würde die eigenen Zahlen zwischen Kunden unvergleichbar machen.

Die Freigabe ruft `fn_submit_period()` als RPC auf. Die gesamte Arbeit — Sätze einfrieren,
Summen schreiben, Status setzen — passiert in der Datenbank, in einer Transaktion. Vorher
nennt eine Rückfrage Kunde, Zeitraum und die Folge im Klartext: Danach sind die Zeiten
gesperrt und die Sätze eingefroren, und das lässt sich in der App nicht zurücknehmen.

## Beim Bauen gefunden

- **Ein Typ-Cast, der zur Laufzeit falsch gewesen wäre.** Die Tooltip-Position im
  Verlaufsdiagramm wurde mit `as unknown as number` durch die Typprüfung gezwungen,
  hätte aber Prozentwerte als Pixel geliefert. Jetzt sauber als CSS-Prozentwerte.
- **Sollzeit ohne Weg zur Eingabe.** `fn_target_minutes` existierte seit Phase 1, die
  Tabellen `work_schedules`, `absences` und `holidays` ebenso — nur führte keine Route
  dorthin. Die Auslastung blendete sich damit korrekt aus, dauerhaft und ohne Hinweis,
  wie man das ändert. Der Leerzustand sagt es jetzt und verlinkt die Anlage.
- **Fehlermeldung aus dem vorigen Versuch.** Die beiden Dialoge blieben eingehängt und
  nur ihr Inhalt verschwand; die zuletzt gezeigte Meldung stand beim nächsten Öffnen
  wieder da. Sie werden jetzt erst beim Öffnen eingehängt und starten dadurch leer.
- **„Melden“ neben „Abmelden“.** Ein automatischer Test klickte statt der Freigabe den
  Logout in der Seitenleiste — Playwright sucht Namen als Teilzeichenkette, und „Melden“
  steckt in „Abmelden“. Das war ein Testfehler, kein Anwendungsfehler; die Verwechselbarkeit
  ist aber real, deshalb heißt die Schaltfläche jetzt „Periode melden“.

## Geprüft

Beide Seiten im Browser mit Testdaten: Kennzahlen nachgerechnet (149.450 € ÷ 1.224 h =
122,10 €/h; 1.093 ÷ 1.600 h = 68 % Auslastung), Diagramme gerendert, Perioden-Detail
aufklappbar, Freigabe ruft `fn_submit_period` mit der richtigen Periode. Kein seitliches
Scrollen auf sieben Seiten mal vier Breiten (320, 390, 768, 1400 px), keine
Konsolenfehler.

Die Arbeitszeitseite in 13 Schritten im Browser: Modell anlegen (36,00 h je Woche),
ändern (`7:30` → 39,50 h), unverständliche Dauer wird mit Nennung des Tages abgefangen,
Feiertagsvorschau unterscheidet Bayern und Hamburg, Übernahme zählt so viele Tage wie
angekündigt, zweiter Lauf legt nichts doppelt an, Jahr löschen setzt zurück,
Abwesenheit anlegen/löschen, Ende vor Beginn wird abgefangen. Anschließend elf Seiten
mal vier Breiten ohne seitliches Scrollen und ohne Konsolenfehler.

Die Datenbankseite gegengeprüft: dieselben Anweisungen, die PostgREST erzeugt, in einer
Transaktion als angemeldeter Benutzer ausgeführt und wieder zurückgerollt. Der Import
legt zwei Tage an, der zweite Lauf keinen weiteren. Die Woche 01.–07.01.2026 ergibt bei
Mo–Fr je 8 h zunächst 1.920 statt 2.400 Minuten — Neujahr fällt auf den Donnerstag —
und nach einem Urlaubstag am Freitag 1.440. Damit rechnet die Sollzeit Feiertage und
Abwesenheiten nachweislich heraus.

Nicht geprüft: das Verhalten gegen die echte API im Browser. Die Browsertests mocken
`/rest/v1/**`; Vertragsfehler zwischen App und PostgREST — eine Spalte, die es nicht
gibt — bleiben darin unsichtbar. Deshalb der SQL-Gegentest oben und die
Spaltenprüfung in `supabase/tests/10_schema_test.sql`.
