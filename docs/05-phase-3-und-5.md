# Phasen 3 und 5 – Auswertungen, Arbeitszeit und Perioden-Workflow

Stand: 2026-09-06

## Auswertungen (`/auswertungen`)

Alle Zahlen kommen aus den vorbereiteten Sichten `v_report_week`, `v_report_month` und
`v_report_year`. Die Oberfläche summiert nur, was ohnehin zusammengehört, und rechnet
keine Bewertung nach — dieselbe Grundlage, die später Export und Kundenmeldung nutzen.

**Steuerung:** Jahr · Auflösung (Monat oder Kalenderwoche) · Kunde.

**Kennzahlen:** erfasste Stunden · abrechenbare Stunden mit Anteil · Honorar ·
Ø realisierter Satz · Auslastung.

Der **Ø realisierte Satz** teilt das Honorar durch die *erfassten*, nicht durch die
berechneten Stunden. Genau diese Kennzahl macht ein Projekt sichtbar, das nominell zu
150 € läuft und tatsächlich 105 € einbringt, weil ein Drittel der Zeit nicht abrechenbar
war. Die **Auslastung** erscheint nur, wenn ein Arbeitszeitmodell hinterlegt ist —
ohne Sollzeit gibt es keine Quote, und eine erfundene Zahl wäre schlimmer als keine.

**Diagramme.** Zwei, beide als Inline-SVG ohne Diagrammbibliothek: der Verlauf als
gestapelte Säulen (abrechenbar / intern) und das Honorar je Kunde als waagerechte Balken
mit direkter Beschriftung. Die beiden Farben stammen aus einer geprüften Palette und
bestehen Helligkeitsband, Chroma-Untergrenze, Farbsehschwächen-Abstand (ΔE 24,7) und
Kontrast gegen weiße Fläche. Das Konzept nannte Recharts; zwei einfache Formen
rechtfertigen keine Bibliothek, und von Hand lassen sich Details wie die 2 px Luft
zwischen gestapelten Flächen und die selektive Achsenbeschriftung genauer einhalten.

**Budgetampel.** Je Projekt der Stand gegen Stunden- oder Betragsbudget. Der Zustand
steckt in Balken, Prozentzahl *und* Wort („im Rahmen“, „knapp“, „überschritten“) — nie
allein in der Farbe.

## Arbeitszeit (`/einstellungen`)

Die Auslastungsquote der Auswertungen kommt aus `fn_target_minutes(von, bis)`. Diese
Funktion war seit Phase 1 da, ihre drei Datenquellen aber ohne Oberfläche — die Quote
blieb deshalb dauerhaft ausgeblendet. Die Seite füllt genau diese Lücke.

**Arbeitszeitmodell.** Sollstunden je Wochentag, historisiert über `valid_from`/`valid_to`.
Ein Wechsel von 40 auf 32 Stunden legt einen zweiten Zeitraum an, statt den ersten zu
überschreiben; ältere Auswertungen rechnen dadurch weiter mit dem, was damals galt. Eine
`EXCLUDE`-Bedingung in der Datenbank verhindert überlappende Zeiträume, die Meldung dazu
ist ins Deutsche übersetzt. Die Eingabe je Tag versteht dieselben Schreibweisen wie die
Zeiterfassung — `8`, `7,5`, `7:30`.

**Feiertage.** Nicht abgetippt, sondern gerechnet: `src/lib/holidays.ts` bestimmt den
Ostersonntag nach dem anonymen gregorianischen Algorithmus und leitet daraus Karfreitag,
Ostermontag, Christi Himmelfahrt, Pfingstmontag und Fronleichnam ab; die festen Tage und
die Länderunterschiede stehen als Tabelle daneben. Bundesland und Jahr wählen, die
berechnete Liste steht sofort als Vorschau da, ein Klick übernimmt sie.

Übernommen wird mit `on_conflict=(owner_id, holiday_date, region)` und
`ignoreDuplicates` — ein zweiter Lauf legt nichts doppelt an und läuft ohne Fehler durch.

Bewusst **nicht** enthalten sind Tage, die sich nicht am Bundesland festmachen lassen:
Mariä Himmelfahrt gilt in Bayern nur in überwiegend katholischen Gemeinden, Fronleichnam
in Sachsen und Thüringen nur in einzelnen, das Augsburger Friedensfest nur in Augsburg.
Eine Liste, die solche Tage pauschal setzt, wäre für die meisten Nutzungen falsch; sie
lassen sich bei Bedarf als Abwesenheit nachtragen. Buß- und Bettag (nur Sachsen) ist
dagegen drin, weil er landesweit gilt — als Mittwoch vor dem 23. November berechnet.

**Abwesenheiten.** Urlaub, Krankheit, Weiterbildung, Sonstiges als Zeitraum. Sie ziehen
die Sollzeit ab; ohne sie fällt die Quote in Urlaubswochen künstlich niedrig aus.

## Perioden (`/perioden`)

Die Liste aller Meldeperioden mit Status, Summen und Positionen. Offene Perioden rechnen
live aus den Einträgen; gemeldete tragen ihre Summen selbst, weil sie beim Freigeben
zusammen mit dem Stundensatz eingefroren wurden.

Oben steht eine Warnung für **abgelaufene, noch nicht gemeldete Perioden** — der Fall,
den man im Alltag tatsächlich vergisst und der im Fachkonzept als wichtigster
Dashboard-Punkt genannt ist.

### Wochenbeginn je Kunde

Bei wöchentlicher Meldung steht am Kunden, ob die Woche am **Montag oder am Sonntag**
beginnt. `date_trunc('week', …)` in PostgreSQL kennt nur ISO-8601 und damit nur den
Montag; der Sonntagsschnitt entsteht, indem ein Tag vorgezogen, der ISO-Montag bestimmt
und wieder ein Tag zurückgegangen wird. Der Wochenbeginn geht als dritter Parameter in
`fn_period_bounds`; `fn_ensure_period` liest ihn beim Kunden, sodass kein Aufrufer davon
weiß — dieselbe Linie wie bei Rundung und Rhythmus: die Regel steht in der Datenbank.

Zwei Fälle waren zu entscheiden:

- **Umstellung mit Bestand.** Jede Wochengrenze verschiebt sich. Offene Wochen werden
  deshalb neu geschnitten: die Vorbereitungs-Trigger rechnen `period_id` ohnehin bei
  jedem Schreibvorgang neu, eine Aktualisierung ohne inhaltliche Änderung genügt, um sie
  erneut auszulösen. Was danach leer zurückbleibt, ist eine Woche im alten Schnitt und
  wird gelöscht.
- **Umstellung nach einer Meldung.** Sie ist gesperrt. Der gemeldete Zeitraum ist
  gegenüber dem Kunden verbindlich; ihn nachträglich zu verschieben wäre ein stiller
  Widerspruch zu dem, was er bereits bekommen hat. Ein Trigger lehnt den Wechsel ab,
  sobald für den Kunden eine Wochenperiode nicht mehr `open` ist.

Die eigenen Auswertungen (`v_report_week`, das Wochenraster) bleiben bei ISO-Wochen ab
Montag. Sie beantworten „wie war meine Woche", nicht „was bekommt dieser Kunde" — ein
kundenabhängiger Schnitt würde die eigenen Zahlen zwischen Kunden unvergleichbar machen.

Die Freigabe ruft `fn_submit_period()` als RPC auf. Die gesamte Arbeit — Sätze einfrieren,
Summen schreiben, Status setzen — passiert in der Datenbank, in einer Transaktion. Vorher
nennt eine Rückfrage Kunde, Zeitraum und die Folge im Klartext: Danach sind die Zeiten
gesperrt und die Sätze eingefroren, und das lässt sich in der App nicht zurücknehmen.

### Meldung zurücknehmen

Der Lebenszyklus war eine Einbahnstraße. Im Alltag weist ein Kunde aber Positionen zurück
und bittet um Umbuchung — ohne Rückweg bliebe nur, die Zahlen falsch stehen zu lassen oder
an der App vorbei in der Datenbank zu arbeiten. Beides ist schlechter als ein Weg, der
festhält, dass es ihn gab.

`fn_reopen_period(periode, grund)` nimmt eine Meldung zurück: Status wieder `open`,
Meldezeitpunkt und eingefrorene Summen weg, Einträge und Spesen zurück auf Entwurf. Der
**eingefrorene Stundensatz fällt dabei weg**. Das ist die entscheidende Folge und steht
deshalb im Dialog: Die Periode ist nicht mehr endgültig, also gilt wieder die
Satzhistorie, und beim erneuten Melden wird nach dem dann gültigen Satz neu eingefroren.
Wer zwischendurch einen Satz geändert hat, bekommt eine andere Summe — sichtbar, statt
still.

Die Reihenfolge in der Funktion ist nicht beliebig: Zuerst wird die Periode geöffnet,
dann werden die Einträge angefasst. Die Sperre prüft den Status der Periode, an der ein
Eintrag hängt; andersherum würde die Funktion sich selbst blockieren.

**Abgerechnet ist Schluss.** Eine Periode im Status `invoiced` steht in einer Rechnung.
Sie hier still wieder zu öffnen würde die Buchhaltung von der Zeiterfassung abkoppeln,
ohne dass es jemand merkt; wer wirklich umbuchen muss, storniert zuerst. Die Oberfläche
zeigt dort statt der Schaltfläche „abgerechnet", die Datenbank lehnt den Aufruf ohnehin ab.

**Das Protokoll.** `period_events` hält je Periode fest, was wann gemeldet und was
zurückgenommen wurde — mit Grund und mit den Summen des Augenblicks. Es entsteht aus einem
schlichten Grund: Beim Wiederöffnen verliert die Periode ihre eingefrorenen Zahlen. Ohne
Protokoll wäre nicht mehr nachlesbar, was der Kunde ursprünglich bekommen hat. In der
Oberfläche steht der Verlauf im aufgeklappten Bereich, aber erst ab dem zweiten Ereignis:
eine einzelne Meldung erzählt nichts, was nicht schon in der Zeile steht.

## Beim Bauen gefunden

- **Ein Typ-Cast, der zur Laufzeit falsch gewesen wäre.** Die Tooltip-Position im
  Verlaufsdiagramm wurde mit `as unknown as number` durch die Typprüfung gezwungen,
  hätte aber Prozentwerte als Pixel geliefert. Jetzt sauber als CSS-Prozentwerte.
- **Sollzeit ohne Weg zur Eingabe.** `fn_target_minutes` existierte seit Phase 1, die
  Tabellen `work_schedules`, `absences` und `holidays` ebenso — nur führte keine Route
  dorthin. Die Auslastung blendete sich damit korrekt aus, dauerhaft und ohne Hinweis,
  wie man das ändert. Der Leerzustand sagt es jetzt und verlinkt die Anlage.
- **Fehlermeldung aus dem vorigen Versuch.** Die beiden Dialoge blieben eingehängt und
  nur ihr Inhalt verschwand; die zuletzt gezeigte Meldung stand beim nächsten Öffnen
  wieder da. Sie werden jetzt erst beim Öffnen eingehängt und starten dadurch leer.
- **„Melden“ neben „Abmelden“.** Ein automatischer Test klickte statt der Freigabe den
  Logout in der Seitenleiste — Playwright sucht Namen als Teilzeichenkette, und „Melden“
  steckt in „Abmelden“. Das war ein Testfehler, kein Anwendungsfehler; die Verwechselbarkeit
  ist aber real, deshalb heißt die Schaltfläche jetzt „Periode melden“.

## Geprüft

Beide Seiten im Browser mit Testdaten: Kennzahlen nachgerechnet (149.450 € ÷ 1.224 h =
122,10 €/h; 1.093 ÷ 1.600 h = 68 % Auslastung), Diagramme gerendert, Perioden-Detail
aufklappbar, Freigabe ruft `fn_submit_period` mit der richtigen Periode. Kein seitliches
Scrollen auf sieben Seiten mal vier Breiten (320, 390, 768, 1400 px), keine
Konsolenfehler.

Die Arbeitszeitseite in 13 Schritten im Browser: Modell anlegen (36,00 h je Woche),
ändern (`7:30` → 39,50 h), unverständliche Dauer wird mit Nennung des Tages abgefangen,
Feiertagsvorschau unterscheidet Bayern und Hamburg, Übernahme zählt so viele Tage wie
angekündigt, zweiter Lauf legt nichts doppelt an, Jahr löschen setzt zurück,
Abwesenheit anlegen/löschen, Ende vor Beginn wird abgefangen. Anschließend elf Seiten
mal vier Breiten ohne seitliches Scrollen und ohne Konsolenfehler.

Die Datenbankseite gegengeprüft: dieselben Anweisungen, die PostgREST erzeugt, in einer
Transaktion als angemeldeter Benutzer ausgeführt und wieder zurückgerollt. Der Import
legt zwei Tage an, der zweite Lauf keinen weiteren. Die Woche 01.–07.01.2026 ergibt bei
Mo–Fr je 8 h zunächst 1.920 statt 2.400 Minuten — Neujahr fällt auf den Donnerstag —
und nach einem Urlaubstag am Freitag 1.440. Damit rechnet die Sollzeit Feiertage und
Abwesenheiten nachweislich heraus.

Das Wiederöffnen in beiden Schichten: in der Datenbank 14 Zusicherungen (Status, Summen,
Zähler, Protokolleintrag mit Grund und altem Stand, aufgetauter Satz, der Eintrag ist
danach wirklich wieder änderbar, erneutes Melden mit der berichtigten Summe, drei
Protokolleinträge, und die abgerechnete Periode wird abgelehnt); in der Oberfläche neun
Browserschritte auf vier Breiten, darunter die Gegenprobe, dass ohne Grund `null` statt
eines leeren Textes an die Datenbank geht.

Nicht geprüft: das Verhalten gegen die echte API im Browser. Die Browsertests mocken
`/rest/v1/**`; Vertragsfehler zwischen App und PostgREST — eine Spalte, die es nicht
gibt — bleiben darin unsichtbar. Deshalb der SQL-Gegentest oben und die
Spaltenprüfung in `supabase/tests/10_schema_test.sql`.

## Nachtrag: Arbeitspakete

Projekt und Tätigkeitsart sagten bisher nicht, **woran** gearbeitet wurde. Genau darauf
sollen später Budgets und Auswertungen laufen, deshalb ist das Arbeitspaket eine eigene
Tabelle am Projekt und kein Textfeld an der Buchung.

Die Tätigkeitsart bleibt daneben bestehen — sie beschreibt die **Art** der Arbeit
(Beratung, Reisezeit) und trägt die Satzlogik, das Arbeitspaket den **Gegenstand**. Ein
Reisetag zum Paket „Schulung" ist beides zugleich, deshalb sind es zwei Felder und nicht
eines.

**Die Regel, die in der Datenbank sitzt:** Ein Arbeitspaket muss zum Projekt der Buchung
gehören. Ein fremdes wäre eine stille Fehlbuchung, die erst in der Auswertung auffiele.
`fn_assert_work_package_fits()` prüft das, und die beiden Vorbereitungs-Trigger rufen es
auf — damit greift die Regel auf jedem Schreibweg, auch bei einem direkten API-Aufruf.
Zeiten *und* Spesen tragen das Feld; ein Budget, das die Spesen ausließe, wäre nur die
halbe Wahrheit.

**Die Rasterzeile bekommt ein drittes Merkmal.** `rowKey` besteht jetzt aus Projekt,
Tätigkeitsart *und* Arbeitspaket. Ohne das fänden zwei Buchungen auf verschiedene Pakete
in derselben Zelle zusammen und ließen sich dort nicht mehr auseinanderhalten.

### Budget je Arbeitspaket

Beide Budgets sind optional und lassen sich einzeln oder gemeinsam setzen: **Stunden**,
**Betrag** oder beides. Steht keines da, zeigt die Liste nur den Verbrauch.

**Der Stand zählt über die gesamte Laufzeit**, nicht je Jahr — anders als die Projektampel
in den Auswertungen, die dem gewählten Jahr folgt. Ein Arbeitspaket läuft, bis es fertig
ist; ein Budget, das im Januar von vorn begänne, wäre keines.

`v_work_package_budget` legt Stammdaten und Verbrauch in einen Zug. Zwei getrennte
Abfragen wären zwei Zeitpunkte und könnten sich widersprechen. Das Honorar entsteht mit
demselben Ausdruck wie in `v_time_entries_full`, eingefrorener Satz zuerst — sonst
zeigten Budget und Auswertung verschiedene Zahlen für dieselbe Zeit.

**Weiterberechnete Spesen stehen daneben, nicht im Honorar.** Ob sie ein Budget belasten,
ist eine kaufmännische Frage; die Sicht führt sie als eigene Spalte mit, statt sie still
für den Nutzer zu entscheiden.

Die Budgetampel ist von den Auswertungen nach `components/ui/BudgetBadge.tsx` gewandert —
sie wird jetzt an zwei Stellen gebraucht, und eine zweite Kopie wäre der Anfang zweier
Formensprachen.

Die Auswahl erscheint nur, wenn das Projekt überhaupt gegliedert ist. Wer keine Pakete
anlegt, merkt von der ganzen Sache nichts.

**Geprüft:** neun Datenbankzusicherungen (Kürzel je Projekt eindeutig, dasselbe Kürzel in
einem anderen Projekt erlaubt, die Sicht führt Kürzel und Name, ein fremdes Paket wird
beim Anlegen *und* beim Ändern abgelehnt, ohne Paket geht es weiterhin, ein bebuchtes
Paket lässt sich nicht löschen) und elf Browserschritte auf vier Breiten — darunter die
Gegenprobe, dass ein Projekt ohne Pakete die Auswahl gar nicht erst zeigt und dass ohne
Auswahl `null` statt eines leeren Textes gesendet wird.

**Beim Bauen gefunden.** Zwei Dinge, die der Test zeigte und ein Blick nicht:

- Die Sicht führte anfangs keine `description`. Die Oberfläche bearbeitet ein Paket
  direkt aus ihr heraus — ein Speichern hätte die Beschreibung stillschweigend geleert.
  Jetzt steht sie in der Sicht, und die Spaltenzusicherung im Schematest hält das fest.
- Die Prozentzahl der Ampel rechnete `(used / budget) * 100`. Bei genau 127,5 % liefert
  das im Binärformat 127,49999… und rundet auf 127 ab. Erst multiplizieren, dann teilen.
  Die Projektampel hatte denselben Fehler und ist mit derselben Zeile behoben.

## Nachtrag: Dunkler Modus, Konto und Passwort

### Der dunkle Modus ist kein Umdrehen

Alle Farben laufen jetzt über Variablen in `src/index.css`: heller Satz unter `:root`,
dunkler unter `:root[data-theme='dark']`. Die Tailwind-Klassen in den Bauteilen heißen
unverändert `bg-ink-50`, `text-ink-800` — 415 Fundstellen mussten dafür nicht angefasst
werden.

Die dunklen Werte sind **eigene Stufen, keine gespiegelten**. Geprüft statt geschätzt:

- Jeder Textton hält auf der Kartenfläche `#1a2129` mindestens 4,5:1 — der gedämpfteste
  (`ink-400`) kommt auf 4,68:1.
- Die Diagrammfarben sind die dunklen Stufen derselben zwei Farbtöne (`#3987e5` /
  `#d95926`) und bestehen gegen diese Fläche Helligkeitsband, Chroma-Untergrenze,
  Farbsehschwächen-Abstand (ΔE 26,8) und Kontrast.

Drei Tokens kamen dazu, weil die alten Annahmen dunkel nicht mehr tragen:

| Token | Warum |
|---|---|
| `surface` | `bg-white` wäre im dunklen Modus eine Leuchtfläche (22 Fundstellen) |
| `overlay` | der Dialogschleier war `ink-900` — dunkel die *hellste* Farbe, also ein weißer Schleier |
| `on-strong` | Weiß auf dem hellen Akzent hätte nur 2,9:1; dunkel steht dort fast-Schwarz |

**Beim Bauen gefunden.** Der Testlauf misst jeden sichtbaren Text gegen den Grund, der
tatsächlich unter ihm liegt — alle Ebenen übereinandergelegt. Er fand drei Stellen, die
schon im hellen Modus grenzwertig waren und dunkel unbrauchbar wurden: die
Wochenend-Kopfzeile, das Schloss der gesperrten Zelle und der Gedankenstrich für „nichts
erfasst", alle bei 1,7:1. Das Wochenende erkennt man jetzt an der getönten Spalte statt
an blasser Schrift.

Zweimal hat sich dabei die *Messung* geirrt, nicht die App: Chromium meldet
`color-mix`-Farben als `oklab(…)`, und ein Ziffern-Auslesen macht daraus Unsinn. Seitdem
läuft jede Farbe durch ein Canvas, bevor sie verglichen wird.

### Konto

`/konto` trägt Darstellung, Passwort und Abmelden. Die Wahl der Darstellung liegt
**doppelt**: in `app_settings` — dort ist sie die Wahrheit und gilt auf allen Geräten —
und in `localStorage`, damit ein kurzes Skript in `index.html` sie setzen kann, bevor
React läuft. Ohne das blitzt beim Start die helle Fassung auf.

### Passwort

Supabase hängt es an denselben Benutzer, der bisher nur den Anmeldelink hatte. Der Link
funktioniert weiter — das Passwort ist ein zweiter Weg hinein, kein Ersatz, und der Link
bleibt der Ausweg bei einem vergessenen Passwort. Genau das steht auch im Dialog.

Die Anmeldeseite zeigt zuerst Passwort und daneben den Weg über den Link. Ein falsches
Passwort erklärt beides in einem Satz, statt „Invalid login credentials" zu zeigen.

## Nachtrag: „Nach Steuern" neben dem Honorar

Das Honorar sagt, was der Kunde zahlt. Was davon bleibt, stand nirgends. Neben dem
Honorar steht deshalb jetzt der Betrag **nach Steuern** — im Wochenkopf der Zeiten und
als Kennzahl in den Auswertungen.

Der Einkommensteuersatz ist eine persönliche Angabe und liegt im **Konto**, nicht am
Kunden: in `app_settings` unter `income_tax_percent`, wie schon die Wahl der Darstellung.
Ohne eigene Angabe gelten 42 % — ein Standard statt einer Leerstelle.

Gerechnet wird in der Datenbank (`fn_income_tax_percent()`, `fn_net_revenue()`); die
Sichten führen das Ergebnis als `net_amount` beziehungsweise `fees_net`. Anders als der
Stundensatz ist der Steuersatz **nicht historisiert**: er bewertet nicht die Leistung von
damals, sondern schätzt, was heute übrig bleibt.

### Beim Bauen gefunden

- **Die fehlende Spalte wurde zu 0,00 €.** Nach dem Ausrollen stand im Wochenkopf
  „Honorar 1.817,50 €" und daneben „0,00 €". Ursache war keine Rechenfehler, sondern ein
  Zeitversatz: Vercel hatte das Frontend, die Datenbank hatte die Migration noch nicht.
  PostgREST antwortete fehlerfrei — nur ohne `net_amount` —, und `Number(e.net_amount ?? 0)`
  machte daraus eine saubere Null. Eine Zahl, die aussieht wie ein Ergebnis, ist schlimmer
  als ein Gedankenstrich: Sie lädt zum Weiterrechnen ein.

  Das ist derselbe blinde Fleck wie bei den unsichtbaren Zeiten: Ein Vertragsbruch
  zwischen App und Datenbank sieht im Browser aus wie ein leeres Ergebnis. Der Mock in den
  Tests merkt ihn nicht, und die Spaltenzusicherung im Schematest prüft die *Migration*,
  nicht die *ausgerollte* Datenbank.

  Jetzt summiert `sumOrNull()` und liefert `null`, sobald ein Wert fehlt; die Anzeige
  macht daraus einen Gedankenstrich und lässt den erklärenden Hinweis weg. Mit
  Regressionstest, der einmal absichtlich rot war.

  Für den nächsten Fall bleibt: **Migration vor dem Frontend ausrollen** — `npm run
  db:push` gehört vor den Push nach `main`, nicht danach.

## Nachtrag: Honorar je Zeitraum im Verlauf

Der Verlauf zeigt wahlweise Stunden oder Honorar — ein Umschalter über dem Diagramm,
ein Feld in voller Höhe. Der Hinweis an der Säule nennt immer beide Zahlen, sodass für
den Vergleich eines einzelnen Zeitraums niemand umschalten muss.

**Zwei Wege wurden verworfen.** Eine zweite Y-Achse ist der häufigste Fehler bei genau
dieser Aufgabe: Stunden und Euro haben keinen gemeinsamen Maßstab, und zwei Skalen in
einem Feld lassen sich immer so legen, dass die Säulen zusammenlaufen — die Aussage käme
aus der Skalierung, nicht aus den Daten. Zwei Felder übereinander waren der zweite
Versuch und standen kurz im Code: fachlich sauber, aber jedes Feld bekam nur die halbe
Höhe und war schlechter zu lesen als eines. Ein Umschalter kostet einen Klick und ist
beides nicht.

Das Blau ist in beiden Ansichten dasselbe, weil es dieselbe Sache zeigt: die abrechenbare
Arbeit, einmal in Stunden und einmal bewertet. Interne Zeit hat kein Gegenstück in Euro
und erscheint nur in der Stundenansicht; die Honoraransicht hat eine Reihe und kommt
ohne Legende aus.

Der Umschalter ist `Segmented` in `components/ui/` — derselbe Baustein trägt jetzt auch
die Darstellungswahl im Konto, die dieselbe Formensprache bisher als eigene Klassenwelt
im Bauteil stehen hatte.

Nebenbei bekamen beide Achsen ein glattes Raster (1 · 1,5 · 2 · 2,5 · 3 · 4 · 5 · 6 · 8
mal Zehnerpotenz). Vorher lieferte `ceil(max / 4)` Schritte wie 78 — bei Stunden gerade
noch lesbar, bei Beträgen stünden dort Zahlen wie 19.837. Die Leiter ist bis 8 fein
genug, dass die Säulen im Honorarfeld mit seinen nur zwei Schritten nicht auf halber
Höhe enden.

### Beim Bauen gefunden

- **Ein leerer Zeitraum schrieb „0, 0, 1, 1, 1" an die Achse.** Das Raster rechnete
  `max / 4` und kam bei fehlenden Daten auf Viertelschritte, die als ganze Zahlen
  formatiert dreimal dieselbe Ziffer ergaben. Jetzt ist der Schritt mindestens 1.

## Nachtrag: Restbudget beim Erfassen

Arbeitspakete stehen in der Erfassung jetzt **alphabetisch nach Kürzel** — in der
Zeilenauswahl des Rasters, im Erfassungsdialog und im Kopf des Tageseintrags. In den
Stammdaten bleibt `sort_order` maßgeblich: dort ist die Reihenfolge eine Aussage über die
Gliederung des Projekts, beim Buchen sucht man dagegen ein Kürzel und erwartet es dort,
wo das Alphabet es hinlegt. Sortiert wird mit `numeric`, sonst stünde AP10 vor AP2.

Wo ein Paket ein Budget hat, steht das **Restbudget neben dem Gesamtbudget** — in der
Wochenliste (Raster am Laptop, Tagesliste am Telefon) und im Kopf des Tageseintrags.
„58 h / 120 h“; bei zwei Budgets zwei Angaben. Verbraucht wird gegen dieselben
Größen wie in den Stammdaten: erfasste Zeit gegen das Stundenbudget, Honorar gegen das
Betragsbudget — zwei Ansichten derselben Zahl dürfen nicht verschieden rechnen.

Die Ampel `BudgetBadge` beantwortet dieselbe Frage in Prozent und bleibt den Stammdaten
vorbehalten. Beim Buchen zählen die Stunden selbst, deshalb steht in `BudgetStand`
**gebucht vor gesamt**, und zwar nackt: `2 h / 16 h`. Die Worte um die Zahlen brachen in
der schmalen Projektspalte um und kosteten eine Zeile je Paket. Der Zustand hängt
trotzdem nicht allein an der Farbe — die Zahlen sagen ihn: gleich ist aufgebraucht,
größer ist überschritten. Der volle Satz steht als `title` daneben, für den Zeiger und
für die Vorlesehilfe.

Ein Paket **ohne** Budget zeigt nur die gebuchte Zeit (`PMO  12 h`). Dass auf einem Paket
schon zwölf Stunden liegen, ist beim Buchen die häufigere Frage als die nach einem
Budget, das die meisten Pakete gar nicht haben; `12 h / –` wäre ein Platzhalter für
nichts. Gezählt wird über die gesamte Laufzeit des Pakets, nicht über die angezeigte
Woche — ein Budget kennt keine Woche, und die Frage „wie viel ist da schon drauf“ auch
nicht.

Beide lesen dieselbe Funktion `budgetStufe()` mit vier Stufen: *im Rahmen*, *knapp* (ab
vier Fünfteln, gelb), *aufgebraucht* (gelb) und *überschritten* (rot). Aufgebraucht trägt
dasselbe Gelb wie knapp — es ist die letzte Warnung vor der Grenze, nicht ihre
Überschreitung.

### Beim Bauen gefunden

- **Ein punktgenau aufgebrauchtes Budget stand als Verstoß da.** Beide Bausteine warfen
  „voll“ und „zu voll“ in einen Topf (`share >= 1` → rot, „überschritten“). Ein Paket mit
  2,00 von 2,00 h ist aber eine Punktlandung: sauber geplant, sauber geliefert. Rot und
  „überschritten“ machten daraus eine Anschuldigung — und zwar in der Ampel der
  Stammdaten *und* im Restbudget der Erfassung, weil die Regel an beiden Stellen einzeln
  stand. Jetzt steht sie einmal in `budgetStufe()`, und aufgebraucht ist gelb.

  Die Toleranz dieser Stufe ist die Genauigkeit der Anzeige: Was auf `0,00` gerundet
  wird, ist aufgebraucht. Sonst stünde bei einem Rest von −0,001 h „Rest −0,00 h ·
  überschritten“ — eine Ansage über nichts, entstanden aus einem Binärbruch.
- **Der Budgetstand wäre nach dem Buchen stehen geblieben.** Die Sicht
  `v_work_package_budget` hängt an den Zeiteinträgen, aber das Speichern eines Eintrags
  verwarf nur `time-entries` und `reporting-periods`. Das Restbudget hätte den Stand von
  vor der Buchung gezeigt — ausgerechnet in dem Moment, in dem jemand hinsieht. Kein
  Test hätte das gefunden: die Zahl war richtig berechnet, nur zu alt.

## Nachtrag: Standard-Tätigkeitsart

Fast jeder Zeiteintrag trägt dieselbe Art. Eine Art kann deshalb in den Stammdaten die
Marke **Standard** tragen und steht dann überall vorbelegt, wo ein Zeiteintrag entsteht:
im Erfassungsdialog, im Timer und in der Zeile, die man dem Wochenraster hinzufügt.

Höchstens eine Art trägt sie, und diese Regel steht in der Datenbank: Ein Trigger nimmt
sie der bisherigen ab, sobald eine andere sie bekommt — ein Teilindex
(`activity_types_one_default`) sichert sie gegen den Fall, den kein Trigger sieht, zwei
gleichzeitige Transaktionen. Zwei Aufrufe aus der Oberfläche wären hier falsch gewesen:
zwischen „alte abwählen“ und „neue setzen“ gäbe es einen Moment ohne Standard, und
bricht der zweite Aufruf ab, bleibt es dabei.

Eine inaktive Art verliert die Marke automatisch. Sie steht in keiner Auswahlliste — ein
Standard, den man nirgends sieht und nirgends abwählen kann, wäre eine Falle.

In der Oberfläche steht die Wahl auf `null`, solange niemand etwas ausgewählt hat; erst
daraus wird der Standard gelesen. Ein fester Anfangswert per `useState` wäre leer
geblieben, wenn die Tätigkeitsarten erst nach dem ersten Rendern eintreffen — der Timer
steht dauerhaft auf der Seite und rendert genau einmal zu früh.

## Nachtrag: Eine Rasterzeile je Projekt, aufklappbar

Das Wochenraster führte eine Zeile je **Kombination** aus Projekt, Arbeitspaket und
Tätigkeitsart. Ein Projekt mit vier Paketen belegte damit vier Zeilen mit je einer Zahl
darin, und die Woche geriet zur Liste — genau das, was ein Raster vermeiden soll.

Jetzt ist eine Zeile ein **Projekt**. Ein Klick in eine Zelle klappt die Zeile auf: direkt
darunter stehen die Einträge dieses Tages, nach Arbeitspaket und Tätigkeitsart gruppiert,
jede Gruppe mit ihrem Kopf, ihrem Restbudget und ihren Zeilen. Vorher stand dafür eine
Tafel unter dem Raster — weit weg von der Zahl, aus der sie stammte.

Die Zeilenbeschriftung nennt die Kürzel, auf die diese Woche gebucht wurde — **jedes als
Plättchen**, mit seinem Restbudget darin, wenn es eines hat. Sie stehen in einem
umbrechenden Streifen: ein Plättchen mit Zahlen füllt die Spalte ohnehin allein, zwei
kurze Kürzel passen nebeneinander. Die Anordnung ergibt sich damit aus der Breite und
muss nicht entschieden werden.

Drei Zwischenstufen führten dahin: erst standen die Reste als eigene Zeilen unter der
Kürzelliste — und damit jedes Kürzel zweimal in derselben Spalte; dann alles in einer
Kette, in der zwischen Kürzeln und Zahlen kaum zu sehen war, wo ein Paket aufhört; dann
Plättchen nur für die mit Budget, was zwei Formen in dieselbe Zeile stellte, ohne dass
der Unterschied etwas bedeutete.

**Was aus dem Umbau folgte, ohne dass es jemand verlangt hätte:**

- Die Tafel `CellPanel` entfällt ersatzlos; der `EntryEditor` steht jetzt in der
  aufgeklappten Zeile und im Dialog des Telefons — weiterhin derselbe Editor in zwei
  Rahmen.
- `onRetarget` entfällt. Es hielt die Auswahl im Raster nach, wenn ein Eintrag das
  Arbeitspaket wechselte und damit in eine andere Rasterzeile wanderte. Zeilen sind jetzt
  Projekte: ein Paketwechsel bewegt nichts mehr.
- Der Stundensatz hängt an der Tätigkeitsart der Gruppe, und `useRateFor` lässt sich
  nicht in einer Schleife aufrufen. Jede Gruppe ist deshalb eine eigene Komponente —
  was nebenbei Entwürfe und Fehlermeldungen dort hält, wo sie entstanden sind.
- „Zeile hinzufügen" gibt es je Gruppe (dasselbe Paket) und einmal darunter als „Eintrag
  hinzufügen" (Paket und Art wählbar). Ohne das zweite käme man an ein Paket, auf das an
  diesem Tag noch nichts gebucht ist, gar nicht heran.
- Eine getippte Dauer landet in der einzigen Gruppe des Tages — wie bisher, als die Zelle
  selbst die Gruppe war. Bei mehreren oder keiner wäre jede Wahl geraten: dann öffnet
  sich ein neuer Eintrag, in dem Paket und Art dabeistehen. Ein gestoppter Timer bringt
  seine eigene Tätigkeitsart mit und bekommt deshalb immer einen neuen Eintrag.
- „Zeile hinzufügen" über dem Raster wählt nur noch das Projekt.

## Nachtrag: Tagesansicht, Schnellerfassung, entrümpelter Editor

Drei Änderungen aus einer Frage — „wie stelle ich die Zeiterfassung optimal dar?" —, und
die Antwort kam aus den eigenen Daten: **534 Einträge an 131 Tagen sind 4,1 am Tag,
verteilt auf 3,4 Projekte.** Das sind 1,2 Einträge je Projekt und Tag, 531 von 534 mit
derselben Tätigkeitsart, 9 % ohne Arbeitspaket.

**Der Editor** führte je Arbeitspaket einen eigenen Block mit Kopf, Tabellenkopf und
Schaltfläche — gut 200 px für eine Zeile mit 2,00 h. Bei 1,2 Einträgen je Projekttag ist
das Paket keine Überschrift, sondern eine Spalte. Jetzt: eine Tabelle, das Paket als
erste Spalte direkt umstellbar, die Tätigkeitsart nur sichtbar, wenn es mehr als eine
aktive gibt.

**Die Tagesansicht** ist der neue Startpunkt: eine Wochenleiste mit sieben Tagesummen,
darunter eine Erfassungszeile, darunter der Tag nach Projekten. Das Wochenraster ist
einen Klick entfernt (`Segmented` „Tag | Woche") und dient dem, wofür ein Raster gut ist:
Prüfen und Melden. Auf dem Telefon ist die Tagesansicht dieselbe — nur schmaler.

**Die Erfassungszeile** macht aus vier Schritten einen: Projekt und Paket bleiben nach
dem Speichern stehen, Dauer und Beschreibung werden leer, der Fokus springt zurück auf
die Dauer. Vier Einträge sind viermal tippen, Tab, tippen, Enter.

### Beim Bauen gefunden

- **Die Sperrlogik stand zweimal da.** Das Raster rechnete sich die gemeldeten Tage
  selbst aus; die Tagesansicht hätte dieselbe Schleife ein zweites Mal gebraucht. Zwei
  Ansichten, die verschieden antworten, hätten ein Eingabefeld angeboten, wo die andere
  ein Schloss zeigt. Jetzt steht sie einmal in `lock.ts` — die Sperre selbst bleibt ein
  Trigger in der Datenbank, das hier ist nur, was die Oberfläche vorwegnimmt.
- **`ref` fehlte am `Input`.** Für den Fokussprung nach dem Speichern. Unter React 19
  reicht dafür ein `ref` in den Props; der Baustein hat es jetzt im Typ.

## Nachtrag: Zeitnehmer als Wahl, Seitenleiste steht fest

Der Zeitnehmer ist jetzt eine Wahl im Konto und standardmäßig **aus**. Wer nach
Feierabend einträgt, was er gemacht hat, braucht keine laufende Uhr — für den war sie
eine Auswahl mehr über dem Raster. Der Schalter liegt in `app_settings` unter
`show_timer`, wie Darstellung und Steuersatz; eine Migration braucht es dafür nicht,
der Schlüssel-Wert-Speicher nimmt ihn ohne Schema-Änderung auf.

### Beim Bauen gefunden

- **Das Konto war von den Zeiten aus nicht erreichbar.** Die Seitenleiste war nicht
  fixiert: `min-h-full` ließ sie mit dem Dokument wachsen, und ihr unterer Block — die
  Adresse und der Kontolink — stand damit am Ende des *Dokuments*, nicht des Bildschirms.
  Auf einer kurzen Seite fiel das nicht auf, auf der Zeitenseite mit ihrem langen Raster
  stand der Link bei 2098 px, also gut anderthalb Bildschirmhöhen unterhalb des
  Sichtbaren. Gemessen vorher und nachher: 2098 px → 752 px, unabhängig von der
  Scrollposition.

## Nachtrag: Wochenendzuschlag als Regel statt als Satz je Projekt

Ein abweichender Satz entstand bisher ausschließlich als eigener Eintrag in der
Satzhistorie: „Reisezeit zu 70 €" ist ein `project_rates`-Satz mit Tätigkeitsart. Für
einen ausgehandelten Satz ist das genau richtig — er gehört zu *diesem* Kunden.

Für einen Zuschlag, der überall gleich gilt, ist es der falsche Ort. Im echten Datenstand
lag die Tätigkeitsart „Wochenende" auf drei Einträgen, aber nur **eines von zehn
Projekten** trug einen Wochenendsatz. Bei den anderen neun fällt `fn_rate_for` still auf
den Normalsatz zurück — und still ist das Problem: Die Oberfläche warnt nur, wenn *gar
kein* Satz gefunden wird. Ein gefundener, aber falscher Satz sieht aus wie ein richtiger.
Der Zuschlag wäre unbemerkt verlorengegangen, Buchung für Buchung.

Die Tätigkeitsart trägt deshalb einen **Faktor** auf den allgemeinen Projektsatz.
„Wochenende +50 %" ist damit eine Angabe an einer Stelle statt einer je Projekt. Die
Rangfolge bleibt, wie sie war, und der Faktor ordnet sich darunter ein:

1. Satz für genau diese Tätigkeitsart → gilt unverändert
2. allgemeiner Projektsatz → mal Faktor der Tätigkeitsart

**Ein ausgehandelter Satz wird nie nachträglich multipliziert.** Wer für ein Projekt
„Reisezeit 70 €" vereinbart hat, bekommt 70 €, auch wenn die Art daneben einen Faktor
trägt. Andernfalls schriebe eine Änderung an einer Tätigkeitsart stillschweigend Verträge
um. Ebenso bleibt ein eingefrorener Satz unberührt: Was gemeldet wurde, bleibt, wie es
gemeldet wurde.

Die Grenzen des Feldes sind gegen den Tippfehler gebaut, der hier am nächsten liegt: 150
statt 1,5 — ein Faktor, der aus 125 € 18.750 € machen würde. Und echt größer als null,
weil ein Faktor von 0 eine abrechenbare Zeit zu 0,00 € ergäbe: genau die stille Null, die
die Satzwarnung beseitigen sollte. Wer nicht berechnen will, nimmt das Kennzeichen
„abrechenbar" weg — das sagt dasselbe, aber sichtbar.

**Geprüft:** zwölf Datenbankzusicherungen, darunter die Gegenprobe, dass der eigene Satz
den Faktor schlägt und dass ein später gesetzter Faktor eine gemeldete Periode nicht mehr
erreicht. Einmal absichtlich gebrochen: Ignoriert `fn_rate_for` den Faktor, fällt der Test
mit „Faktor 1,5 macht aus 140 EUR 210 EUR" um.

## Nachtrag: Summen je Kunde, und zwei Kennzahlen weniger

Der Nutzer bucht an einem Tag für mehrere Kunden parallel: 104 der 133 erfassten Tage
tragen zwei Kunden, 88 Tage liegen über zehn Stunden. Je Kunde bleibt alles im Rahmen —
7,2 h im Schnitt, höchstens 12 h.

Damit war die Tagessumme die falsche Zahl. „16,00 h" ist ein Alarm oder eine
Selbstverständlichkeit, je nachdem, ob sie auf einen oder auf zwei Kunden entfällt; die
Frage, wegen der man hinsieht, beantwortet erst „HSO 8 · SYS 8". Drei Stellen zeigen das
jetzt:

- **Die Wochenleiste** listet unter der Tagessumme die Anteile je Kunde — erst ab 640 px.
  Schmal hat ein Feld 44 px, und darin steht „HSO 7,5" nicht mehr nebeneinander.
- **Unter der Tagesüberschrift** steht dieselbe Aufteilung in voller Breite, also auch auf
  dem Telefon. Die Blöcke darunter sind nach Kunde gruppiert.
- **Das Wochenraster** sortiert nach Kunde und trägt je Kunde eine Zwischensummenzeile mit
  allen sieben Tagen. Gemeldet wird je Kunde, und das Raster ist die Ansicht, in der
  geprüft und gemeldet wird — Projekte desselben Kunden auseinandergerissen zu sehen half
  dabei nie.

Die Rechnung steht **einmal** in `features/time-entry/kunden.ts`, aus demselben Grund, aus
dem die Sperrlogik in `lock.ts` steht: Dieselbe Rechnung an drei Stellen ist dreimal
dieselbe Gelegenheit, sie verschieden zu machen.

**Weggefallen ist, was keine Aussage mehr hatte.** Es gibt kein internes Projekt und
keinen nicht abrechenbaren Eintrag — erfasste und abrechenbare Zeit sind dieselbe Zahl.
Deshalb:

- Das Häkchen „abrechenbar" verschwindet aus jeder Editorzeile, solange keine Zeile davon
  abweicht. Sobald eine abweicht, steht es wieder da; ohne das ließe sich der Ausnahmefall
  nicht zurücknehmen. Bei einem nicht abrechenbaren Projekt steht statt der Spalte ein
  Satz unter der Tabelle — sonst gäbe es im Editor keinen Hinweis mehr darauf.
- „100 % der erfassten Zeit" unter der Kachel *Abrechenbar* steht nur noch bei einem
  Anteil unter 100 %.
- Der Verlauf zeigt Legende und interne Reihe nur, wenn interne Zeit vorkommt. Vorher
  stand über einem einfarbigen Feld „aufgeteilt in abrechenbar und intern" und daneben
  eine Legende mit einer Farbe, die nie auftauchte.
- Dafür nennt „Honorar je Kunde" jetzt den **Anteil**: Ein Kunde, der vier Fünftel des
  Jahres trägt, ist aus den Balkenlängen zu ahnen, aus „81 %" aber abzulesen.

**Was das kostet:** Einen Eintrag auf einem abrechenbaren Projekt einzeln als intern zu
buchen, geht in der Oberfläche nicht mehr. Der Weg über das Projekt (`is_billable`) bleibt.
Sollte der Einzelfall doch auftreten, holt ihn ein Häkchen an einer beliebigen Zeile
zurück — nur anlegen lässt er sich nicht mehr.

## Nachtrag: Leistungsnachweis aus der Periode

Die Meldung eines Monats hieß bisher: auf die Exportseite wechseln, den Zeitraum von Hand
nachbauen, den Kunden wählen, das Profil wählen, Datei erzeugen. Vier Schritte, bei denen
sich drei vertippen lassen — und jeder davon macht die Datei still falsch, ohne dass etwas
rot wird.

An der Periode steht das alles längst fest. Sie trägt jetzt deshalb einen Knopf
**Nachweis**, der die Datei direkt erzeugt: Positionen und Spesen der Periode, Spalten aus
dem Export-Profil dieses Kunden (sonst die Vorgabespalten), dazu ein Kopfbereich mit
Kunde, Zeitraum und Meldestand. Welches Profil greift, steht im `title` des Knopfes —
sonst wäre es eine stille Wahl.

Der Kopf bekommt **nur der Nachweis**, nicht der freie Export: Wer die Datei als Vorlage
weiterverarbeitet, erwartet die Spaltenüberschriften in Zeile 1, und fünf Zeilen davor
würden jede Weiterverarbeitung verschieben.

Die Zeilen kommen über dieselbe Abfragebeschreibung, aus der auch der aufgeklappte
Periodenbereich liest (`periodEntriesQuery`). War die Periode schon offen, kostet der
Nachweis keine Anfrage; zwei getrennte Abfragen wären zwei Zeitpunkte und könnten sich
widersprechen.

**Geprüft:** Die erzeugte Datei wurde ausgepackt und gelesen — Kopf in den Zeilen 1 bis 4,
Leerzeile, Tabellenkopf in Zeile 6, Daten und Summe darunter, eingefroren bis Zeile 6. Die
Datumsseriennummer 46268 entspricht dem 03.09.2026, also kein Zeitzonenversatz.

### Beim Bauen gefunden

- **Der Migrationsstand passte nicht zum Repository.** Die Versionen in
  `supabase_migrations.schema_migrations` wichen von den Dateinamen ab, und eine Migration
  (`move_btree_gist_to_extensions_schema`) existierte nur in der Datenbank. Ursache:
  Eingespielt wurde über das Supabase-MCP, das eigene Zeitstempel vergibt. Inhaltlich
  stimmten Sichten, Trigger und Funktionen überein — `supabase db push` hätte aber alle
  vierzehn Dateien für unangewendet gehalten und wäre gescheitert. Kein Test hätte das
  gefunden: `scripts/test-db.sh` spielt die Dateien in eine frische Datenbank ein und
  sieht die Versionstabelle der echten nie.

  Behoben durch Umbenennen der Dateien auf die Versionen der Datenbank; der Inhalt blieb
  unberührt. Die fehlende Migration steht jetzt als Datei da, mit Bedingung: Liegt
  `btree_gist` schon im richtigen Schema, gibt es nichts zu tun. Ein unbedingtes `ALTER`
  bräche jeden Lauf gegen eine frische Datenbank mit „is already in schema extensions".

- **Ein regulärer Ausdruck, der Zeilen verschob.** Beim Prüfen der erzeugten Datei ordnete
  mein Skript dem Tabellenkopf Zeile 5 statt 6 zu: `<row r="5"/>` ist selbstschließend,
  und der Ausdruck las den Inhalt der *nächsten* Zeile dazu. Das ist derselbe Fehler wie
  in Phase 4, dort bei `<c …/>`. Ein Fehler im Prüfmittel, nicht in der Anwendung — aber
  einer, der beinahe zu einer Korrektur an korrektem Code geführt hätte. Nachgeprüft mit
  einem echten XML-Parser statt mit Mustersuche.
