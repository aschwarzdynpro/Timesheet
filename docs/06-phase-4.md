# Phase 4 – Export nach Excel

Stand: 2026-09-06

## Was entstanden ist

Die Seite `/export` stellt eine Tabellendatei aus denselben Zeilen zusammen, die auch
Wochenraster und Auswertungen anzeigen — aus der Sicht `v_time_entries_full`. Damit steht
im Export exakt das, was die App zeigt, und nicht eine zweite Rechnung.

**Ablauf:** Zeitraum und Filter setzen (Kunde, Projekt, nur abrechenbare) → Spalten
zusammenstellen → Vorschau der ersten 50 Zeilen mit Summenzeile → Datei erzeugen.

**Spalten** sind eine geordnete Auswahl aus sechzehn: Datum · KW · Monat · Kundenkürzel ·
Kunde · Projektkürzel · Projekt · Tätigkeitsart · Beschreibung · Erfasst (h) ·
Abrechenbar (h) · Abrechenbar j/n · Stundensatz · Betrag · Status · Periode. Jede Spalte
weiß selbst, wie sie einen Eintrag in eine Zelle übersetzt — einmal als Text für die
Vorschau, einmal mit Typ und Zahlenformat für die Datei. Die Reihenfolge lässt sich
ändern und bestimmt die Spaltenfolge in der Datei.

**Profile** sichern Spaltenauswahl und Filter unter einem Namen. „ACME — monatlich“ einmal
anlegen, danach ist der Monatsversand: Profil wählen, Zeitraum setzen, Datei erzeugen.
Der Zeitraum bleibt bewusst außerhalb des Profils — er ändert sich ja jeden Monat.

In der Datei: fette Kopfzeile mit fixierter erster Zeile, Spaltenbreiten je Spalte,
Datumszellen als echte Datumswerte (nicht als Text), Stunden und Beträge als Zahlen mit
Format, und eine Summenzeile. Summiert werden nur Spalten, bei denen eine Summe etwas
bedeutet — ein aufsummierter „Stundensatz“ wäre schlicht eine falsche Zahl.

## Abweichung vom Konzept: nicht SheetJS

Das Konzept nannte SheetJS (`xlsx`). Dessen npm-Paket steht seit 0.18.5 still, weil
neuere Versionen nur noch über eigene Kanäle verteilt werden. `npm audit` meldet dafür:

```
xlsx  *
Severity: high
Prototype Pollution in sheetJS
SheetJS Regular Expression Denial of Service (ReDoS)
No fix available
```

Zwei hochstufige Befunde ohne verfügbare Behebung — das kommt nicht in eine App, die
Abrechnungsdaten verarbeitet. Stattdessen `write-excel-file`: kann ausschließlich
schreiben, also genau das, was hier gebraucht wird, ist gepflegt und meldet keinen
Befund. Sie wird erst beim Klick nachgeladen (72 kB als eigener Brocken), statt in jedem
Seitenaufruf mitzureisen.

## Geprüft

Der Export wurde nicht nur ausgelöst, sondern die **erzeugte Datei ausgepackt und
gelesen**: Kopfzeile, drei Datenzeilen und Summenzeile stehen in den richtigen Spalten,
die Umlaute sind intakt, die Summen stimmen (8,00 h und 1.120,00 €), und die
Datumsseriennummer 46237 entspricht dem 03.08.2026 — kein Zeitzonenversatz.

Dabei ein Fehler **in meinem Prüfskript**, nicht in der Anwendung: Der reguläre Ausdruck
erfasste selbstschließende `<c …/>`-Zellen nicht und ordnete Werte dadurch falschen
Spalten zu. Das sah zweimal nach einer verrutschten Summenzeile aus. Erst der Blick ins
rohe XML zeigte, dass die Datei von Anfang an korrekt war.

## Nachtrag: Spalte „Periode“ aus der Meldeperiode

Stand: 2026-09-11

Die Spalte „Periode“ nannte den Monat des Leistungstages (`month_start`), nicht die
Meldeperiode. Bei monatlicher Meldung fällt beides zusammen; beim wöchentlich meldenden
Hauptkunden mit Wochenbeginn Sonntag bekam die Woche 30.08.–05.09.2026 damit zwei Werte
(„2026-08“ und „2026-09“) für dieselbe Periode.

Die Ursache lag eine Schicht tiefer: `v_time_entries_full` führte nur `period_id`. Die
Oberfläche kannte weder Zyklus noch Grenzen der Periode und riet. Jetzt führt die Sicht
`period_cycle`, `period_start`, `period_end` und `period_status` aus `reporting_periods`
mit (Migration `20260911120000_view_period_bounds.sql`, Spalten angehängt, `left join`,
weil `period_id` leer sein darf), und der Export beschriftet daraus: bei wöchentlicher
Meldung „30.08.2026 – 05.09.2026“, bei monatlicher „September 2026“. Der Wert ist für
alle Einträge derselben Periode identisch, weil die Datenbank die Grenzen geschnitten
hat und die Oberfläche sie nur zeigt. Bewusst keine Kalenderwoche: eine Sonntagswoche
ist keine ISO-Woche, „KW 36“ hätte für den Hauptkunden den falschen Schnitt benannt.

**Migration vor dem Frontend ausrollen.** Läuft das neue Frontend gegen die alte Sicht,
fehlen die Spalten in der Antwort von PostgREST. Der Export zeigt dann einen
Gedankenstrich statt eines geratenen Werts. Umgekehrt ist die neue Sicht für das alte
Frontend unschädlich: die Spalten hängen am Ende an.

**Beim Bauen gefunden.** Kein Test hätte den Fehler gezeigt: Der Schematest kannte die
Sicht nur mit `period_id`, und der Export rechnete den Wert aus einer Spalte, die es
gab. Warum es niemand bemerkt hat: Bei monatlicher Meldung stimmt der Monat des
Leistungstages mit der Periode überein, die Spalte gehört nicht zur Voreinstellung, und
bei wöchentlicher Meldung zeigt sich der Fehler nur in den vier bis fünf Wochen im Jahr,
die über einen Monatswechsel laufen. Der Schematest hält jetzt genau diese Woche fest:
zwei Einträge, 31.08. und 02.09., derselbe Periodenschnitt.

## Nachtrag: Monatsübersicht für die Rechnung

Für die Rechnung zählt nicht der Einzelnachweis, sondern je Kunde: wie viele Stunden auf
welchem Projekt, welcher Umsatz, und beides zusammen für den Kunden. Die Exportseite hat
dafür oben einen Umschalter **Einzelnachweis | Monatsübersicht**. Die Monatsübersicht
zeigt einen wählbaren Leistungsmonat (voreingestellt der Vormonat, weil abgerechnet wird,
was abgeschlossen ist), je Kunde eine Karte mit den Projekten und der Kundensumme,
darunter die Summe über alle Kunden. „Excel erzeugen“ schreibt ein Blatt je Kunde und,
bei mehr als einem Kunden, eine Übersicht davor.

Warum im Export und nicht in den Auswertungen: Die Auswertungen sehen auf das Jahr und
dienen der Analyse; die Rechnung ist ein Monatsabschluss mit einer Datei am Ende — genau
wie der Einzelnachweis. So bleibt auch die Navigation, wie sie ist.

**Die Summen kommen aus der Datenbank.** Die Sicht `v_billing_month`
(Migration `20260930120000_billing_month.sql`) bildet mit `GROUPING SETS` drei Ebenen:
Projekt, Kunde, gesamt (`level`). Die Oberfläche ordnet die Zeilen nur an
(`gliedereMonat()` in `features/export/monat.ts`); sie summiert nichts. Summiert werden
die gerundeten Zeilenbeträge aus `v_time_entries_full`, wie in `v_report_month` — die
Rechnung weicht damit um keinen Cent von der Auswertung ab.

- **Nur abrechenbare Zeit**, nach dem Tag der Leistung (`month_start`). Projekte ohne
  abrechenbare Zeit fallen weg; eine Zeile mit 0,00 h wäre auf einer Rechnungsgrundlage
  Rauschen.
- **Ø Satz ist ein Quercheck**, kein Rechnungsposten: Umsatz ÷ Stunden *mit* gültigem
  Satz. Zeit ohne Satz steht mit 0,00 € im Umsatz und gesondert in
  `minutes_without_rate`; die Ansicht warnt davor, statt den Durchschnitt still
  herunterzuziehen.
- **Offene Perioden** (`open_periods`) zählen die noch nicht gemeldeten Perioden, in
  denen Zeiten *dieses* Monats liegen — über die Einträge, nicht über die Überlappung der
  Grenzen. Eine offene Woche 30.03.–05.04. mit nur Aprilzeiten betrifft die
  Märzrechnung nicht. Die Karte weist darauf hin und verlinkt die Perioden.

**Beim Bauen gefunden.** Die Blätter jeder erzeugten Datei hießen „Sheet1“, „Sheet2“ —
auch im bestehenden Einzelnachweis, wo „Spesen“ und der Kundenname stehen sollten.
`write-excel-file` erwartet den Blattnamen seit Version 4 unter `sheet`, nicht mehr
unter `name`, und ignoriert unbekannte Schlüssel still. Der Typcheck sah es nicht, weil
die Blätter als ungetippte Objekte in Variablen standen; dort greift die Prüfung auf
überzählige Eigenschaften nicht. Warum es niemand bemerkt hat: Die Datei öffnet sich,
Zahlen und Spalten stimmen, und den Reiter unten liest man nicht. Die Blätter sind jetzt
als `Sheet<Blob>` getippt — ein falscher Schlüssel bricht den Typcheck.
