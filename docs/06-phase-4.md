# Phase 4 – Export nach Excel

Stand: 2026-09-06

## Was entstanden ist

Die Seite `/export` stellt eine Tabellendatei aus denselben Zeilen zusammen, die auch
Wochenraster und Auswertungen anzeigen — aus der Sicht `v_time_entries_full`. Damit steht
im Export exakt das, was die App zeigt, und nicht eine zweite Rechnung.

**Ablauf:** Zeitraum und Filter setzen (Kunde, Projekt, nur abrechenbare) → Spalten
zusammenstellen → Vorschau der ersten 50 Zeilen mit Summenzeile → Datei erzeugen.

**Spalten** sind eine geordnete Auswahl aus sechzehn: Datum · KW · Monat · Kundenkürzel ·
Kunde · Projektkürzel · Projekt · Tätigkeitsart · Beschreibung · Erfasst (h) ·
Abrechenbar (h) · Abrechenbar j/n · Stundensatz · Betrag · Status · Periode. Jede Spalte
weiß selbst, wie sie einen Eintrag in eine Zelle übersetzt — einmal als Text für die
Vorschau, einmal mit Typ und Zahlenformat für die Datei. Die Reihenfolge lässt sich
ändern und bestimmt die Spaltenfolge in der Datei.

**Profile** sichern Spaltenauswahl und Filter unter einem Namen. „ACME — monatlich“ einmal
anlegen, danach ist der Monatsversand: Profil wählen, Zeitraum setzen, Datei erzeugen.
Der Zeitraum bleibt bewusst außerhalb des Profils — er ändert sich ja jeden Monat.

In der Datei: fette Kopfzeile mit fixierter erster Zeile, Spaltenbreiten je Spalte,
Datumszellen als echte Datumswerte (nicht als Text), Stunden und Beträge als Zahlen mit
Format, und eine Summenzeile. Summiert werden nur Spalten, bei denen eine Summe etwas
bedeutet — ein aufsummierter „Stundensatz“ wäre schlicht eine falsche Zahl.

## Abweichung vom Konzept: nicht SheetJS

Das Konzept nannte SheetJS (`xlsx`). Dessen npm-Paket steht seit 0.18.5 still, weil
neuere Versionen nur noch über eigene Kanäle verteilt werden. `npm audit` meldet dafür:

```
xlsx  *
Severity: high
Prototype Pollution in sheetJS
SheetJS Regular Expression Denial of Service (ReDoS)
No fix available
```

Zwei hochstufige Befunde ohne verfügbare Behebung — das kommt nicht in eine App, die
Abrechnungsdaten verarbeitet. Stattdessen `write-excel-file`: kann ausschließlich
schreiben, also genau das, was hier gebraucht wird, ist gepflegt und meldet keinen
Befund. Sie wird erst beim Klick nachgeladen (72 kB als eigener Brocken), statt in jedem
Seitenaufruf mitzureisen.

## Geprüft

Der Export wurde nicht nur ausgelöst, sondern die **erzeugte Datei ausgepackt und
gelesen**: Kopfzeile, drei Datenzeilen und Summenzeile stehen in den richtigen Spalten,
die Umlaute sind intakt, die Summen stimmen (8,00 h und 1.120,00 €), und die
Datumsseriennummer 46237 entspricht dem 03.08.2026 — kein Zeitzonenversatz.

Dabei ein Fehler **in meinem Prüfskript**, nicht in der Anwendung: Der reguläre Ausdruck
erfasste selbstschließende `<c …/>`-Zellen nicht und ordnete Werte dadurch falschen
Spalten zu. Das sah zweimal nach einer verrutschten Summenzeile aus. Erst der Blick ins
rohe XML zeigte, dass die Datei von Anfang an korrekt war.
