# Phase 2a – Zeiterfassung: Umsetzungsbericht

Stand: 2026-09-06

## Was entstanden ist

Die App ist ab hier im Alltag nutzbar. Das Wochenraster ist die Startseite; die
Übersicht ist auf `/uebersicht` gerückt.

### Wochenraster

Matrix aus Zeilen (Projekt + Tätigkeitsart) und den sieben Wochentagen. Zeilen entstehen
aus dem, was in der Woche erfasst wurde, und lassen sich ergänzen — einzeln oder als
Übernahme der Projektzeilen aus der Vorwoche (die Struktur, nicht die Stunden).

Die Zelle ist ein echtes Eingabefeld. Was beim Verlassen passiert, hängt davon ab, was
dort schon steht:

| Lage | Verhalten |
|---|---|
| genau ein Eintrag | Dauer wird direkt geändert, kein Dialog |
| leer | Dialog öffnet mit vorbelegter Dauer — die Beschreibung fehlt noch |
| mehrere Einträge | Dialog mit der Liste; ein Zähler in der Ecke zeigt die Anzahl |
| gemeldete Periode | Feld gesperrt, Schlosssymbol |

Dass ein neuer Eintrag durch den Dialog muss, ist Absicht: Die Beschreibung ist Pflicht,
weil sie die Position im Kundenreport wird. Eine Zelle, die sich ohne Text füllen ließe,
würde einen Monat später einen Report ohne Inhalt ergeben.

Dauern werden so entgegengenommen, wie Leute sie tippen: `1,5` · `1.5` · `1:30` · `90m`
· `2h`. Unverständliches wird abgelehnt statt geraten.

### Schnelleintrag

Ein Dialog mit Projekt, Tätigkeitsart, Datum, Dauer und Beschreibung — der Weg für
Nachträge zwischendurch und der einzige manuelle Weg auf dem Telefon, wo das Raster
keinen Platz hat. Erreichbar über „Erfassen“ in der Kopfzeile, über das Plus an jedem
Wochentag der Tagesliste und über das Antippen eines leeren Tages; in den beiden
letzteren Fällen mit vorbelegtem Datum.

**Nachgereicht.** Beim ersten Durchgang von Phase 2a hatte ich ihn übersehen, obwohl das
Fachkonzept ihn als einen der drei Erfassungswege und ausdrücklich als mobile Kernfunktion
nennt. Schlimmer noch: Die Tagesliste warb mit „Nutze den Timer oder den Schnelleintrag“
für etwas, das es nicht gab, und die zugehörige Schaltfläche öffnete nur das Panel zum
Hinzufügen einer Rasterzeile. Auf dem Telefon gab es damit außer dem Timer **keinen Weg,
eine Zeit zu erfassen** — gefunden hat das der Nutzer, nicht ich. Meine Prüfläufe hatten
die mobile Ansicht zwar gerendert, aber nie versucht, darin etwas zu erfassen.

### Timer und Tagesliste

Der Timer speichert den Startzeitpunkt lokal und überlebt damit ein Neuladen — einer, der
beim versehentlichen Schließen des Tabs verschwindet, ist wertlos. Beim Stoppen öffnet der
Dialog mit der gelaufenen Dauer.

Unter 640 px Breite tritt an die Stelle des Rasters eine Tagesliste: erfassen, ansehen und
korrigieren, gruppiert nach Wochentag. Jeder Tag trägt ein Plus, leere Tage laden zum
Antippen ein. Das Raster braucht Breite und bleibt dem Laptop vorbehalten, wie im
Fachkonzept §6.2 festgelegt.

### Was die Oberfläche bewusst nicht tut

Sie berechnet weder abrechenbare Minuten noch die Reporting-Periode. Beides setzt der
Trigger beim Speichern; die Oberfläche schickt nur Projekt, Datum, Dauer, Beschreibung
und das Abrechenbar-Kennzeichen. Wäre die Rundungsregel auch im Frontend implementiert,
wäre sie zweimal implementiert — und damit früher oder später zweimal unterschiedlich.

## Wochenlogik: Gegenprobe gegen die Datenbank

Die Zuordnung eines Tages zu einer Kalenderwoche muss in der Oberfläche exakt dasselbe
ergeben wie in PostgreSQL. Weicht sie ab, zeigt die App eine andere Woche an als die, in
der gemeldet wird — und das fällt erst beim Kunden auf.

`src/lib/__tests__/pg-parity.test.ts` prüft deshalb 76 Stichtage gegen Werte, die aus der
Datenbank stammen: die Jahreswechsel 2024/25 bis 2027/28 und ein Monatswechsel. Enthalten
ist der Fall, an dem naive Implementierungen scheitern — der 01.01.2027 gehört in die
KW 53 des ISO-Jahres 2026.

## Beim Bauen gefunden und behoben

- **Der Dialog zeigte eine Momentaufnahme.** Er bekam die Einträge einer Zelle als Kopie
  übergeben; nach dem Hinzufügen wäre die Liste veraltet gewesen. Jetzt bekommt er nur die
  Identität der Zelle, die Einträge werden bei jedem Rendern frisch bestimmt.
- **Seitliches Scrollen auf schmalen Schirmen.** Der fünfte Navigationseintrag machte die
  Leiste zu breit; ein Flex-Element schrumpft ohne `min-w-0` nicht unter seinen Inhalt und
  schob die ganze Seite auf. Dieselbe Ursache in der Timer-Leiste. Beides behoben und
  gegen 320, 390, 768 und 1400 px auf allen fünf Seiten nachgeprüft.
- **Ein Prüffehler auf meiner Seite:** Frühere Aufnahmen, die ich als „mobil" bezeichnet
  hatte, entstanden tatsächlich bei 1280 px — der Viewport wurde wegen eines falschen
  Parameternamens nie angewendet. Erst nach der Korrektur wurden die beiden
  Umbruchfehler oben überhaupt sichtbar.

## Nächster Schritt

Phase 2b: Reisezeit-Sätze in der Erfassung sichtbar machen, Spesenarten pflegen, Spesen
erfassen und Belege hochladen.

## Nachtrag: gespeicherte Zeiten blieben unsichtbar

Nach der Auslieferung des Schnelleintrags meldete der Nutzer, dass eine gespeicherte Zeit
nicht in der Liste erscheint. Die Datenbank zeigte: Die Einträge **waren da**, mit
zugeordneter Periode und gerundeten Minuten. Der Fehler lag in der Abfrage.

Die Oberfläche sortiert Einträge eines Tages nach ihrer Erfassungsreihenfolge:

```
order=work_date.asc,created_at.asc
```

`v_time_entries_full` führte aber kein `created_at` — die Sicht listet ihre Spalten
einzeln auf, und diese eine fehlte. PostgREST weist die **gesamte** Abfrage ab:

```
{"code":"42703","message":"column v_time_entries_full.created_at does not exist"}
HTTP 400
```

Dieselbe Zeile stand auch im Export; dessen Vorschau wäre immer leer geblieben.

**Warum es niemand bemerkt hat.** Zwei Dinge trafen zusammen. Erstens haben alle
Browsertests den REST-Endpunkt abgefangen und Daten zurückgegeben, ohne die Abfrage zu
prüfen — ein Sortierfeld, das es nicht gibt, fällt einem Mock nicht auf. Zweitens las die
Seite den Fehler der Abfrage nie aus: `useWeekEntries` liefert `error`, die Seite nahm nur
`data`. Eine gescheiterte Abfrage sah damit exakt aus wie eine leere Woche.

**Behoben:**

- `created_at` und `updated_at` in `v_time_entries_full` und `v_expenses_full` ergänzt
  (Migration `20260906180000_view_created_at.sql`).
- Beide Seiten zeigen Ladefehler jetzt an, statt sie zu verschlucken.
- Der Schematest prüft neu, dass die Sichten **alle Spalten führen, nach denen die
  Oberfläche filtert und sortiert**. Gegenprobe gemacht: Entfernt man `created_at` wieder,
  schlägt der Test mit genau dieser Meldung fehl.

Zusätzlich behoben: Das Datumsfeld stand auf schmalen Schirmen über seine Rasterspalte
hinaus. Ein `input[type=date]` bringt auf iOS eine eigene Mindestbreite mit und schrumpft
ohne `min-w-0` nicht mit — dieselbe Ursache wie bei der Navigationsleiste zuvor.

## Nachtrag: zwei Kleinigkeiten aus dem mobilen Alltag

**Kürzel statt Namen in der Tagesliste.** Die Zeile unter der Beschreibung nannte Kunde
und Projekt mit vollem Namen. Auf dem Telefon blieb davon
„HSO CRM Solutions AG · Waldmann · Arb…“ übrig — der lange Kundenname fraß den Platz und
schnitt ausgerechnet die Tätigkeitsart ab, die einen Eintrag unterscheidet. Jetzt stehen
dort die Kürzel: „HSO · WAL · Arbeit“. Im Wochenraster am Laptop bleiben die vollen Namen,
dort ist Platz.

**Kein Fokus beim Öffnen des Schnelleintrags.** Das erste Feld ist die Projektauswahl,
und `autoFocus` ließ iOS beim Öffnen sofort das Auswahlrad hochfahren, das den halben
Dialog verdeckte. Der Fokus liegt jetzt nirgends; der Dialog zeigt sich zuerst ganz.
Das Ändern eines bestehenden Eintrags springt weiterhin ins Dauer-Feld — dort ist es ein
Textfeld, kein Auswahlrad, und am Laptop ist genau das der schnelle Weg.

**Das Datumsfeld stand erneut über.** Beim ersten Mal reichte `min-w-0` — es lag damals
an der Rasterspalte. Diesmal lag es am Feld selbst: iOS gibt einem `input[type=date]` aus
dem Plattform-Aussehen eine eigene Mindestbreite und setzt sich damit über `width: 100%`
hinweg. In einer 155 px breiten Spalte reicht das nicht für „07.09.2026" plus
Kalendersymbol, und das Feld wuchs nach rechts aus dem Dialog heraus.

Zwei Ansätze, beide angewendet:

- `-webkit-appearance: none` für Datumsfelder, damit die gesetzte Breite wieder greift.
- Wichtiger: Alle Raster mit einem Datumsfeld stehen unter 640 px **untereinander** statt
  nebeneinander. Damit bekommt das Feld die volle Dialogbreite (rund 326 px bei einem
  390 px breiten Schirm), also fast das Doppelte dessen, was iOS mindestens will. Das
  hält unabhängig davon, ob der Hersteller-Kniff greift.

Betroffen waren fünf Stellen: Schnelleintrag, Spesenerfassung, Projektdialog
(Status/Beginn/Ende), Satzhistorie und beide Datumspaare der Arbeitszeitseite.

**Grenze der Prüfung.** Chromium unter Linux kennt diese Mindestbreite nicht und kann den
Fehler daher nicht nachstellen. Der automatische Test misst deshalb, was sich prüfen
lässt: jedes sichtbare Datumsfeld gegen den Rand seines Dialogs und gegen den eigenen
Platzbedarf, auf vier Breiten und in fünf Dialogen. Dass die zweite Maßnahme trägt, folgt
aus der Geometrie, nicht aus dem Testlauf.

**„Zeile" und „Vorwoche" waren mobil wirkungslos.** Beide fügen dem Wochenraster leere
Zeilen hinzu — unter 640 px gibt es das Raster aber nicht, dort steht die Tagesliste. Der
einzige sichtbare Effekt war, dass nach einem Klick der Leerzustand verschwand und eine
leere Karte zurückblieb. Beide Schaltflächen sind jetzt unter 640 px ausgeblendet, und der
Leerzustand nennt den Weg über die Vorwoche nur noch als Laptop-Möglichkeit.

## Nachtrag: 0,00 € ohne Erklärung

Gemeldet als „Zeiten aus einem Arbeitspaket laufen nicht in die Honorar-Summen". Der
Verdacht traf nicht zu — das Arbeitspaket ist an der Bewertung gar nicht beteiligt.
Nachgesehen im echten Datenstand: Die beiden bewerteten Einträge trugen die
Tätigkeitsart `WORK`, der unbewertete keine. Beide Sätze des Nutzers hängen an genau
dieser Tätigkeitsart; ein allgemeiner Projektsatz fehlt. `fn_rate_for` findet für die
Kombination *ohne* Tätigkeitsart deshalb nichts, und ohne Satz sind 0,00 € rechnerisch
richtig.

**Der Fehler lag trotzdem in der App:** Sie hat eine abrechenbare Zeit ohne Satz
kommentarlos gespeichert und still mit null bewertet. Aus Sicht des Nutzers sieht das aus
wie „nichts verdient", nicht wie „ein Satz fehlt". Drei Stellen sagen es jetzt:

- **Vor dem Speichern.** Beide Erfassungsdialoge fragen über `fn_rate_for` — dieselbe
  Funktion, die auch Trigger und Auswertungssicht benutzen; die Oberfläche rechnet nichts
  nach, sie fragt. Fehlt ein Satz, steht die Folge im Dialog, bevor gespeichert wird.
- **In der Wochenansicht.** Ein Hinweis über der Liste zählt die betroffenen Einträge,
  nennt Projekt und fehlende Tätigkeitsart und erklärt die Ursache in einem Satz: der Satz
  hängt an Projekt *und* Tätigkeitsart.
- Beides in Bernstein, nicht in Rot — es ist keine Störung, sondern eine Folge, die man
  kennen muss.

Die Warnung erscheint nur bei **abrechenbaren** Projekten. Bei interner Zeit sind 0,00 €
richtig und ein Hinweis wäre Lärm.
