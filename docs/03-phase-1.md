# Phase 1 – Fundament: Umsetzungsbericht

Stand: 2026-09-06

## Was entstanden ist

### Datenbank

Vierzehn Tabellen, sieben Funktionen, sechs Trigger und fünf Views in sieben
versionierten Migrationen unter `supabase/migrations/`. Das Schema ist vollständig –
also auch die Tabellen für Zeiten, Spesen und Perioden, die erst ab Phase 2 befüllt
werden. Ein halbes Schema wäre schlechter: Fremdschlüssel, Funktionen und Trigger
hängen zusammen und lassen sich nicht sinnvoll in Etappen anlegen.

| Migration | Inhalt |
|---|---|
| `…_extensions.sql` | `btree_gist` – Voraussetzung für die Überlappungsprüfung |
| `…_core_tables.sql` | Stammdaten, Sätze, Zeiten, Spesen, Perioden, Arbeitszeit, Protokoll |
| `…_functions.sql` | Satzermittlung, Rundung, Periodengrenzen, Sollzeit, Periodenfreigabe |
| `…_triggers.sql` | Periodenzuordnung, Rundung beim Speichern, Sperre, Schutz der Satzhistorie |
| `…_views.sql` | angereicherte Sichten und Wochen-/Monats-/Jahresaggregate |
| `…_rls.sql` | Row Level Security auf allen Tabellen |
| `…_storage.sql` | privater Bucket für Spesenbelege (wird ab Phase 2b befüllt) |

Bemerkenswerte Stellen:

- **Überlappungsfreiheit der Satzhistorie** erzwingt die Datenbank selbst, über ein
  `EXCLUDE`-Constraint auf `daterange`. Weil eine Tätigkeitsart optional ist und `NULL`
  in solchen Constraints nie kollidiert, wird sie über `coalesce` auf eine Null-UUID
  abgebildet – sonst ließen sich beliebig viele allgemeine Sätze für denselben Zeitraum
  anlegen.
- **Die Periodensperre sitzt im Trigger**, nicht im Formular, und prüft bei einer
  Änderung sowohl die alte als auch die neue Periode. Ohne den ersten Teil ließe sich ein
  Eintrag aus einer gemeldeten Periode herausdatieren.
- **Views laufen mit `security_invoker = true`.** Ohne das würden sie mit den Rechten
  ihres Eigentümers ausgeführt und die RLS der Basistabellen aushebeln – aus einer
  Schutzmaßnahme würde ein Loch.
- **Ein nicht abrechenbares Projekt erzwingt nicht abrechenbare Zeit.** Sonst könnte ein
  Eintrag auf dem Projekt „Intern“ stillschweigend Umsatz erzeugen.

### Tests

`./scripts/test-db.sh` spielt alle Migrationen in eine frische Datenbank ein und prüft
40 Zusicherungen – gegen ein echtes PostgreSQL, nicht gegen eine Nachbildung:

Rundung in allen drei Modi · Satzermittlung mit Historie und Tätigkeitsart · Ablehnung
überlappender Sätze · Periodenzuordnung monatlich und wöchentlich · ISO-Wochen am
Jahreswechsel (der 01.01.2027 gehört in die KW 53 des ISO-Jahres 2026) · Bewertung in der
Auswertungssicht · Periodenfreigabe mit Satz-Snapshot · Sperre gegen Ändern, Löschen und
Nachtragen · Schutz der Satzhistorie · Sollarbeitszeit mit Abwesenheit · RLS aus Sicht
eines fremden Benutzers.

Dazu Unit-Tests der Anzeigeformate (`npm test`) und eine CI, die beides bei jedem Push
ausführt.

### Oberfläche

React 19 mit TypeScript, TanStack Router und Query, Tailwind 4. Anmeldung per Magic Link.
Vier Seiten:

- **Übersicht** – Zählungen und eine Einrichtungsreihenfolge für den ersten Start
- **Kunden** – Rhythmus, Rundungstakt und -modus, Rechnungsadresse
- **Projekte** – je Zeile aufklappbar; im aufgeklappten Bereich liegt die **Satzhistorie**
  mit Kennzeichnung des aktuell gültigen Satzes. Vererbte Werte werden als solche
  ausgewiesen („monatlich (vom Kunden)“).
- **Tätigkeitsarten** – Grundlage der abweichenden Sätze

Datenbankfehler werden übersetzt, statt roh durchgereicht: Ein verletztes
`EXCLUDE`-Constraint erscheint als „Für diesen Zeitraum gibt es bereits einen Satz.
Beende den bestehenden Satz zuerst.“

## Abweichungen vom Konzept

| Konzept | Umsetzung | Grund |
|---|---|---|
| shadcn/ui | handgeschriebene Bausteine in `src/components/ui/` | Kein Generatorlauf nötig, das Repo bleibt selbsttragend. shadcn-Komponenten lassen sich jederzeit danebenlegen – dieselbe Tailwind-Grundlage. |
| `supabase gen types` | `src/types/database.ts` von Hand | Die Erzeugung braucht eine verbundene Datenbank. Sobald ein Projekt verbunden ist, ersetzt `npm run db:types` die Datei. |
| Storage erst in Phase 2b | Bucket bereits angelegt | Fünfzehn Zeilen, die zum Fundament gehören und Phase 2b nicht blockieren sollen. |

Zusätzlich zum Konzept entstanden, weil beim Bauen offensichtlich wurde, dass sie fehlen:

- **`trg_project_rate_guard`** – ein Stundensatz lässt sich nicht mehr ändern oder
  löschen, sobald er gemeldeten Zeiten zugrunde liegt. Der Snapshot schützt den
  gemeldeten Betrag; dieser Trigger schützt zusätzlich die Historie selbst vor stillen
  Änderungen.
- **`v_project_current_rate`** – aktueller Satz je Projekt, damit die Oberfläche nicht
  selbst durch die Historie laufen muss.

## Was Phase 1 nicht kann

Zeiten erfassen. Das ist Phase 2a und der Punkt, ab dem die App im Alltag trägt.
Ebenfalls offen: Spesen (2b), Auswertungsoberfläche (3), Export (4),
Perioden-Workflow in der Oberfläche (5) und FinOps (6).

`fn_submit_period()` existiert bereits und ist getestet, hat aber noch keine
Schaltfläche – die kommt in Phase 5.

## Nächster Schritt

Phase 2a: Wochenraster als Matrix Projekte × Wochentage, Schnelleintrag, Timer.
Die Datenbank ist darauf vorbereitet – Rundung und Periodenzuordnung passieren beim
Speichern von selbst, die Oberfläche muss sie nicht kennen.
