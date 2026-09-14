# Engineering Workflow fuer Menschen und Coding-Agents

Dieses Dokument ergaenzt `AGENTS.md` und `docs/02-architektur.md`. Es beschreibt nicht die Fach- oder Systemarchitektur, sondern den verbindlichen Arbeitsablauf fuer Menschen, Codex, Claude und andere Coding-Agents.

## Ziel

GitHub ist die gemeinsame Quelle der Wahrheit. Anforderungen, Branches, Pull Requests, CI-Ergebnisse und Reviews bilden den nachvollziehbaren Zustand einer Aenderung. Chat-Verlaeufe oder agentenspezifische Erinnerungen gelten nicht als Projektzustand.

## Rollen

### Tech Lead / Planner

Aufgaben:
- Requirement und bestehenden Code verstehen
- Architekturfolgen pruefen
- kleine, unabhaengig umsetzbare Issues schneiden
- Acceptance Criteria und Testfaelle formulieren

Der Planner aendert fuer Planungsaufgaben keinen Produktionscode.

### Implementierungs-Agent

Aufgaben:
- genau ein klar abgegrenztes Issue umsetzen
- bestehende Patterns aus `AGENTS.md` und `docs/02-architektur.md` befolgen
- nur notwendige Dateien aendern
- Tests ergaenzen oder anpassen
- einen Pull Request gegen `main` erstellen

### Review-Agent

Der Review-Agent ist nach Moeglichkeit ein anderes Modell als der Implementierungs-Agent. Er prueft insbesondere:
- Korrektheit und Regressionen
- unnoetige Komplexitaet
- TypeScript- und React-State-Probleme
- TanStack-Query Cache-/Invalidierungsfehler
- Supabase-/RLS-/Security-Annahmen
- Mobile UX und Accessibility
- fehlende Tests

Der Reviewer schreibt nicht ungefragt grosse Teile des PR neu.

## Git-Regeln

- `main` ist der Integrations- und Release-Branch.
- Keine direkte Feature-Entwicklung auf `main`.
- Jeder nicht triviale Change bekommt einen eigenen Branch und Pull Request.
- Branches werden immer von einem aktuellen `main` erstellt.
- Ein Agent merged seinen eigenen PR nicht selbst.
- Ein PR muss gruenes CI haben, bevor er gemerged wird.

Empfohlene Branch-Namen:

```text
codex/<issue>-<kurzbeschreibung>
claude/<issue>-<kurzbeschreibung>
fix/<issue>-<kurzbeschreibung>
chore/<kurzbeschreibung>
```

Beispiele:

```text
codex/42-mobile-validation
claude/51-reporting-refactor
fix/63-week-switch-cache
```

## Issue-Schnitt

Ein gutes Implementierungs-Issue enthaelt:
- Problem / Nutzerziel
- Scope
- explizit nicht im Scope
- Acceptance Criteria
- relevante Architekturhinweise
- erwartete Tests

Issues sollen so geschnitten sein, dass ein Agent sie in einem eigenen Branch umsetzen kann, ohne parallele Aenderungen am selben Codebereich zu benoetigen.

## Pflichtpruefungen vor einem PR

Frontend:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Datenbank, sobald SQL, Schema, RLS, Views, Trigger oder DB-Vertraege betroffen sind:

```bash
./scripts/test-db.sh
```

Lokale Aussagen wie "sollte funktionieren" ersetzen diese Checks nicht.

## Pull Requests

Jeder PR beschreibt mindestens:
- welches Problem geloest wird
- was konkret geaendert wurde
- welche Bereiche bewusst nicht geaendert wurden
- welche Tests ausgefuehrt wurden
- bekannte Risiken / offene Punkte

Bei sichtbaren UI-Aenderungen gehoeren ausserdem Screenshots oder ein Preview-Link in den PR. Mobile Aenderungen werden mindestens auf 320 px und 390 px Breite geprueft; fuer neue Ansichten gelten weiterhin die Viewports aus `AGENTS.md`.

## Review-Regeln

Ein Review soll konkrete, reproduzierbare Findings liefern und zwischen folgenden Kategorien unterscheiden:
- Blocker: Merge darf so nicht erfolgen
- Wichtig: sollte vor Merge behoben werden
- Verbesserung: nicht zwingend fuer diesen PR

Keine erfundenen Fehler. Unsichere Punkte werden als Hypothese markiert und mit einem konkreten Verifikationsschritt versehen.

## Merge-Regel

Merge nach `main` nur wenn:
- Scope und Acceptance Criteria erfuellt sind
- CI gruen ist
- relevante Review-Findings erledigt sind
- bei UI-Aenderungen eine visuelle Pruefung erfolgt ist
- bei DB-Aenderungen die Datenbanktests erfolgreich sind

Bevorzugte Merge-Strategie: Squash Merge fuer Feature- und Fix-Branches, damit `main` eine kompakte Historie behaelt.

## Agent-Handoff

Wenn ein Agent die Arbeit an einen anderen Agent uebergibt, hinterlaesst er den Status im GitHub-Issue oder PR und nicht nur im Chat. Der Handoff enthaelt:
- erledigt
- offen
- relevante Dateien
- ausgefuehrte Tests
- bekannte Risiken

## Sicherheitsregeln

- Keine Secrets, Tokens oder Service-Role Keys in Code, Issues, PR-Beschreibungen oder Logs.
- Keine produktiven Datenbankmigrationen oder irreversible Datenoperationen allein aufgrund eines Agent-Vorschlags ausfuehren.
- Neue Dependencies, Navigationsaenderungen, Designsystem-Aenderungen und FinOps-Themen bleiben gemaess `AGENTS.md` abstimmungspflichtig.

## Verantwortlichkeit

Die Agenten duerfen vorbereiten, implementieren und reviewen. Die finale Produktentscheidung und der Merge in `main` bleiben bei einem Menschen, solange nicht spaeter explizit ein anderer Governance-Prozess eingefuehrt wird.
