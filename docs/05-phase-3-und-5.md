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
