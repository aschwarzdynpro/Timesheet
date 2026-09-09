# Arbeitsregeln für dieses Repository

Persönliche Zeiterfassung für Beratungsleistungen. Ein Benutzer, React + Supabase,
Oberfläche auf Deutsch. Diese Datei gilt für jedes Werkzeug, das hier Code ändert.

Wer schnell etwas ändern will, liest die fünf Regeln unter „Nicht verhandelbar" und
danach den Abschnitt zum betroffenen Thema. Der Rest ist Nachschlagewerk.

## Nicht verhandelbar

1. **Geschäftslogik gehört in die Datenbank.** Satzermittlung, Rundung,
   Periodenzuordnung, Sperren: Funktionen und Trigger in `supabase/migrations/`.
   Nichts davon in der Oberfläche nachrechnen.
2. **Bausteine statt eigenes CSS.** Alles Sichtbare kommt aus
   `src/components/ui/primitives.tsx` und Tailwind-Klassen. Keine handgeschriebene
   Klassenwelt daneben, keine zweite Formensprache.
3. **Farben stehen in `src/index.css`, nirgends sonst.** Jede Farbe ist eine
   Variable und hat zwei Werte: hell unter `:root`, dunkel unter
   `:root[data-theme='dark']`. Wer eine Farbe braucht, nimmt ein vorhandenes
   Token (`ink-*`, `accent-*`, `surface`, `on-strong`) — kein `bg-white`, kein
   Hex im Bauteil. Die Werte selbst sind geprüft und ändern sich nicht ohne
   ausdrücklichen Auftrag.
4. **Der `service_role`-Key gehört nie ins Frontend**, auch nicht in `.env`. Im
   Browser lebt ausschließlich der `sb_publishable_…`-Key. Sonst hängt RLS aus.
5. **Schema-Änderungen nur als neue Datei** in `supabase/migrations/`. Bestehende
   Migrationen werden nicht bearbeitet.

## Der Grund für Regel 1

Dieselben Zahlen entstehen an drei Stellen: in der Oberfläche, im Excel-Export und
später im FinOps-Adapter. Liegt die Regel in der Datenbank, rechnen alle drei
zwangsläufig gleich, und keine Regel lässt sich durch einen direkten API-Aufruf
umgehen. Die Periodensperre ist deshalb ein Trigger und keine Formularprüfung.

## Aufbau

```
docs/                     Fachkonzept, Architektur, Phasenberichte
supabase/
  migrations/             versionierte SQL-Migrationen (Zeitstempel_name.sql)
  tests/                  Schema- und RLS-Tests, reines SQL
scripts/test-db.sh        spielt alle Migrationen in eine frische DB und testet
src/
  features/               Schnitt nach Fachthema, nicht nach Schicht
    time-entry/ expenses/ reporting/ periods/ export/ settings/
    auth/ customers/ projects/ activity-types/ master-data/ account/
  components/ui/          Button, Input, Select, Field, Dialog, Badge, Card …
  lib/                    Supabase-Client, Formatierung, Wochenlogik, Feiertage
  types/database.ts       Typen zum Schema
```

Jedes Feature hat `api.ts` (TanStack Query) und seine Seiten. Alles zu einem Thema
liegt an einer Stelle.

## Oberfläche

- **Deutsch**, in ganzen Sätzen. Auch Fehlermeldungen: `describeError()` in
  `src/lib/supabase.ts` übersetzt Datenbankfehler. Neue Bedingung in der Datenbank
  heißt: dort einen Satz ergänzen.
- **Rückfragen über `useConfirm()`** aus `components/ui/confirm.tsx`, nie
  `window.confirm`. Die bestätigende Schaltfläche trägt den Namen der Handlung
  („Löschen", „Periode melden"), nie „OK"; Unumkehrbares steht gefüllt in Rot; der
  Fokus liegt beim Öffnen auf *Abbrechen*.
- **Leerzustände nennen die Folge**, nicht nur den Zustand. „Ohne Sollzeit bleibt
  die Auslastungsquote ausgeblendet — eine erfundene Zahl wäre schlimmer als keine."
- **Dialoge erst beim Öffnen einhängen** (`{offen && <Dialog …/>}`), sonst stehen
  Eingaben und Fehlermeldungen des vorigen Aufrufs wieder da.
- **Ein Editor, zwei Rahmen.** Ein Zeiteintrag wird am Laptop in der Tafel
  unter dem Wochenraster bearbeitet, auf dem Telefon im Dialog — beide zeigen
  denselben `EntryEditor`. Wer dort etwas ergänzt, ergänzt es für beide.
- **Zeiteinträge werden in der Zeile bearbeitet, nicht in einem Formular
  darunter.** Dauer und Beschreibung stehen als Felder in der Zeile und
  speichern beim Verlassen — wie die Zellen des Wochenrasters auch. Was für die
  ganze Zelle gilt (Tätigkeitsart, Arbeitspaket), steht darüber und ändert alle
  Einträge der Zelle auf einmal.
- **Die Periodensperre kommt aus dem Raster, nicht aus den Einträgen.** Eine
  leere Zelle in einer gemeldeten Woche hat keinen Eintrag, an dessen Status man
  sie ablesen könnte; ohne das Feld `locked` am Ziel böte das Formular dort
  etwas an, das die Datenbank ablehnt.
- **Minuten, keine Dezimalstunden.** Gerechnet wird in `int`; `minutesToHours()`
  formatiert erst zur Anzeige. Eingaben versteht `parseDuration()`: `1,5`, `1:30`, `90m`.
- **Daten als `DATE`**, nie `timestamptz`. Ein Arbeitstag hat keine Zeitzone.
  `today()` aus `lib/format.ts` benutzen, nicht `toISOString().slice(0,10)` — das
  liefert in Berlin nachts den Vortag.

## Mobil ist kein Nachgedanke

Der Nutzer erfasst unterwegs auf dem Telefon. Wiederkehrende Fallen aus diesem Repo:

- `min-w-0` auf Flex- und Grid-Kinder, sonst wächst ein Element auf seinen Inhalt
  und schiebt die Seite seitwärts.
- Raster mit einem `input[type=date]` stehen unter 640 px **untereinander**
  (`grid gap-3 sm:grid-cols-2`). iOS gibt Datumsfeldern eine eigene Mindestbreite.
- Kein `autoFocus` auf einem `<select>` in einem Dialog: iOS fährt sofort das
  Auswahlrad hoch und verdeckt den halben Dialog.
- Lange Namen kürzen: in der mobilen Tagesliste stehen Kundenkürzel statt Namen.
- **Eine Tabelle mit mehr als drei Spalten wird schmal zur Karte.** `hidden …
  sm:table` an der Tabelle, daneben `MobileList`/`MobileListItem` aus
  `components/ui/`. Ein `overflow-x-auto` ist kein Ersatz: die Seite läuft dann
  zwar nicht quer, aber die Hälfte steht außerhalb, und dass da noch etwas
  kommt, sieht man nicht. Die Karte zeigt **jeden** Wert der Zeile — was dort
  fehlt, ist auf dem Telefon unerreichbar.

Neue Ansichten werden auf **320, 390, 768 und 1400 px** geprüft — kein seitliches
Scrollen, keine Konsolenfehler.

## Navigation

Die Navigation trennt nach **Haeufigkeit, nicht nach Thema**. Vier taegliche
Ziele — Zeiten, Spesen, Auswertungen, Perioden — stehen auf dem Telefon fest am
unteren Rand; alles Seltene liegt hinter „Mehr" und die fuenf Stammdatenbereiche
zusammen auf `/stammdaten`.

Eine neue Seite kommt deshalb nicht einfach in die Liste: Wer sie taeglich
braucht, verdraengt unten etwas anderes — sonst gehoert sie zu den Stammdaten.
**Fuenf Felder sind das Maximum**, bei mehr faengt das Quergeschiebe wieder an,
das diese Leiste abgeloest hat.

Die Liste steht **einmal** in `src/components/navigation.ts` — Leiste,
Stammdatenkacheln und Rueckwege lesen dieselbe. Eine Seite, die nicht in der
Leiste steht, ist sonst eine Sackgasse: sie bekommt `parent` im `PageHeader`
(„‹ Stammdaten"), und ihr Elternteil traegt sie in `unter` ein, damit die Leiste
zeigt, wo man ist. Auf dem Telefon gibt es keine Ruecktaste des Browsers.

Zugehoerigkeit wird **abschnittsweise** verglichen, nicht als Praefix:
`/spesenarten` faengt mit `/spesen` an, und beide Eintraege leuchteten. Dafuer
gibt es `passt()` in derselben Datei.

Wer die Leiste anfasst, prueft auf **320 px**: dort hat ein Feld 60 px, und
„Auswertungen" braucht 64 — deshalb das Feld `kurz` in `NavEintrag`. Der Inhalt
darunter braucht `padding-bottom` in Hoehe der Leiste plus
`env(safe-area-inset-bottom)`, sonst verdeckt sie die letzte Zeile.

## Heller und dunkler Modus

Der dunkle Modus ist **keine Umkehrung**, sondern ein eigener Satz Werte, der gegen
die dunkle Fläche geprüft wurde. Beim Ändern gilt:

- Nie `bg-white` — das ist im dunklen Modus eine Leuchtfläche. `bg-surface` nehmen.
- Schrift auf gefülltem Akzent oder Rot ist `text-on-strong`, nicht `text-white`:
  die Flächen sind dunkel hell, dort hätte Weiß nur 2,9:1.
- Der Schleier hinter einem Dialog ist `bg-overlay/50`, nicht `bg-ink-900/50`.
  `ink-900` ist dunkel die *hellste* Farbe.
- `ink-300` ist eine Rahmenfarbe. Als Schriftfarbe kommt sie dunkel auf 1,7:1 —
  für Text mindestens `ink-400`, besser `ink-500`.
- Eine Unterscheidung darf nicht an blasser Schrift hängen (Wochenende, „kein
  Wert"). Fläche tönen oder Gewicht ändern.

Wer Farben anfasst, prüft beide Modi im Browser — der Testlauf misst jeden
sichtbaren Text gegen seinen tatsächlichen Grund und schlägt unter 4,5:1 an.

## Datenbank

- Sichten immer mit `security_invoker = true`, sonst hängen sie RLS aus.
- Jede Tabelle bekommt RLS und eine Policy. Bei Kindtabellen hängt die
  Zugehörigkeit am Kunden (siehe `reporting_periods`, `period_events`).
- Historisierte Sätze und Modelle sichern ihre Überlappungsfreiheit mit
  `EXCLUDE USING gist`. `NULL` kollidiert dort nie — deshalb der Kunstgriff
  `coalesce(activity_type_id, '000…'::uuid)` in `project_rates`.
- SQL und Commit-Nachrichten sind **ASCII** (`ae`, `oe`, `ue`, `ss`); Umlaute nur in
  Texten, die im Browser landen.
- Prüfen mit `./scripts/test-db.sh`. Ohne gesetztes `PGHOST` startet es eine eigene
  Wegwerf-Instanz unter `/tmp` und räumt sie wieder ab.

## Prüfen vor dem Abliefern

```bash
npm run typecheck && npm run lint && npm test && npm run build
./scripts/test-db.sh
```

Die Browsertests dieses Projekts fangen `/rest/v1/**` ab. **Vertragsfehler zwischen
App und PostgREST sind darin unsichtbar** — eine Sortierspalte, die es nicht gibt,
fällt einem Mock nicht auf. Genau so waren gespeicherte Zeiten einmal wochenlang
unsichtbar. Deshalb: Wer in der Oberfläche nach einer neuen Spalte filtert oder
sortiert, ergänzt sie in der Spaltenzusicherung in
`supabase/tests/10_schema_test.sql`.

Eine neue Zusicherung wird gegengeprüft: einmal absichtlich brechen und sehen, dass
sie fehlschlägt. Ein Test, der nie rot war, hat nichts bewiesen.

## Was Absprache braucht

Diese Dinge sind Entscheidungen des Nutzers, keine Umsetzungsdetails:

- Farben, Schriften, Navigationsstruktur
- neue Abhängigkeiten (die Diagramme sind bewusst handgezeichnetes SVG statt einer
  Bibliothek; `xlsx` ist wegen offener Sicherheitslücken durch `write-excel-file`
  ersetzt)
- Mehrbenutzer und Mehrwährung — bewusst zurückgestellt, Weg steht in
  `docs/02-architektur.md` §9
- alles an der FinOps-Anbindung (Phase 6), sie wartet auf Angaben zur F&O-Umgebung

## Weiterlesen

| Dokument | Inhalt |
|---|---|
| `docs/01-fachkonzept.md` | Anforderungen, Kernentscheidungen, Auswertungen |
| `docs/02-architektur.md` | Stack, Datenmodell, Funktionen, Phasenplan |
| `docs/03-…` bis `07-…` | was je Phase entstand, inklusive der gefundenen Fehler |
| `README.md` | Einrichtung, Befehle, Stand |

Die Phasenberichte führen jeweils einen Abschnitt „Beim Bauen gefunden". Wer einen
Fehler behebt, den ein Test nicht gefunden hätte, schreibt ihn dort auf — samt der
Frage, warum ihn niemand bemerkt hat.
