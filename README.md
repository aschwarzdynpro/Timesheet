# Timesheet

Persönliche Zeiterfassung für Beratungsleistungen: Zeiten je Kunde und Projekt erfassen,
je Projekt mit eigenem Stundensatz bewerten, wochen-/monats-/jahresweise auswerten,
kundenindividuell reporten und nach Excel bzw. D365 F&O exportieren.

## Status

**Phasen 1, 2a, 3, 4 und 5 sind umgesetzt** — Stammdaten pflegen, Zeiten erfassen,
auswerten, nach Excel exportieren und Perioden melden. Offen sind Spesen (2b) und die
FinOps-Anbindung (6).

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Schema, Migrationen, RLS, Auth, Stammdaten | **fertig** |
| 2a | Wochenraster, Timer, Tagesliste | **fertig** |
| 2b | Reisezeit und Spesen, Beleg-Upload | offen |
| 3 | Auswertungen, Auslastung | **fertig** |
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

Die Anmeldung läuft über einen Link per E-Mail. Beim ersten Aufruf legst du dir mit
deiner E-Mail-Adresse ein Konto an; ein weiterer Schritt ist nicht nötig.

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

## Aufbau

```
docs/                     Fachkonzept und Architektur
supabase/
  migrations/             versionierte SQL-Migrationen
  seed.sql                Beispielstammdaten
  tests/                  Schema- und RLS-Tests
scripts/test-db.sh        Testlauf gegen eine frische Datenbank
src/
  features/               Schnitt nach Fachthema, nicht nach technischer Schicht
    time-entry/ reporting/ periods/ export/
    auth/ customers/ projects/ activity-types/ overview/
  components/ui/          schlanke Bausteine (Button, Dialog, Feld …)
  lib/                    Supabase-Client, Formatierung
  types/database.ts       Typen zum Schema
```

Die Geschäftslogik liegt bewusst **in der Datenbank**: Satzermittlung, Rundung,
Periodenzuordnung und die Sperre gemeldeter Perioden sind Funktionen und Trigger.
So rechnen Oberfläche, späterer Excel-Export und FinOps-Adapter zwangsläufig gleich,
und keine dieser Regeln lässt sich durch einen direkten API-Aufruf umgehen.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/01-fachkonzept.md](docs/01-fachkonzept.md) | Fachliche Anforderungen, Kernentscheidungen, Auswertungen, Erfassung und Geräte |
| [docs/02-architektur.md](docs/02-architektur.md) | Stack, Systemüberblick, Datenmodell, Export, FinOps, Phasenplan |
| [docs/03-phase-1.md](docs/03-phase-1.md) | Was in Phase 1 entstanden ist, inklusive Abweichungen vom Konzept |
| [docs/04-phase-2a.md](docs/04-phase-2a.md) | Zeiterfassung: Wochenraster, Timer, Gegenprobe der Wochenlogik |
| [docs/05-phase-3-und-5.md](docs/05-phase-3-und-5.md) | Auswertungen und Perioden-Freigabe |
| [docs/06-phase-4.md](docs/06-phase-4.md) | Excel-Export mit Spaltenprofilen |
