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

### Timer und Tagesliste

Der Timer speichert den Startzeitpunkt lokal und überlebt damit ein Neuladen — einer, der
beim versehentlichen Schließen des Tabs verschwindet, ist wertlos. Beim Stoppen öffnet der
Dialog mit der gelaufenen Dauer.

Unter 640 px Breite tritt an die Stelle des Rasters eine Tagesliste: ansehen und
korrigieren, gruppiert nach Wochentag. Das Raster braucht Breite und bleibt dem Laptop
vorbehalten, wie im Fachkonzept §6.2 festgelegt.

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
