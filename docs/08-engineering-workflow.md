# Engineering Workflow für Menschen und Coding-Agents

Dieses Dokument ergänzt `AGENTS.md` und `docs/02-architektur.md`. Es beschreibt nicht die Fach- oder Systemarchitektur, sondern den verbindlichen Arbeitsablauf für Menschen, Codex, Claude und andere Coding-Agents.

## Ziel

GitHub ist die gemeinsame Quelle der Wahrheit. Anforderungen, Branches, Pull Requests, CI-Ergebnisse und Reviews bilden den nachvollziehbaren Zustand einer Änderung. Chat-Verläufe oder agentenspezifische Erinnerungen gelten nicht als Projektzustand.

## Rollen

### Tech Lead / Planner

Aufgaben:
- Requirement und bestehenden Code verstehen
- Architekturfolgen prüfen
- kleine, unabhängig umsetzbare Issues schneiden
- Acceptance Criteria und Testfälle formulieren

Der Planner ändert für Planungsaufgaben keinen Produktionscode.

### Implementierungs-Agent

Aufgaben:
- genau ein klar abgegrenztes Issue umsetzen
- bestehende Patterns aus `AGENTS.md` und `docs/02-architektur.md` befolgen
- nur notwendige Dateien ändern
- Tests ergänzen oder anpassen
- einen Pull Request gegen `main` erstellen

### Review-Agent

Der Review-Agent ist nach Möglichkeit ein anderes Modell als der Implementierungs-Agent. Er prüft insbesondere:
- Korrektheit und Regressionen
- unnötige Komplexität
- TypeScript- und React-State-Probleme
- TanStack-Query Cache-/Invalidierungsfehler
- Supabase-/RLS-/Security-Annahmen
- Mobile UX und Accessibility
- fehlende Tests

Der Reviewer schreibt nicht ungefragt große Teile des PR neu.

## Git-Regeln

- `main` ist der Integrations- und Release-Branch.
- Keine direkte Feature-Entwicklung auf `main`.
- Jeder nicht triviale Change bekommt einen eigenen Branch und Pull Request.
- Branches werden immer von einem aktuellen `main` erstellt.
- Ein Agent merged seinen eigenen PR nicht selbst.
- Ein PR muss grünes CI haben, bevor er gemerged wird.

Wenn der Branch-Name frei wählbar ist, gilt dieses empfohlene Schema:

```text
codex/<issue>-<kurzbeschreibung>
claude/<issue>-<kurzbeschreibung>
fix/<issue>-<kurzbeschreibung>
chore/<kurzbeschreibung>
```

Automatisch erzeugte Branch-Namen von Agent-Plattformen sind ausdrücklich zulässig, wenn das Werkzeug keinen frei wählbaren Namen anbietet.

## Issue-Schnitt

Ein gutes Implementierungs-Issue enthält:
- Problem / Nutzerziel
- Scope
- explizit nicht im Scope
- Acceptance Criteria
- relevante Architekturhinweise
- erwartete Tests

Issues sollen so geschnitten sein, dass ein Agent sie in einem eigenen Branch umsetzen kann, ohne parallele Änderungen am selben Codebereich zu benötigen.

## Pflichtprüfungen vor einem PR

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
./scripts/test-db.sh
npm --prefix e2e ci
npm --prefix e2e exec -- playwright install --with-deps chromium
npm --prefix e2e run typecheck
npm --prefix e2e test
```

Die Datenbanktests laufen wie in `AGENTS.md` und CI bei jedem PR; lokale Aussagen wie „sollte funktionieren“ ersetzen diese Checks nicht.

Der zusätzliche Workflow `E2E` prüft den Produktionsbuild mit Playwright in
Chromium bei 320, 390, 768 und 1400 px. Er läuft bei PRs gegen `main` und Pushes
auf `main`; Feature-Branches ohne PR sparen bewusst diesen Browserlauf.
Browserinstallation und Mock-Grenzen sind im README unter „Browser-Tests“
dokumentiert. Für den Merge müssen **CI und E2E** auf dem aktuellen PR-Stand grün sein.

## Pull Requests

Jeder PR beschreibt mindestens:
- welches Problem gelöst wird
- was konkret geändert wurde
- welche Bereiche bewusst nicht geändert wurden
- welche Tests ausgeführt wurden
- bekannte Risiken / offene Punkte

Bei sichtbaren UI-Änderungen gehören außerdem Screenshots oder ein Preview-Link in den PR. Für neue Ansichten gelten die Viewports aus `AGENTS.md`: 320, 390, 768 und 1400 px.

## Review-Regeln

Ein Review soll konkrete, reproduzierbare Findings liefern und zwischen folgenden Kategorien unterscheiden:
- Blocker: Merge darf so nicht erfolgen
- Wichtig: sollte vor Merge behoben werden
- Verbesserung: nicht zwingend für diesen PR

Keine erfundenen Fehler. Unsichere Punkte werden als Hypothese markiert und mit einem konkreten Verifikationsschritt versehen.

## Merge-Regel

Merge nach `main` nur wenn:
- Scope und Acceptance Criteria erfüllt sind
- CI grün ist
- relevante Review-Findings erledigt sind
- bei UI-Änderungen eine visuelle Prüfung erfolgt ist
- die Datenbanktests erfolgreich sind

Bevorzugte Merge-Strategie: Squash Merge für Feature- und Fix-Branches, damit `main` eine kompakte Historie behält. Diese Präferenz soll zusätzlich in den Repository-Einstellungen abgebildet werden, sobald die Governance technisch erzwungen wird.

## Agent-Handoff

Wenn ein Agent die Arbeit an einen anderen Agent übergibt, hinterlässt er den Status im GitHub-Issue oder PR und nicht nur im Chat. Der Handoff enthält:
- erledigt
- offen
- relevante Dateien
- ausgeführte Tests
- bekannte Risiken

## Sicherheitsregeln

- Keine Secrets, Tokens oder Service-Role Keys in Code, Issues, PR-Beschreibungen oder Logs.
- Keine produktiven Datenbankmigrationen oder irreversible Datenoperationen allein aufgrund eines Agent-Vorschlags ausführen.
- Für alle abstimmungspflichtigen Produkt- und Architekturentscheidungen gilt ausschließlich der Abschnitt „Was Absprache braucht“ in `AGENTS.md`; diese Regeln werden hier bewusst nicht dupliziert.

## Verantwortlichkeit

Die Agenten dürfen vorbereiten, implementieren und reviewen. Die finale Produktentscheidung und der Merge in `main` bleiben bei einem Menschen, solange nicht später explizit ein anderer Governance-Prozess eingeführt wird.
