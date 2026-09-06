# Zeiterfassung – Fachkonzept

Stand: 2026-09-06 · Status: Entwurf zur Abstimmung

## 1. Ziel

Eine persönliche Zeiterfassung für Beratungsleistungen: Zeiten je **Kunde** und je **Projekt**
erfassen, je Projekt mit eigenem **Stundensatz** bewerten, wochen-/monats-/jahresweise
**auswerten**, kundenindividuell **reporten** (wöchentlich oder monatlich) und die Daten
später nach **D365 Finance & Operations (FinOps) Timesheets** übertragen bzw. als
**Excel mit frei wählbaren Spalten** exportieren.

Nutzerkreis: eine Person (du). Das Datenmodell ist trotzdem so gebaut, dass eine spätere
Mehrbenutzer-Erweiterung kein Redesign erzwingt (siehe §9).

## 2. Fachliche Kernentscheidungen

Diese Punkte sind die eigentliche Substanz des Konzepts – sie sind später teuer zu ändern.

### 2.1 Stundensätze sind zeitabhängig, nicht statisch

Ein Stundensatz am Projekt als einzelnes Feld ist der klassische Konstruktionsfehler:
Sobald der Satz zum 01.01. steigt, ändern sich rückwirkend alle Auswertungen des Vorjahres.

**Lösung:** Tabelle `project_rates` mit `valid_from` / `valid_to` je Projekt. Der Satz eines
Zeiteintrags ergibt sich aus dem Leistungsdatum. Zusätzlich wird der Satz beim Übergang
einer Periode nach *submitted* als `rate_snapshot` in den Zeiteintrag **eingefroren** –
danach ist der gemeldete Betrag unveränderlich, egal was mit der Satzhistorie passiert.

### 2.2 Zeiteinträge sind tagesbasiert, nicht zeitpunktbasiert

`work_date` ist ein `DATE`, kein `timestamptz`. Eine Leistung am 31.03. bleibt im März –
unabhängig von Zeitzone, Sommerzeit oder Serverstandort. Uhrzeiten (`start_time`,
`end_time`) sind optional und rein dokumentarisch; abrechnungsrelevant ist immer
`duration_minutes`.

Minuten statt Dezimalstunden als Speicherformat: 20 Minuten sind als `0,3333 h` nicht
verlustfrei darstellbar, Rundungsdifferenzen summieren sich über ein Jahr sichtbar auf.
Die Anzeige in Dezimalstunden erfolgt erst in der Darstellungsschicht.

### 2.3 Erfasste Zeit ≠ abrechenbare Zeit

Drei getrennte Größen je Eintrag:

| Feld | Bedeutung |
|---|---|
| `duration_minutes` | Was tatsächlich geleistet wurde (Ist) |
| `is_billable` | Ob es dem Kunden berechnet wird |
| `billable_minutes` | Was nach Rundungsregel abgerechnet wird |

Die Rundungsregel (z. B. 15-Minuten-Takt, aufrunden) hängt am Kunden und ist je Projekt
überschreibbar. Ohne diese Trennung lässt sich interne Zeit (Akquise, Weiterbildung,
Verwaltung) nicht sauber mitführen – und genau die brauchst du für eine ehrliche
Auslastungsquote.

### 2.4 Reporting-Perioden sind ein eigenes Objekt mit Status

Der Reporting-Rhythmus (wöchentlich / monatlich) hängt am **Kunden**, überschreibbar je
Projekt. Daraus entsteht pro Kunde und Zeitraum ein Datensatz `reporting_periods` mit
einem Lebenszyklus:

```
open  →  submitted  →  approved  →  invoiced
 │                                      │
 └────────── (nur aus open heraus editierbar) ──┘
```

Ab *submitted* sind die Zeiteinträge der Periode gesperrt (DB-Trigger, nicht nur UI).
Das ist der Unterschied zwischen einer Notizapp und einer Abrechnungsgrundlage: Was du
dem Kunden gemeldet hast, darf sich nicht unbemerkt ändern.

Wochen sind **ISO-8601** (Montag–Sonntag, KW 1 = Woche mit dem ersten Donnerstag).
PostgreSQL rechnet mit `EXTRACT(ISOYEAR …)` / `EXTRACT(WEEK …)` nativ so – wichtig, weil
Kalenderwochen zum Jahreswechsel sonst falsch zugeordnet werden.

### 2.5 Export ist konfigurierbar, nicht hartcodiert

„Excel mit ausgewählten Spalten" wird als **Export-Profil** modelliert: eine gespeicherte,
benannte Definition aus Spaltenliste (mit Reihenfolge, Label, Format), Filtern und
Gruppierung. So legst du einmal „Kunde ACME – monatlich" an und rufst es künftig nur noch
auf, statt jedes Mal Spalten anzuklicken.

## 3. Fachobjekte im Überblick

| Objekt | Zweck | Wesentliche Merkmale |
|---|---|---|
| **Kunde** | Abrechnungsempfänger | Reporting-Rhythmus, Rundungsregel, FinOps-Zuordnung |
| **Projekt** | Leistungskontext beim Kunden | eigener Stundensatz (historisiert), Budget, abrechenbar j/n |
| **Stundensatz** | Satz mit Gültigkeitszeitraum | `valid_from`/`valid_to`, überlappungsfrei erzwungen |
| **Tätigkeitsart** | Kategorie der Leistung | Basis für FinOps-Kategorie und Auswertung nach Art |
| **Zeiteintrag** | Kern der Erfassung | Datum, Dauer, Beschreibung, Status, Periodenbezug |
| **Reporting-Periode** | Meldeeinheit je Kunde | Woche oder Monat, Status, Sperre, Summen |
| **Export-Profil** | Spaltendefinition | Excel / CSV / FinOps |
| **Sync-Protokoll** | Nachvollziehbarkeit FinOps | Request/Response je Übertragung |

## 4. Auswertungen

Alle Auswertungen basieren auf einer angereicherten Sicht (`v_time_entries_full`), die
Kunde, Projekt, gültigen Satz und berechneten Betrag bereits enthält. Darauf setzen
vorbereitete Aggregat-Views auf:

**Zeitraster:** Woche (ISO) · Monat · Quartal · Jahr
**Dimensionen:** Kunde · Projekt · Tätigkeitsart · abrechenbar/nicht
**Kennzahlen:** erfasste Stunden · abrechenbare Stunden · Umsatz · Ø realisierter Satz ·
Auslastungsquote (abrechenbar ÷ Sollarbeitszeit) · Budgetausschöpfung je Projekt

Konkrete Fragen, die das System beantworten muss:

- Was habe ich in KW 37 für Kunde X gemacht, und was kostet das? *(Wochenreport)*
- Wie verteilt sich mein Umsatz im laufenden Jahr auf Kunden? *(Jahresauswertung)*
- Welche Projekte laufen auf ihr Budget zu? *(Budgetampel)*
- Wie hoch war meine abrechenbare Quote im Q3? *(Auslastung)*
- Welche Perioden habe ich noch nicht gemeldet? *(Offene-Perioden-Liste)*

Der letzte Punkt ist im Alltag der wichtigste – ein Dashboard-Widget „offene Perioden"
verhindert vergessene Kundenmeldungen zuverlässiger als jede Erinnerung.

## 5. Erfassungs-Ergonomie

Zeiterfassung scheitert an Reibung, nicht an fehlenden Features. Drei Wege zur Eingabe:

1. **Wochenraster** (Primärweg): Matrix Projekte × Wochentage, direkte Eingabe je Zelle,
   Zeilen aus der Vorwoche mit einem Klick übernehmbar. Das ist die Ansicht, in der 90 %
   der Erfassung passiert.
2. **Schnelleintrag:** eine Zeile – Projekt, Dauer, Text – für Nachträge zwischendurch.
3. **Timer:** Start/Stopp für laufende Tätigkeit, erzeugt beim Stoppen einen Eintrag.

Unterstützend: zuletzt genutzte Projekte oben, Textvorschläge aus früheren Einträgen des
Projekts, Tastaturbedienung ohne Maus, Warnhinweis bei Tagen ohne Erfassung.
