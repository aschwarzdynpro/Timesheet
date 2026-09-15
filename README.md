# Timesheet

Persönliche Zeiterfassung für Beratungsleistungen: Zeiten je Kunde und Projekt erfassen,
je Projekt mit eigenem Stundensatz bewerten, wochen-/monats-/jahresweise auswerten,
kundenindividuell reporten und nach Excel bzw. D365 F&O exportieren.

## Status

**Alles bis auf die FinOps-Anbindung ist umgesetzt** — Stammdaten pflegen, Zeiten und
Spesen erfassen, auswerten, nach Excel exportieren und Perioden melden. Offen ist allein
Phase 6, die eine Klärung der F&O-Zielumgebung voraussetzt.

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Schema, Migrationen, RLS, Auth, Stammdaten | **fertig** |
| 2a | Wochenraster, Schnelleintrag, Timer, Tagesliste | **fertig** |
| 2b | Reisezeit und Spesen, Beleg-Upload | **fertig** |
| 3 | Auswertungen, Arbeitszeit, Auslastung | **fertig** |
| 4 | Export-Profile, Excel | **fertig** |
| 5 | Perioden-Workflow | **fertig** |
| 6 | FinOps-Anbindung | offen |

## Einrichten

Voraussetzung: Node 22.

```bash
npm install
cp .env.example .env        # Werte siehe unten
npm run dev                 # http://localhost:5173
```

Die Anmeldung geht auf zwei Wegen: mit **E-Mail und Passwort** oder über einen
**Link per E-Mail**. Beim ersten Aufruf legst du dir mit deiner Adresse per Link ein
Konto an und setzt dir danach unter **Konto** ein Passwort — der Link bleibt daneben
gültig und ist auch der Weg zurück, falls du das Passwort vergisst.

Unter **Konto** steht außerdem die Darstellung: hell, dunkel oder wie das Gerät. Die
Wahl liegt in der Datenbank und gilt damit auf allen Geräten.

### Supabase

Das Projekt ist eingerichtet (Organisation *Black Nor White*, Region eu-west-3). Die
Werte für `.env` stehen im Dashboard unter **Project Settings → API Keys**: die Project
URL und der **publishable** Key (`sb_publishable_…`). Der `service_role` Key gehört
niemals in diese Datei — er landet sonst im Browser-Bundle und hängt RLS komplett aus.

Schemaänderungen laufen ausschließlich über neue Dateien in `supabase/migrations/`:

```bash
supabase link --project-ref <projekt-ref>
supabase db push
```

Der Zeitstempel im Dateinamen **ist** die Version: Er muss dem Eintrag in
`supabase_migrations.schema_migrations` entsprechen. Wird eine Migration an der CLI vorbei
eingespielt — etwa über das Supabase-MCP, das eigene Zeitstempel vergibt —, laufen beide
auseinander, und `db push` hält danach jede Datei für unangewendet. Das lässt sich am
bequemsten am Dateinamen geraderücken; der Inhalt einer eingespielten Migration bleibt
dabei unberührt.

Damit die Anmeldelinks funktionieren, müssen unter **Authentication → URL Configuration**
die Site URL und die Redirect URLs auf die laufende App zeigen — lokal
`http://localhost:5173`, produktiv die Vercel-Adresse.

### Vercel

`vercel.json` liegt im Repository: SPA-Rewrites, damit ein direkter Aufruf von
`/kunden` nicht ins Leere läuft, plus Cache- und Sicherheits-Header.

Beim Import in Vercel:

| Einstellung | Wert |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch | `main` |

Environment Variables (für Production, Preview und Development):
`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Nach dem ersten Deployment die
Vercel-Adresse in Supabase als Redirect-URL nachtragen.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung und Produktionsbuild |
| `npm run typecheck` | nur Typprüfung |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (Vitest) |
| `./scripts/test-db.sh` | alle Migrationen in eine frische Datenbank einspielen und die Datenbanktests laufen lassen |
| `npm run db:types` | `src/types/database.ts` aus dem verbundenen Schema erzeugen |

`scripts/test-db.sh` startet ohne gesetztes `PGHOST` eine eigene Wegwerf-Instanz unter
`/tmp` und räumt sie wieder ab. Die Tests prüfen Rundung, Satzermittlung mit
Tätigkeitsart, Überlappungsfreiheit der Satzhistorie, Periodenzuordnung inklusive
ISO-Wochen am Jahreswechsel, die Periodensperre und die RLS-Policies.

Bevor die Auslastung eine Zahl zeigt, braucht sie unter **Arbeitszeit** ein
Arbeitszeitmodell; Feiertage und Abwesenheiten gehören auf dieselbe Seite.

## Browser-Tests (Playwright)

Nach `npm ci` im Repository-Root:

```bash
npm --prefix e2e ci
npm --prefix e2e exec -- playwright install --with-deps chromium
npm --prefix e2e run typecheck
npm --prefix e2e test
```

Playwright baut die App mit festen Testwerten und startet `vite preview` auf Port
4173. Der Port muss frei sein. Es sind keine `.env`-Datei, Secrets oder Testkonten
nötig: Auth und die verwendeten Supabase-Endpunkte werden im Browser abgefangen.
`e2e/testEnvironment.ts` ist die gemeinsame Quelle für URL, Key und feste Testzeit
(01.01.2027, Europe/Berlin). Die Suite prüft den Jahres-/Wochenwechsel einschließlich
Abfragegrenzen und Datensätzen, Validierung und Speichern mit erneutem Laden sowie
Seiten-/Dialog-Overflow bei **320, 390, 768 und 1400 px**.

Alle Projekte nutzen Chromium; mobile Projekte aktivieren Touch und mobilen
Viewport ohne Safari-User-Agent. **Safari/iOS, echte Anmeldung, RLS und
Datenbankgeschäftslogik werden damit nicht geprüft.** Dafür bleiben die
Datenbanktests verpflichtend; echte Backend-E2E-Tests sind ein späterer Ausbau.
Unbekannte Supabase-Endpunkte schlagen fehl, statt plausible Testwerte zu liefern.
Mocks bilden nur die für diese Szenarien nötigen Verträge ab.

Der Workflow `E2E` läuft bei PRs gegen `main` und Pushes auf `main`. Reine
Feature-Branch-Pushes ohne PR sparen bewusst den Browserlauf. Retries sind aus;
der HTML-Report einschließlich Fehler-Traces wird in CI 14 Tage aufbewahrt.
Browserdownloads werden gecacht, Systembibliotheken auf jedem Runner installiert.

## Aufbau

```
docs/                     Fachkonzept und Architektur
e2e/                      Playwright gegen den Produktionsbuild
  tests/                  Supabase-Mocks und Browser-Szenarien
  playwright.config.ts    Chromium bei 320 / 390 / 768 / 1400 px
supabase/
  migrations/             versionierte SQL-Migrationen
  seed.sql                Beispielstammdaten
  tests/                  Schema- und RLS-Tests
scripts/test-db.sh        Testlauf gegen eine frische Datenbank
src/
  features/               Schnitt nach Fachthema, nicht nach technischer Schicht
    time-entry/ expenses/ reporting/ periods/ export/
    auth/ customers/ projects/ activity-types/ master-data/ settings/ account/
  components/ui/          schlanke Bausteine (Button, Dialog, Feld …)
  lib/                    Supabase-Client, Formatierung, Feiertagsberechnung
  types/database.ts       Typen zum Schema
```

Die Geschäftslogik liegt bewusst **in der Datenbank**: Satzermittlung, Rundung,
Periodenzuordnung und die Sperre gemeldeter Perioden sind Funktionen und Trigger.
So rechnen Oberfläche, späterer Excel-Export und FinOps-Adapter zwangsläufig gleich,
und keine dieser Regeln lässt sich durch einen direkten API-Aufruf umgehen.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [AGENTS.md](AGENTS.md) | Arbeitsregeln für alle Werkzeuge, die hier Code ändern |
| [docs/01-fachkonzept.md](docs/01-fachkonzept.md) | Fachliche Anforderungen, Kernentscheidungen, Auswertungen, Erfassung und Geräte |
| [docs/02-architektur.md](docs/02-architektur.md) | Stack, Systemüberblick, Datenmodell, Export, FinOps, Phasenplan |
| [docs/03-phase-1.md](docs/03-phase-1.md) | Was in Phase 1 entstanden ist, inklusive Abweichungen vom Konzept |
| [docs/04-phase-2a.md](docs/04-phase-2a.md) | Zeiterfassung: Wochenraster, Timer, Gegenprobe der Wochenlogik |
| [docs/05-phase-3-und-5.md](docs/05-phase-3-und-5.md) | Auswertungen, Arbeitszeit und Perioden-Freigabe |
| [docs/06-phase-4.md](docs/06-phase-4.md) | Excel-Export mit Spaltenprofilen |
| [docs/07-phase-2b.md](docs/07-phase-2b.md) | Reisezeiten, Spesen und Belege |
| [docs/08-engineering-workflow.md](docs/08-engineering-workflow.md) | Rollen, Branch-/PR-/Review-/Merge-Regeln für Menschen und Coding-Agents |
