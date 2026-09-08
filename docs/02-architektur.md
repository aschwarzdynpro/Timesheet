# Zeiterfassung – Architekturvorschlag

Stand: 2026-09-06 (Rev. 3) · Status: abgestimmt · Phase 1 umgesetzt

## 1. Technologie-Stack

| Schicht | Wahl | Begründung |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite | Bekanntes Terrain, schnelle Builds, große Komponentenauswahl |
| Routing/State | TanStack Router + TanStack Query | Serverstate-Caching statt Redux-Boilerplate |
| UI | Tailwind CSS + shadcn/ui | Kein Design-System-Ballast, Komponenten liegen im Repo |
| Charts | Recharts | Ausreichend für Balken/Linien/Stapel |
| Datenbank | PostgreSQL 16 (Supabase) | Fensterfunktionen, `daterange`+GIST, ISO-Wochen nativ |
| API | PostgREST (Supabase Auto-API) | Kein handgeschriebenes CRUD-Backend für eine Ein-Personen-App |
| Auth | Supabase Auth (E-Mail + Magic Link) | Ein Konto, aber sauberes Session-Handling und RLS-Grundlage |
| Dateiablage | Supabase Storage | **Spesenbelege** (Foto/PDF), privater Bucket mit RLS |
| Serverlogik | Supabase Edge Functions (Deno) | FinOps-Sync: Secrets dürfen nicht ins Frontend |
| Excel | SheetJS (`xlsx`) clientseitig | Bei diesen Datenmengen reicht der Browser |
| Mobil | PWA, Service Worker | Installierbar, Offline-Puffer für Erfassung – keine zweite App |
| Hosting | Vercel oder Netlify (Static) | Preview-Deployments je Branch |
| CI | GitHub Actions | Lint, Typecheck, Tests, Migrations-Check |

### Warum nicht anders

**Warum kein eigenes Node/.NET-Backend?** Für eine Ein-Personen-App wäre eine zusätzliche
API-Schicht reines CRUD-Durchreichen. Die Geschäftslogik mit Substanz (Satzermittlung,
Rundung, Periodenzuordnung, Sperren) gehört ohnehin in die Datenbank, wo sie nicht
umgangen werden kann. Kommt später doch ein Backend, sitzt es vor derselben DB – kein
Wegwurf.

**Warum Supabase und nicht nur „Postgres irgendwo"?** Auth, Auto-API, Storage für
Spesenbelege, Edge Functions, Backups und Migrations-CLI in einem Paket. Der Lock-in ist
gering: Unten liegt normales PostgreSQL, das Schema ist in SQL-Migrationen versioniert und
per `pg_dump` umziehbar.

**Warum keine native Mobile-App?** Der mobile Funktionsumfang ist bewusst klein (Timer,
Schnelleintrag, Belegfoto). Eine PWA deckt das inklusive Kamerazugriff und Offline-Puffer
ab und teilt sich Code, Datenmodell und Deployment mit dem Laptop-Client.

## 2. Systemüberblick

```
┌───────────────────────────────────────────────────────────────┐
│  Laptop – React SPA (voller Funktionsumfang)                   │
│  Wochenraster │ Auswertungen │ Stammdaten │ Perioden │ Export  │
├───────────────────────────────────────────────────────────────┤
│  Mobil/Tablet – dieselbe App, reduzierte Oberfläche (PWA)      │
│  Timer │ Schnelleintrag │ Tagesliste │ Belegfoto               │
└──────────┬─────────────────────┬──────────────────┬───────────┘
           │ HTTPS + JWT         │                  │ Upload
           ▼                     ▼                  ▼
┌────────────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ PostgREST          │  │ Edge Functions   │  │ Supabase Storage│
│ Tabellen/Views/RPC │  │ · finops-sync    │  │ Spesenbelege    │
└──────────┬─────────┘  │ · finops-status  │  │ privat + RLS    │
           │            └────────┬─────────┘  └─────────────────┘
           │                     │  OAuth2 (Client Credentials)
           ▼                     │
┌────────────────────────────────┼──────────────┐   ┌──────────────┐
│ PostgreSQL 16                  │              │   │ D365 F&O     │
│                                ▼              │──▶│ Timesheets   │
│  Stammdaten · Zeiten · Spesen · Perioden      │   │ (OData)      │
│  Arbeitszeitmodell · Abwesenheiten            │   └──────────────┘
│  Views für Woche/Monat/Jahr                   │
│  Funktionen: Satz · Rundung · Periode         │
│  Trigger: Sperre · Satz-Snapshot              │
│  RLS: owner_id = auth.uid()                   │
└───────────────────────────────────────────────┘
```

Die FinOps-Anbindung ist bewusst ausgelagert: Sie ist der einzige Teil, der Secrets
braucht, externe Verfügbarkeit voraussetzt und fehlschlagen kann. Sie darf den Rest der
App nicht mitreißen.

## 3. Datenmodell

### 3.1 Entitäten und Beziehungen

```
customers ──1:n──> projects ──1:n──> project_rates ──n:1──> activity_types
    │                  │                    (optional je Tätigkeitsart)
    │                  ├──1:n──> time_entries <──n:1── activity_types
    │                  └──1:n──> expenses ────n:1───> expense_categories
    │                                  │
    └──1:n──> reporting_periods <──────┘  (Zeiten und Spesen)

work_schedules      absences      holidays
export_profiles     finops_sync_log     app_settings
```

### 3.2 Währung

Es gibt **keine Umrechnungslogik, keine Kurstabelle und keine Basiswährung**. Beträge sind
EUR und werden schlicht addiert.

Beibehalten wird lediglich `currency char(3) not null default 'EUR'` an den drei Stellen,
an denen Beträge entstehen (`customers`, `project_rates`, `expenses`). Das Feld wird
nirgends ausgewertet und nirgends angezeigt. Es kostet nichts und erspart, falls
Mehrwährung später doch kommt, eine Schemaänderung an den bis dahin gewachsenen Tabellen –
der eigentliche Aufwand läge dann ohnehin in Kurshistorie, Snapshot und
Auswertungslogik, nicht in diesen Spalten.

### 3.3 Stammdaten

```sql
create table customers (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid(),
  code                  text not null,              -- "ACME"
  name                  text not null,
  currency              char(3) not null default 'EUR',   -- Platzhalter, siehe §3.2
  reporting_cycle       text not null default 'monthly'
                          check (reporting_cycle in ('weekly','monthly')),
  week_start_day        text not null default 'monday'   -- nur bei cycle = weekly
                          check (week_start_day in ('monday','sunday')),
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
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references customers on delete restrict,
  code                   text not null,
  name                   text not null,
  status                 text not null default 'active'
                           check (status in ('active','paused','closed')),
  is_billable            boolean not null default true,
  start_date             date,
  end_date               date,
  budget_hours           numeric(10,2),
  budget_amount          numeric(12,2),
  rounding_minutes       int,          -- NULL = vom Kunden erben
  rounding_mode          text,         -- NULL = vom Kunden erben
  reporting_cycle        text,         -- NULL = vom Kunden erben
  finops_project_id      text,
  finops_activity_number text,
  created_at             timestamptz not null default now(),
  unique (customer_id, code)
);

create table activity_types (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid(),
  code                text not null,      -- 'CONSULT', 'TRAVEL', 'INTERNAL'
  name                text not null,
  is_billable_default boolean not null default true,
  finops_category     text,
  sort_order          int not null default 100,
  unique (owner_id, code)
);
```

### 3.4 Stundensätze – historisiert, optional je Tätigkeitsart

```sql
create table project_rates (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects on delete cascade,
  activity_type_id uuid references activity_types,   -- NULL = gilt für alle
  hourly_rate      numeric(10,2) not null check (hourly_rate >= 0),
  currency         char(3) not null default 'EUR',
  valid_from       date not null,
  valid_to         date,                              -- NULL = offen
  note             text,
  constraint rate_period_valid check (valid_to is null or valid_to >= valid_from),
  -- keine zwei Sätze für dieselbe Kombination im selben Zeitraum
  exclude using gist (
    project_id with =,
    coalesce(activity_type_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);
```

`fn_rate_for(project_id, activity_type_id, on_date)` löst nach dem **spezifischsten
Treffer** auf: zuerst ein Satz für genau diese Tätigkeitsart, sonst der allgemeine
Projektsatz. Damit ist „Reisezeit zu 50 %" reine Stammdatenpflege.

### 3.5 Zeiteinträge

```sql
create table time_entries (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid(),
  project_id         uuid not null references projects on delete restrict,
  activity_type_id   uuid references activity_types,
  work_date          date not null,
  start_time         time,                       -- optional, dokumentarisch
  end_time           time,
  duration_minutes   int  not null check (duration_minutes > 0),
  billable_minutes   int  not null check (billable_minutes >= 0),
  is_billable        boolean not null default true,
  description        text not null check (length(btrim(description)) > 0),
  rate_snapshot      numeric(10,2),              -- beim Periodenabschluss eingefroren
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
```

### 3.6 Spesen

```sql
create table expense_categories (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default auth.uid(),
  code                    text not null,   -- 'MILEAGE', 'HOTEL', 'TRAIN', 'PER_DIEM'
  name                    text not null,
  entry_mode              text not null check (entry_mode in ('receipt','allowance')),
  unit_label              text,            -- 'km', 'Tag' – nur bei allowance
  default_unit_rate       numeric(10,4),   -- z. B. 0.3000 €/km
  is_rechargeable_default boolean not null default true,
  finops_category         text,
  unique (owner_id, code)
);

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid(),
  project_id      uuid not null references projects on delete restrict,
  category_id     uuid not null references expense_categories,
  expense_date    date not null,
  description     text not null,
  -- Pauschale: quantity × unit_rate; Beleg: amount_net direkt
  quantity        numeric(10,2),
  unit_rate       numeric(10,4),
  amount_net      numeric(12,2) not null check (amount_net >= 0),
  vat_rate        numeric(5,2),
  amount_gross    numeric(12,2),
  currency        char(3) not null default 'EUR',
  is_rechargeable boolean not null default true,
  markup_percent  numeric(5,2) not null default 0,
  receipt_path    text,                    -- Supabase Storage, NULL bei Pauschale
  period_id       uuid references reporting_periods,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','invoiced')),
  created_at      timestamptz not null default now(),
  constraint expense_mode check (
    (quantity is null and unit_rate is null) or
    (quantity is not null and unit_rate is not null)
  )
);
```

Spesen durchlaufen denselben Perioden-, Sperr- und Exportmechanismus wie Zeiteinträge und
erscheinen im Kundenreport als eigener Block. Der weiterberechnete Betrag ist
`amount_net × (1 + markup_percent/100)`.

### 3.7 Perioden, Arbeitszeit, Abwesenheiten

```sql
create table reporting_periods (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers on delete cascade,
  cycle          text not null check (cycle in ('weekly','monthly')),
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'open'
                   check (status in ('open','submitted','approved','invoiced')),
  submitted_at   timestamptz,
  total_minutes  int,
  total_fees     numeric(12,2),          -- Honorar
  total_expenses numeric(12,2),          -- weiterberechnete Spesen
  unique (customer_id, cycle, period_start)
);

create table work_schedules (           -- Sollarbeitszeit, historisiert
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  valid_from  date not null,
  valid_to    date,
  minutes_mon int not null default 480, minutes_tue int not null default 480,
  minutes_wed int not null default 480, minutes_thu int not null default 480,
  minutes_fri int not null default 480, minutes_sat int not null default 0,
  minutes_sun int not null default 0,
  exclude using gist (
    owner_id with =, daterange(valid_from, valid_to, '[]') with &&
  )
);

create table absences (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid(),
  date_from date not null,
  date_to   date not null,
  kind      text not null check (kind in ('vacation','sick','training','other')),
  note      text,
  check (date_to >= date_from)
);

create table holidays (                  -- bundeslandabhängig
  holiday_date date not null,
  region       text not null,            -- 'DE-BY', 'DE-NW', …
  name         text not null,
  primary key (holiday_date, region)
);
```

`fn_target_minutes(from_date, to_date)` liefert die Sollzeit im Zeitraum unter Abzug von
Feiertagen und Abwesenheiten – Grundlage der Auslastungsquote.

### 3.8 Funktionen und Trigger

| Objekt | Aufgabe |
|---|---|
| `fn_rate_for(project, activity, date)` | Gültigen Satz ermitteln, spezifischster Treffer gewinnt |
| `fn_effective_rounding(project)` | Takt und Modus mit Kundenvererbung auflösen |
| `fn_assert_work_package_fits(paket, projekt)` | Verhindert die Buchung auf ein Paket eines fremden Projekts |
| `fn_round_minutes(minutes, incr, mode)` | Abrechenbare Minuten berechnen |
| `fn_period_bounds(cycle, date, week_start)` | Grenzen der Meldeperiode; `week_start` wirkt nur bei `weekly` |
| `fn_ensure_period(customer, cycle, date)` | Periode finden oder anlegen, Wochenbeginn vom Kunden |
| `trg_customer_week_start_*` (BEFORE/AFTER UPD) | Wochenbeginn ab der ersten Meldung sperren, offene Wochen neu schneiden |
| `fn_target_minutes(from, to)` | Sollarbeitszeit abzüglich Feiertagen/Abwesenheiten |
| `trg_assign_period` (BEFORE INS/UPD) | `period_id` und `billable_minutes` setzen – auf Zeiten **und** Spesen |
| `trg_lock_closed_period` (BEFORE INS/UPD/DEL) | Änderung ablehnen, wenn Periode ≠ `open` |
| `fn_submit_period(period)` | Sätze einfrieren, Summen schreiben, Status setzen, protokollieren |
| `fn_reopen_period(period, grund)` | Meldung zurücknehmen: Status offen, Sätze wieder beweglich, protokollieren |

Die Sperre als **Trigger** statt als UI-Prüfung ist bewusst gewählt: Auch ein direkter
API-Aufruf, ein Import oder ein SQL-Zugriff darf gemeldete Perioden nicht ändern.

### 3.9 Views für Auswertungen

```sql
create view v_time_entries_full as
select
  t.*,
  p.name as project_name, p.code as project_code,
  c.id   as customer_id,  c.name as customer_name, c.code as customer_code,
  a.name as activity_name,
  coalesce(t.rate_snapshot,
           fn_rate_for(t.project_id, t.activity_type_id, t.work_date))    as rate,
  round(t.billable_minutes / 60.0
        * coalesce(t.rate_snapshot,
                   fn_rate_for(t.project_id, t.activity_type_id, t.work_date)), 2)
                                                                          as amount,
  extract(isoyear from t.work_date)::int as iso_year,
  extract(week    from t.work_date)::int as iso_week,
  date_trunc('week',  t.work_date)::date as week_start,
  date_trunc('month', t.work_date)::date as month_start,
  extract(year    from t.work_date)::int as year
from time_entries t
join projects       p on p.id = t.project_id
join customers      c on c.id = p.customer_id
left join activity_types a on a.id = t.activity_type_id;
```

Analog `v_expenses_full`. Darauf: `v_report_week`, `v_report_month`, `v_report_year` –
gruppiert nach Kunde und Projekt, mit Stunden, abrechenbaren Stunden, Honorar und Spesen.
Das Frontend fragt diese Views direkt ab und rechnet selbst nichts nach.

## 4. Export nach Excel

Ablauf: Export-Profil wählen → Zeitraum/Filter setzen → Vorschau (erste 50 Zeilen) →
Datei erzeugen. Die Erzeugung läuft mit SheetJS im Browser; kein Serverpfad, keine
temporären Dateien, keine Wartezeit.

Verfügbare Spalten (Auswahl je Profil): Datum · KW · Monat · Kunde · Projekt(-code) ·
Tätigkeitsart · Beschreibung · Dauer (h/min) · abrechenbar j/n · abrechenbare Stunden ·
Stundensatz · Betrag · Status · Periode. Für Spesen ein eigener Blattbereich mit Datum ·
Kategorie · Beschreibung · Menge · Satz · Betrag · weiterberechenbar · Aufschlag.

Profile werden gespeichert und je Kunde als Standard hinterlegbar.

## 5. FinOps-Anbindung (Phase 6, Klärung zurückgestellt)

### 5.1 Prinzip

Die Übertragung nach D365 F&O wird als **austauschbarer Adapter** gebaut. Alles
FinOps-Spezifische liegt hinter einer Schnittstelle `TimesheetTarget` mit den Operationen
`mapEntry`, `push`, `status`. Ein zweiter Zielsystem-Adapter wäre additiv.

Die Mapping-Felder (`finops_*` an Kunde, Projekt, Tätigkeitsart, Spesenkategorie) stehen
**von Phase 1 an** im Schema. Sie kosten nichts, solange sie leer bleiben, ersparen aber
später eine Migration der Bestandsdaten.

### 5.2 Technischer Weg

- **Auth:** Entra-ID-App-Registrierung, OAuth2 Client Credentials, Scope
  `https://<env>.operations.dynamics.com/.default`. Client Secret ausschließlich als
  Supabase-Secret in der Edge Function – niemals im Frontend-Bundle.
- **Transport:** OData-REST gegen die Timesheet-Datenentitäten von F&O; für
  Massenübertragungen alternativ das DMF-Package-API.
- **Mapping:** Kunde → `DataAreaId`, Projekt → `ProjId` + Aktivität, Tätigkeitsart →
  Kategorie, `is_billable` → Line Property, Dauer → Stunden dezimal. Als Feldwerte
  gepflegt, nicht im Code hinterlegt.
- **Idempotenz:** Nach erfolgreicher Übertragung trägt jeder Zeiteintrag seine
  `finops_entry_id`; ein erneuter Lauf überträgt nur Einträge mit
  `finops_sync_status in ('none','error')`. Ein Doppelklick erzeugt keine Doppelbuchung.
- **Granularität:** Übertragen wird immer eine **freigegebene Periode**, nie ein einzelner
  Eintrag. Teil-Erfolge sind zulässig und werden je Zeile protokolliert.
- **Protokoll:** `finops_sync_log` speichert Request, Response, Statuscode und Fehlertext
  je Versuch. Ohne dieses Protokoll ist eine ERP-Schnittstelle im Fehlerfall nicht
  diagnostizierbar.
- **Fehlerbehandlung:** Retry mit exponentiellem Backoff bei 5xx/429; 4xx gilt als
  fachlicher Fehler und landet in einer Klärungsliste.

### 5.3 Offener Punkt

Die exakten Entitätsnamen und Pflichtfelder hängen von der F&O-Version ab und davon, ob
Project Operations im Einsatz ist. Die Klärung ist zurückgestellt; hier sind bewusst
**keine Entitätsnamen als gesichert dargestellt**. Vor Beginn von Phase 6 gegen die
Zielumgebung zu verifizieren.

## 6. Sicherheit und Betrieb

- **RLS:** Auf allen Tabellen aktiv, Policy `owner_id = auth.uid()`. Auch bei einem
  Nutzer – ein exponierter Anon-Key ohne RLS legt sonst die Datenbank offen.
- **Storage:** Spesenbelege in einem **privaten** Bucket, Zugriff über RLS-Policy auf dem
  Pfadpräfix; Auslieferung nur über signierte URLs mit kurzer Gültigkeit.
- **Secrets:** Nur in Edge-Function-Umgebungsvariablen. Im Frontend ausschließlich der
  publishable Key.
- **Backup:** Supabase Point-in-Time-Recovery plus wöchentlicher `pg_dump` per GitHub
  Action. Belege aus dem Storage werden mitgesichert – Abrechnungsdaten nur an einem Ort
  zu halten ist keine Option.
- **Aufbewahrung:** Zeitaufzeichnungen und Belege sind Grundlage der Rechnungsstellung und
  aufbewahrungspflichtig. Kein physisches Löschen – Kunden und Projekte werden über
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
│   │   ├── expenses/           Spesen, Belegupload, Pauschalen
│   │   ├── customers/
│   │   ├── projects/           inkl. Satzhistorie je Tätigkeitsart
│   │   ├── reporting/          Auswertungen, Charts, Auslastung
│   │   ├── periods/            Perioden, Freigabe, Sperre
│   │   ├── settings/           Arbeitszeit, Abwesenheiten, Stammlisten
│   │   └── export/             Profile, Excel-Erzeugung
│   ├── lib/                    Supabase-Client, Datums-Utils
│   ├── components/ui/          eigene Bausteine, inkl. Rückfrage-Dialog
│   └── types/database.ts       aus dem Schema generiert
└── .github/workflows/
```

Schnitt nach **Feature**, nicht nach technischer Schicht: Alles zum Thema „Spesen" liegt
an einer Stelle. Das hält Änderungen lokal.

**Rückfragen** laufen über `useConfirm()` aus `components/ui/confirm.tsx`, nicht über
`window.confirm`. Der eingebaute Dialog lässt sich nicht gestalten, zeigt auf dem Telefon
die nackte Systemkarte und macht aus jeder Handlung ein beliebiges „OK". Der eigene
Dialog gibt ein Promise zurück, sodass die Aufrufstelle gleich schlank bleibt
(`if (!await confirm(…)) return`), und hält drei Regeln ein: die bestätigende
Schaltfläche trägt den **Namen der Handlung** statt „OK", eine unumkehrbare steht
**gefüllt in Rot**, und der Fokus liegt beim Öffnen auf *Abbrechen* — wer versehentlich
die Eingabetaste trifft, soll nicht löschen oder melden.

## 8. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1 – Fundament** ✅ | Schema, Migrationen, RLS, Auth, Stammdaten: Kunden, Projekte, Tätigkeitsarten, Stundensätze | umgesetzt, siehe [03-phase-1.md](03-phase-1.md) |
| **2a – Zeiterfassung** | Wochenraster, Schnelleintrag, Timer, Rundung, Periodenzuordnung, mobile Kernfunktionen | **Ab hier produktiv nutzbar** |
| **2b – Reisezeit & Spesen** | Tätigkeitsart-Sätze, Spesenarten, Beleg-Upload, Belegfoto mobil | Vollständige Leistungserfassung |
| **3 – Auswertung** | Views, Dashboard, Woche/Monat/Jahr, Charts, Budgetampel, Arbeitszeitmodell und Auslastung | Zahlen auf Knopfdruck |
| **4 – Export** | Export-Profile, Spaltenauswahl, Excel, Kundenreport | Kundenmeldung ohne Handarbeit |
| **5 – Perioden** | Freigabe-Workflow, Satz-Snapshot, Sperre, Offene-Perioden-Widget | Abrechnungssicherheit |
| **6 – FinOps** | Adapter, Mapping-Pflege, Sync-Konsole, Protokoll, Retry | ERP-Übertragung |

**Hinweis zur Aufteilung:** Reisezeiten und Spesen sind wie besprochen Teil von Phase 2.
Weil Spesen ein eigenes Objekt mit Beleg-Upload sind, wird Phase 2 dadurch der größte
Block. Der Vorschlag ist deshalb ein interner Schnitt in **2a** und **2b** – der Nutzen
der App beginnt schon nach 2a, ohne dass Spesen nach hinten rutschen.

Phase 6 setzt die zurückgestellte Klärung aus §5.3 voraus.

## 9. Spätere Erweiterungen

**Mehrbenutzer:** Das Modell trägt `owner_id` von Anfang an mit, die RLS-Policies hängen
daran. Für ein kleines Team kämen hinzu: eine `memberships`-Tabelle, eine Rolle „Admin" in
den Policies und eine Genehmigungsstufe in `reporting_periods`. Kein Schema-Bruch.

**Mehrwährung:** Falls doch nötig, kommen hinzu: eine historisierte Kurstabelle
`exchange_rates`, eine Funktion `fn_fx_rate()`, ein zweiter Snapshot `fx_rate_snapshot` an
Zeiten und Spesen, ein Berichtsbetrag `amount_base` in den Views und die Regel, dass
kundenbezogene Ansichten nie umrechnen und übergreifende immer. Die `currency`-Spalten
sind bereits vorhanden (§3.2), die bestehenden Beträge müssen nicht migriert werden.

## 10. Zu klärende Punkte

| # | Thema | Fällig |
|---|---|---|
| 1 | **Spesenarten:** welche Pauschalen zu welchen Sätzen (Kilometergeld, Verpflegung)? Brutto/netto mit Vorsteuerausweis nötig? | Phase 2b |
| 2 | **Mobiler Funktionsumfang:** Bestätigung der Liste aus Fachkonzept §6.2 | Phase 2 |
| 3 | ~~**Arbeitszeitmodell:** Wochenstunden und Verteilung, Bundesland, Urlaubspflege~~ — beantwortet: Oberfläche unter `/einstellungen`, Feiertage werden je Bundesland berechnet, Urlaub in der App. | erledigt (Phase 3) |
| 4 | **F&O-Zielumgebung:** Version, Project Operations, Datenentitäten, App-Registrierung | zurückgestellt |
