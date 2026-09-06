# Zeiterfassung – Architekturvorschlag

Stand: 2026-09-06 · Status: Entwurf zur Abstimmung

## 1. Technologie-Stack

| Schicht | Wahl | Begründung |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite | Bekanntes Terrain, schnelle Builds, große Komponentenauswahl |
| Routing/State | TanStack Router + TanStack Query | Serverstate-Caching statt Redux-Boilerplate; passt zu einer datengetriebenen App |
| UI | Tailwind CSS + shadcn/ui | Kein Design-System-Ballast, Komponenten liegen im Repo und sind anpassbar |
| Charts | Recharts | Ausreichend für Balken/Linien/Stapel, geringe Einstiegshürde |
| Datenbank | PostgreSQL 16 (Supabase) | Fensterfunktionen, `daterange`+GIST, `generate_series` – die Reporting-Logik gehört in die DB |
| API | PostgREST (Supabase Auto-API) | Kein handgeschriebenes CRUD-Backend für eine Single-User-App |
| Auth | Supabase Auth (E-Mail + Magic Link) | Ein Konto, aber sauberes Session-Handling und RLS-Grundlage |
| Serverlogik | Supabase Edge Functions (Deno) | Für FinOps-Sync: Secrets dürfen nicht ins Frontend |
| Excel | SheetJS (`xlsx`) clientseitig | Bei deinen Datenmengen (< 10 k Zeilen/Jahr) reicht der Browser |
| Hosting | Vercel oder Netlify (Static) | Kostenlos, Preview-Deployments je Branch |
| CI | GitHub Actions | Lint, Typecheck, Tests, Migrations-Check |

### Warum nicht anders

**Warum kein eigenes Node/.NET-Backend?** Für eine Single-User-App wäre eine zusätzliche
API-Schicht reines CRUD-Durchreichen. PostgREST liefert das generiert; die Geschäftslogik,
die wirklich Substanz hat (Satzermittlung, Rundung, Periodenzuordnung, Sperren), gehört
ohnehin in die Datenbank, wo sie nicht umgangen werden kann. Kommt später doch ein
Backend, sitzt es vor derselben DB – kein Wegwurf.

**Warum Supabase und nicht nur „Postgres irgendwo"?** Auth, Auto-API, Edge Functions,
Backups und Migrations-CLI in einem Paket. Der Lock-in ist gering: Unten liegt normales
PostgreSQL, das Schema ist in SQL-Migrationen versioniert und jederzeit per `pg_dump`
umziehbar. Alternative bei Bedarf: eigener Postgres + Drizzle/Prisma + Hono-API.

**Warum Logik in der DB statt im Frontend?** Weil Excel-Export, FinOps-Sync und UI
identisch rechnen müssen. Eine Rundungsregel, die dreimal implementiert ist, ist dreimal
unterschiedlich implementiert.

## 2. Systemüberblick

```
┌──────────────────────────────────────────────────────────────┐
│  Browser – React SPA (PWA-fähig)                             │
│                                                              │
│  Wochenraster │ Auswertungen │ Stammdaten │ Perioden │ Export │
│                                                              │
│  TanStack Query  ·  SheetJS (Excel-Erzeugung im Client)      │
└───────────────┬────────────────────────────┬─────────────────┘
                │ HTTPS + JWT                │ HTTPS + JWT
                ▼                            ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│ PostgREST (Auto-API)      │   │ Edge Functions (Deno)        │
│ Tabellen, Views, RPC      │   │  · finops-sync               │
└───────────────┬───────────┘   │  · finops-status             │
                │               │  · scheduled-period-close    │
                │               └──────────────┬───────────────┘
                ▼                              │
┌───────────────────────────────────────────┐  │  OAuth2
│ PostgreSQL                                │  │  (Client Credentials)
│                                           │  ▼
│  Stammdaten · Zeiteinträge · Perioden     │ ┌──────────────────────┐
│  Views für Auswertungen                   │ │ D365 F&O             │
│  Funktionen: Satz, Rundung, Periode       │ │ Timesheet-Entities   │
│  Trigger: Periodensperre, Snapshot        │ │ (OData)              │
│  RLS: owner_id = auth.uid()               │ └──────────────────────┘
└───────────────────────────────────────────┘
```

Die FinOps-Anbindung ist bewusst **einseitig ausgelagert**: Sie ist der einzige Teil, der
Secrets braucht, externe Verfügbarkeit voraussetzt und fehlschlagen kann. Sie darf den
Rest der App nicht mitreißen.

## 3. Datenmodell

### 3.1 Entitäten und Beziehungen

```
customers ──1:n──> projects ──1:n──> project_rates
    │                  │
    │                  └──1:n──> time_entries <──n:1── activity_types
    │                                  │
    └──1:n──> reporting_periods <──────┘

export_profiles          finops_sync_log ──n:1──> time_entries
holidays / app_settings
```

### 3.2 Tabellen (Auszug, DDL-nah)

```sql
create table customers (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid(),
  code                  text not null,              -- "ACME"
  name                  text not null,
  reporting_cycle       text not null default 'monthly'
                          check (reporting_cycle in ('weekly','monthly')),
  rounding_minutes      int  not null default 15,
  rounding_mode         text not null default 'up'
                          check (rounding_mode in ('up','nearest','none')),
  finops_legal_entity   text,          -- DataAreaId, NULL = keine FinOps-Anbindung
  finops_customer_id    text,
  invoice_email         text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (owner_id, code)
);

create table projects (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers on delete restrict,
  code                  text not null,
  name                  text not null,
  status                text not null default 'active'
                          check (status in ('active','paused','closed')),
  is_billable           boolean not null default true,
  start_date            date,
  end_date              date,
  budget_hours          numeric(10,2),
  budget_amount         numeric(12,2),
  rounding_minutes      int,           -- NULL = vom Kunden erben
  reporting_cycle       text,          -- NULL = vom Kunden erben
  finops_project_id     text,          -- ProjId
  finops_activity_number text,
  created_at            timestamptz not null default now(),
  unique (customer_id, code)
);

-- Stundensatz-Historie, überlappungsfrei erzwungen
create table project_rates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects on delete cascade,
  hourly_rate  numeric(10,2) not null check (hourly_rate >= 0),
  currency     char(3) not null default 'EUR',
  valid_from   date not null,
  valid_to     date,                    -- NULL = offen
  note         text,
  constraint rate_period_valid check (valid_to is null or valid_to >= valid_from),
  exclude using gist (
    project_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create table time_entries (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid(),
  project_id         uuid not null references projects on delete restrict,
  work_date          date not null,
  start_time         time,                       -- optional, dokumentarisch
  end_time           time,
  duration_minutes   int  not null check (duration_minutes > 0),
  billable_minutes   int  not null check (billable_minutes >= 0),
  is_billable        boolean not null default true,
  activity_type_id   uuid references activity_types,
  description        text not null check (length(btrim(description)) > 0),
  rate_snapshot      numeric(10,2),              -- gesetzt bei Periodenfreigabe
  currency_snapshot  char(3),
  period_id          uuid references reporting_periods,
  status             text not null default 'draft'
                       check (status in ('draft','submitted','invoiced')),
  finops_sync_status text not null default 'none'
                       check (finops_sync_status in ('none','pending','synced','error')),
  finops_entry_id    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on time_entries (owner_id, work_date desc);
create index on time_entries (project_id, work_date);
create index on time_entries (period_id) where period_id is not null;

create table reporting_periods (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers on delete cascade,
  cycle         text not null check (cycle in ('weekly','monthly')),
  period_start  date not null,
  period_end    date not null,
  status        text not null default 'open'
                  check (status in ('open','submitted','approved','invoiced')),
  submitted_at  timestamptz,
  total_minutes int,
  total_amount  numeric(12,2),
  unique (customer_id, cycle, period_start)
);

create table export_profiles (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  target     text not null check (target in ('excel','csv','finops')),
  columns    jsonb not null,   -- [{key, label, format, width}, …] – Reihenfolge = Array
  filters    jsonb not null default '{}',
  group_by   jsonb not null default '[]',
  is_default boolean not null default false
);
```

Ergänzend: `activity_types`, `holidays` (für Sollarbeitszeit/Auslastung),
`app_settings`, `finops_sync_log`, `export_runs`.

### 3.3 Funktionen und Trigger

| Objekt | Aufgabe |
|---|---|
| `fn_rate_for(project_id, on_date)` | Gültigen Satz zum Leistungsdatum liefern |
| `fn_effective_rounding(project_id)` | Rundungsregel mit Kundenvererbung auflösen |
| `fn_round_minutes(minutes, incr, mode)` | Abrechenbare Minuten berechnen |
| `fn_ensure_period(customer_id, work_date)` | Periode finden oder anlegen, ID zurückgeben |
| `trg_assign_period` (BEFORE INS/UPD) | `period_id` und `billable_minutes` setzen |
| `trg_lock_closed_period` (BEFORE INS/UPD/DEL) | Änderung ablehnen, wenn Periode ≠ `open` |
| `fn_submit_period(period_id)` | Sätze einfrieren, Summen schreiben, Status setzen |

Die Sperre als **Trigger** statt als UI-Prüfung ist bewusst gewählt: Auch ein direkter
API-Aufruf, ein Import oder ein SQL-Konsolenzugriff darf gemeldete Perioden nicht ändern.

### 3.4 Views für Auswertungen

```sql
create view v_time_entries_full as
select
  t.*,
  p.name  as project_name,  p.code as project_code,
  c.id    as customer_id,   c.name as customer_name, c.code as customer_code,
  coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.work_date)) as rate,
  round(t.billable_minutes / 60.0
        * coalesce(t.rate_snapshot, fn_rate_for(t.project_id, t.work_date)), 2) as amount,
  extract(isoyear from t.work_date)::int as iso_year,
  extract(week    from t.work_date)::int as iso_week,
  date_trunc('week',  t.work_date)::date as week_start,
  date_trunc('month', t.work_date)::date as month_start,
  extract(year    from t.work_date)::int as year
from time_entries t
join projects  p on p.id = t.project_id
join customers c on c.id = p.customer_id;
```

Darauf: `v_report_week`, `v_report_month`, `v_report_year` – jeweils gruppiert nach
Kunde und Projekt mit Stunden, abrechenbaren Stunden und Umsatz. Das Frontend fragt
diese Views direkt ab und rechnet selbst nichts nach.

## 4. Export nach Excel

Ablauf: Export-Profil wählen → Zeitraum/Filter setzen → Vorschau (erste 50 Zeilen) →
Datei erzeugen. Die Erzeugung läuft mit SheetJS im Browser; kein Serverpfad, keine
temporären Dateien, keine Wartezeit.

Verfügbare Spalten (Auswahl je Profil): Datum · KW · Monat · Kunde · Projekt(-code) ·
Tätigkeitsart · Beschreibung · Dauer (h/min) · abrechenbar j/n · abrechenbare Stunden ·
Stundensatz · Betrag · Status · Periode.

Profile werden gespeichert und je Kunde als Standard hinterlegbar – für den
Monatsversand also: Kunde wählen, Profil ist gesetzt, Datei fällt raus.

## 5. FinOps-Anbindung (Phase 4)

### 5.1 Prinzip

Die Übertragung nach D365 F&O wird als **austauschbarer Adapter** gebaut, nicht als
verstreute Sonderlogik. Alles, was FinOps-spezifisch ist, liegt hinter einer Schnittstelle
`TimesheetTarget` mit den Operationen `mapEntry`, `push`, `status`. Ein zweiter Zielsystem-
Adapter (anderer Kunde, anderes ERP) wäre damit additiv.

### 5.2 Technischer Weg

- **Auth:** Entra-ID-App-Registrierung, OAuth2 Client Credentials, Scope
  `https://<env>.operations.dynamics.com/.default`. Client Secret ausschließlich als
  Supabase-Secret in der Edge Function – niemals im Frontend-Bundle.
- **Transport:** OData-REST gegen die Timesheet-Datenentitäten von F&O
  (`/data/…`). Für Massenübertragungen alternativ das DMF-Package-API.
- **Mapping:** Kunde → `DataAreaId`, Projekt → `ProjId` + `ActivityNumber`,
  Tätigkeitsart → Kategorie, `is_billable` → Line Property, Dauer → Stunden dezimal,
  `description` → Kommentarfeld. Die Zuordnungswerte stehen als Felder an Kunde/Projekt
  und werden **nicht** im Code hinterlegt.
- **Idempotenz:** Jeder Zeiteintrag trägt nach erfolgreicher Übertragung
  `finops_entry_id`. Ein erneuter Lauf überträgt nur Einträge mit
  `finops_sync_status in ('none','error')`. Ein Doppelklick erzeugt keine Doppelbuchung.
- **Granularität:** Übertragen wird immer eine **freigegebene Periode**, nie ein einzelner
  Eintrag. Teil-Erfolge sind zulässig und werden je Zeile protokolliert.
- **Protokoll:** `finops_sync_log` speichert Request, Response, Statuscode und Fehlertext
  je Versuch. Ohne dieses Protokoll ist eine ERP-Schnittstelle im Fehlerfall nicht
  diagnostizierbar.
- **Fehlerbehandlung:** Retry mit exponentiellem Backoff bei 5xx/429; 4xx gilt als
  fachlicher Fehler und landet in einer Fehlerliste zur manuellen Klärung.

### 5.3 Offener Punkt

Die exakten Entitätsnamen und Pflichtfelder der Timesheet-Schnittstelle hängen von deiner
F&O-Version und davon ab, ob Project Operations im Einsatz ist. Das muss vor Phase 4 gegen
die Zielumgebung verifiziert werden – ich habe hier bewusst keine Entitätsnamen als
gesichert dargestellt. Bis dahin bleibt die Anbindung auf Adapter-Ebene abstrakt.

## 6. Sicherheit und Betrieb

- **RLS:** Auf allen Tabellen aktiv, Policy `owner_id = auth.uid()`. Auch bei einem
  Nutzer – ein exponierter Anon-Key ohne RLS legt sonst die gesamte Datenbank offen.
- **Secrets:** Nur in Edge-Function-Umgebungsvariablen. Im Frontend ausschließlich der
  publishable Key.
- **Backup:** Supabase Point-in-Time-Recovery plus ein wöchentlicher `pg_dump` per
  GitHub Action in ein privates Repo/Storage. Abrechnungsdaten nur an einem Ort zu halten
  ist keine Option.
- **Aufbewahrung:** Zeitaufzeichnungen sind Grundlage der Rechnungsstellung und damit
  aufbewahrungspflichtig. Kein physisches Löschen – Kunden/Projekte werden über
  `is_active` / `status = 'closed'` inaktiv gesetzt (`on delete restrict` erzwingt das).
- **Migrationen:** Ausschließlich versionierte SQL-Dateien unter `supabase/migrations/`,
  in CI gegen eine frische DB geprüft. Kein manuelles Klicken im Studio.

## 7. Projektstruktur

```
/
├── docs/                       Konzept, Architektur, Entscheidungen
├── supabase/
│   ├── migrations/             versionierte SQL-Migrationen
│   ├── seed.sql                Testdaten (Kunden, Projekte, Sätze)
│   └── functions/
│       ├── finops-sync/
│       └── finops-status/
├── src/
│   ├── features/
│   │   ├── time-entry/         Wochenraster, Schnelleintrag, Timer
│   │   ├── customers/
│   │   ├── projects/           inkl. Satzhistorie
│   │   ├── reporting/          Auswertungen, Charts
│   │   ├── periods/            Perioden, Freigabe, Sperre
│   │   └── export/             Profile, Excel-Erzeugung
│   ├── lib/                    Supabase-Client, Datums-/Zeit-Utils
│   ├── components/ui/          shadcn-Komponenten
│   └── types/database.ts       aus dem Schema generiert
└── .github/workflows/
```

Schnitt nach **Feature**, nicht nach technischer Schicht: Alles zum Thema „Perioden"
liegt an einer Stelle. Das hält Änderungen lokal.

## 8. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1 – Fundament** | Schema, Migrationen, RLS, Auth, Stammdaten (Kunden, Projekte, Sätze) | Daten pflegbar |
| **2 – Erfassung** | Wochenraster, Schnelleintrag, Timer, Rundung, Periodenzuordnung | **Ab hier produktiv nutzbar** |
| **3 – Auswertung** | Views, Dashboard, Woche/Monat/Jahr, Charts, Budgetampel | Zahlen auf Knopfdruck |
| **4 – Export** | Export-Profile, Spaltenauswahl, Excel, Kundenreport | Kundenmeldung ohne Handarbeit |
| **5 – Perioden** | Freigabe-Workflow, Satz-Snapshot, Sperre, Offene-Perioden-Widget | Abrechnungssicherheit |
| **6 – FinOps** | Adapter, Mapping-Pflege, Sync-Konsole, Protokoll, Retry | ERP-Übertragung |

Phase 2 ist die Schwelle zum Alltagsnutzen – Phasen 3–5 sind danach in beliebiger
Reihenfolge nachziehbar. Phase 6 setzt die Klärung aus §5.3 voraus.

## 9. Spätere Mehrbenutzer-Erweiterung

Das Modell trägt `owner_id` von Anfang an mit und die RLS-Policies hängen daran. Für ein
kleines Team kämen hinzu: eine `users`/`memberships`-Tabelle, eine Rolle „Admin" in den
Policies und eine Genehmigungsstufe in `reporting_periods`. Kein Schema-Bruch, keine
Datenmigration der Zeiteinträge – das ist der Grund, warum `owner_id` jetzt schon drin ist,
obwohl es heute konstant ist.

## 10. Zu klärende Punkte

1. **F&O-Zielumgebung:** Version, Project Operations ja/nein, verfügbare Datenentitäten,
   wer richtet die App-Registrierung ein? *(blockiert Phase 6)*
2. **Rundung:** Ist 15 Minuten aufrunden je Kunde die richtige Voreinstellung, oder gibt
   es Kunden mit minutengenauer Abrechnung?
3. **Mehrwertsteuer/Währung:** Nur EUR und netto, oder gibt es Fremdwährungskunden?
4. **Reisezeiten/Spesen:** Sollen die mit erfasst werden (eigene Tätigkeitsart mit
   abweichendem Satz) oder bleiben sie außerhalb?
5. **Sollarbeitszeit:** Für die Auslastungsquote – feste Wochenstundenzahl, und sollen
   Feiertage/Urlaub gepflegt werden?
