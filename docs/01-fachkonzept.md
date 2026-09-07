# Zeiterfassung – Fachkonzept

Stand: 2026-09-06 (Rev. 3) · Status: abgestimmt · Phase 1 umgesetzt

## 1. Ziel

Eine persönliche Zeiterfassung für Beratungsleistungen: Zeiten je **Kunde** und je **Projekt**
erfassen, je Projekt mit eigenem **Stundensatz** bewerten, wochen-/monats-/jahresweise
**auswerten**, kundenindividuell **reporten** (wöchentlich oder monatlich) und als
**Excel mit frei wählbaren Spalten** exportieren. Später zusätzlich Übertragung nach
**D365 Finance & Operations (FinOps)**.

Nutzerkreis: eine Person. Das Datenmodell ist trotzdem so gebaut, dass eine spätere
Mehrbenutzer-Erweiterung kein Redesign erzwingt (siehe Architekturdokument §9).

## 2. Abgestimmte Rahmenbedingungen

| Thema | Entscheidung |
|---|---|
| Rundung | 15-Minuten-Takt als Vorgabe, **je Kunde und Projekt konfigurierbar** |
| Währung | **Nur EUR.** Mehrwährung zurückgestellt |
| Reisezeiten & Spesen | **In Phase 2** mit umgesetzt |
| Sollarbeitszeit / Auslastung | Ja – umgesetzt in Phase 3, konfigurierbar unter *Arbeitszeit* |
| Geräte | Primär Laptop; Mobil/Tablet für ausgewählte Funktionen, Umfang in Phase 2–3 |
| FinOps | Klärung der Zielumgebung zurückgestellt; Anbindung bleibt als Phase 6 geplant |

### Zur Währung

Es gibt keine Umrechnungslogik, keine Kurstabelle, keine Basiswährung und keine
währungsbezogenen Regeln in Auswertungen und Oberfläche. Beträge werden schlicht addiert.

Beibehalten wird lediglich ein Feld `currency char(3) not null default 'EUR'` an den drei
Stellen, an denen Beträge entstehen (Kunde, Stundensatz, Spese). Es kostet nichts, wird
nirgends ausgewertet und nirgends angezeigt – erspart aber, falls Mehrwährung später doch
kommt, eine Schemaänderung an den gewachsenen Tabellen. Der eigentliche Aufwand einer
späteren Einführung liegt ohnehin nicht in diesen Spalten, sondern in Kurshistorie,
Snapshot und Auswertungslogik.

## 3. Fachliche Kernentscheidungen

Diese Punkte sind die Substanz des Konzepts – sie sind später teuer zu ändern.

### 3.1 Stundensätze sind zeitabhängig, nicht statisch

Ein Stundensatz als einzelnes Feld am Projekt ist der klassische Konstruktionsfehler:
Sobald der Satz zum 01.01. steigt, ändern sich rückwirkend alle Auswertungen des Vorjahres.

**Lösung:** Tabelle `project_rates` mit `valid_from` / `valid_to` je Projekt. Der Satz eines
Zeiteintrags ergibt sich aus dem Leistungsdatum. Zusätzlich wird der Satz beim Übergang
einer Periode nach *submitted* als `rate_snapshot` in den Zeiteintrag **eingefroren** –
danach ist der gemeldete Betrag unveränderlich, egal was mit der Satzhistorie passiert.

Ein Satz kann optional an eine **Tätigkeitsart** gebunden sein (siehe §3.5). Damit ist
„Reisezeit zu 50 % des Normalsatzes" ein Datensatz, kein Sonderfall im Code.

### 3.2 Zeiteinträge sind tagesbasiert, nicht zeitpunktbasiert

`work_date` ist ein `DATE`, kein `timestamptz`. Eine Leistung am 31.03. bleibt im März –
unabhängig von Zeitzone, Sommerzeit oder Serverstandort. Uhrzeiten (`start_time`,
`end_time`) sind optional und rein dokumentarisch; abrechnungsrelevant ist immer
`duration_minutes`.

Minuten statt Dezimalstunden als Speicherformat: 20 Minuten sind als `0,3333 h` nicht
verlustfrei darstellbar, Rundungsdifferenzen summieren sich über ein Jahr sichtbar auf.
Die Anzeige in Dezimalstunden erfolgt erst in der Darstellungsschicht.

### 3.3 Erfasste Zeit ≠ abrechenbare Zeit

Drei getrennte Größen je Eintrag:

| Feld | Bedeutung |
|---|---|
| `duration_minutes` | Was tatsächlich geleistet wurde (Ist) |
| `is_billable` | Ob es dem Kunden berechnet wird |
| `billable_minutes` | Was nach Rundungsregel abgerechnet wird |

Die Rundungsregel besteht aus **Takt** (Vorgabe 15 Minuten) und **Modus** (aufrunden /
kaufmännisch / keine Rundung). Sie hängt am Kunden und ist je Projekt überschreibbar;
beides ist reine Stammdatenpflege. Ohne die Trennung von erfasster und abrechenbarer Zeit
lässt sich interne Zeit (Akquise, Weiterbildung, Verwaltung) nicht sauber mitführen – und
genau die brauchst du für eine ehrliche Auslastungsquote.

### 3.4 Reporting-Perioden sind ein eigenes Objekt mit Status

Der Reporting-Rhythmus (wöchentlich / monatlich) hängt am **Kunden**, überschreibbar je
Projekt. Bei wöchentlicher Meldung kommt der **erste Tag der Woche** hinzu: Montag oder
Sonntag, ebenfalls je Kunde. Er hängt bewusst am Kunden und nicht am Projekt — ein Kunde
meldet nicht zwei verschiedene Wochenschnitte nebeneinander. Die eigenen Auswertungen
bleiben davon unberührt und zählen weiter nach ISO-Wochen ab Montag; sie gehören dem
Nutzer, nicht dem Kunden.

Daraus entsteht pro Kunde und Zeitraum ein Datensatz `reporting_periods` mit
einem Lebenszyklus:

```
open  →  submitted  →  approved  →  invoiced
 ↑         │              │
 │         └──────────────┘
 │          Meldung zurücknehmen, mit Grund und Protokolleintrag
 │
 └─ nur in diesem Status sind Zeiteinträge und Spesen änderbar
```

Ab *submitted* sind die Belege der Periode gesperrt (DB-Trigger, nicht nur UI).
Das ist der Unterschied zwischen einer Notizapp und einer Abrechnungsgrundlage: Was du
dem Kunden gemeldet hast, darf sich nicht unbemerkt ändern.

Wochen sind **ISO-8601** (Montag–Sonntag, KW 1 = Woche mit dem ersten Donnerstag).
PostgreSQL rechnet mit `EXTRACT(ISOYEAR …)` / `EXTRACT(WEEK …)` nativ so – wichtig, weil
Kalenderwochen zum Jahreswechsel sonst falsch zugeordnet werden.

### 3.5 Reisezeiten und Spesen sind zwei verschiedene Dinge

Beides kommt in Phase 2 – aber sie werden unterschiedlich modelliert, weil sie
unterschiedlich rechnen:

**Reisezeit ist Zeit.** Sie ist ein normaler Zeiteintrag mit der Tätigkeitsart „Reisezeit".
Der abweichende Satz entsteht dadurch, dass ein `project_rates`-Eintrag optional an eine
Tätigkeitsart gebunden werden kann. Aufgelöst wird nach dem spezifischsten Treffer:
Satz für *diese* Tätigkeitsart, sonst der allgemeine Projektsatz.

**Spesen sind Beträge.** Sie haben keine Dauer und passen nicht in `time_entries`. Eigene
Tabelle `expenses` mit zwei Erfassungsarten:

| Art | Beispiel | Rechnung |
|---|---|---|
| Beleg | Hotel, Bahnticket, Bewirtung | Betrag brutto/netto direkt erfasst, Beleg als Foto oder PDF |
| Pauschale | Kilometergeld, Verpflegungspauschale | `menge × satz`, z. B. 214 km × 0,30 € |

Zusätzlich je Spese: weiterberechenbar ja/nein, optionaler Aufschlag in Prozent,
Zuordnung zu Projekt und Reporting-Periode. Spesen laufen durch denselben Perioden-,
Sperr- und Exportmechanismus wie Zeiten – sie erscheinen im Kundenreport als eigener Block.

### 3.6 Export ist konfigurierbar, nicht hartcodiert

„Excel mit ausgewählten Spalten" wird als **Export-Profil** modelliert: eine gespeicherte,
benannte Definition aus Spaltenliste (mit Reihenfolge, Label, Format), Filtern und
Gruppierung. So legst du einmal „Kunde ACME – monatlich" an und rufst es künftig nur noch
auf. Ein neues Kundenformat ist ein Datensatz, kein Release.

## 4. Fachobjekte im Überblick

| Objekt | Zweck | Wesentliche Merkmale |
|---|---|---|
| **Kunde** | Abrechnungsempfänger | Reporting-Rhythmus, Wochenbeginn, Rundungsregel, FinOps-Zuordnung |
| **Periodenprotokoll** | Was wann gemeldet und zurückgenommen wurde | mit Grund und den Summen des Augenblicks |
| **Projekt** | Leistungskontext beim Kunden | Budget, abrechenbar j/n, Überschreibungen der Kundenvorgaben |
| **Stundensatz** | Satz mit Gültigkeitszeitraum | optional je Tätigkeitsart, überlappungsfrei erzwungen |
| **Tätigkeitsart** | Kategorie der Leistung | u. a. „Reisezeit"; Basis für abweichende Sätze und FinOps-Kategorie |
| **Zeiteintrag** | Kern der Erfassung | Datum, Dauer, Beschreibung, Status, Periodenbezug |
| **Spese** | Auslage oder Pauschale | Beleg oder Menge×Satz, weiterberechenbar, Beleganhang |
| **Reporting-Periode** | Meldeeinheit je Kunde | Woche oder Monat, Status, Sperre, Summen |
| **Arbeitszeitmodell** | Sollstunden je Wochentag | historisiert, Basis der Auslastung |
| **Abwesenheit** | Urlaub, Krankheit, Feiertag | reduziert die Sollzeit |
| **Export-Profil** | Spaltendefinition | Excel / CSV / FinOps |

## 5. Auswertungen

Alle Auswertungen basieren auf einer angereicherten Sicht (`v_time_entries_full`), die
Kunde, Projekt, gültigen Satz und Betrag bereits enthält. Darauf setzen vorbereitete
Aggregat-Views auf.

**Zeitraster:** Woche (ISO) · Monat · Quartal · Jahr
**Dimensionen:** Kunde · Projekt · Tätigkeitsart · abrechenbar/nicht
**Kennzahlen:** erfasste Stunden · abrechenbare Stunden · Umsatz · Ø realisierter Satz ·
Auslastungsquote · Budgetausschöpfung je Projekt · weiterberechenbare und nicht
weiterberechenbare Spesen

Konkrete Fragen, die das System beantworten muss:

- Was habe ich in KW 37 für Kunde X geleistet, was kostet das, welche Spesen fallen an?
- Wie verteilt sich mein Jahresumsatz auf Kunden?
- Welche Projekte laufen auf ihr Budget zu?
- Wie hoch war meine abrechenbare Quote im Q3?
- Verdiene ich an diesem Projekt wirklich meinen Satz? *(Ø realisierter Satz = Umsatz ÷
  erfasste Stunden – die Kennzahl, die stillschweigend unrentable Projekte sichtbar macht)*
- Was bleibt an Spesen bei mir hängen?
- Welche Perioden habe ich noch nicht gemeldet?

Der letzte Punkt ist im Alltag der wichtigste – ein Dashboard-Feld „offene Perioden"
verhindert vergessene Kundenmeldungen zuverlässiger als jede Erinnerung.

### 5.1 Auslastung und Sollarbeitszeit

Die Auslastungsquote setzt abrechenbare Stunden ins Verhältnis zur Sollarbeitszeit. Dafür:

- **Arbeitszeitmodell** mit Sollstunden je Wochentag, historisiert (`valid_from`/`valid_to`),
  damit ein Wechsel von 5 auf 4 Tage die Vorjahreswerte nicht verfälscht.
- **Abwesenheiten** (Urlaub, Krankheit, Weiterbildung) reduzieren die Sollzeit.
- **Feiertage** als eigene Tabelle, weil sie bundeslandabhängig sind.

Ausgestaltung in Phase 3 zu klären – siehe §7.

## 6. Erfassung und Geräte

Zeiterfassung scheitert an Reibung, nicht an fehlenden Features.

### 6.1 Laptop – der Hauptweg

1. **Wochenraster** (Primärweg): Matrix Projekte × Wochentage, direkte Eingabe je Zelle,
   Zeilen aus der Vorwoche mit einem Klick übernehmbar, vollständig per Tastatur bedienbar.
   Hier passieren rund 90 % der Erfassung.
2. **Schnelleintrag:** eine Zeile – Projekt, Dauer, Text – für Nachträge zwischendurch.
3. **Timer:** Start/Stopp für die laufende Tätigkeit, erzeugt beim Stoppen einen Eintrag.

Unterstützend: zuletzt genutzte Projekte oben, Textvorschläge aus früheren Einträgen des
Projekts, Warnhinweis bei Tagen ohne Erfassung.

### 6.2 Mobil und Tablet – bewusst reduziert

Eine Codebasis, responsiv, als PWA installierbar – **keine zweite App**. Das Wochenraster
braucht Breite und bleibt dem Laptop vorbehalten; mobil erscheint stattdessen eine
Tagesliste.

Sinnvoller mobiler Funktionsumfang (Feinschnitt in Phase 2–3):

| Funktion | Warum unterwegs |
|---|---|
| Timer starten/stoppen | Der Moment, in dem die Tätigkeit beginnt, ist selten am Schreibtisch |
| Schnelleintrag | Nacherfassung direkt nach dem Termin, solange es präsent ist |
| Tagesliste ansehen/korrigieren | Kontrolle am Abend |
| **Spesenbeleg fotografieren** | Der überzeugendste mobile Anwendungsfall überhaupt – der Beleg ist genau dann in der Hand |
| Offene Perioden einsehen | Statuskontrolle unterwegs |

Nicht mobil: Wochenraster, Stammdatenpflege, Export, Periodenfreigabe, Auswertungen in
voller Tiefe. Ein Service Worker puffert Erfassungen bei fehlender Verbindung.

## 7. Zu klärende Punkte

| # | Thema | Fällig |
|---|---|---|
| 1 | **Spesenarten:** welche Pauschalen mit welchen Sätzen (Kilometergeld, Verpflegung)? Brutto/netto mit Vorsteuerausweis nötig? | Phase 2b |
| 2 | **Mobiler Funktionsumfang:** Bestätigung der Liste aus §6.2 | Phase 2 |
| 3 | ~~**Arbeitszeitmodell:** Wochenstunden, Verteilung, Bundesland, Urlaubspflege~~ — beantwortet: alles drei wird unter *Arbeitszeit* gepflegt, Urlaub in der App. Offen ist nur noch das Eintragen der eigenen Werte. | erledigt (Phase 3) |
| 4 | **F&O-Zielumgebung:** Version, Project Operations ja/nein, Datenentitäten, App-Registrierung | zurückgestellt |
