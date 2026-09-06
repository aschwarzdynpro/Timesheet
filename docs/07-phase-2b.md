# Phase 2b – Reisezeiten und Spesen

Stand: 2026-09-06

## Reisezeit

Brauchte keinen neuen Code. Reisezeit ist eine Tätigkeitsart, und ein Stundensatz kann
seit Phase 1 optional an eine Tätigkeitsart gebunden werden. „Reisezeit zu 50 %“ ist
damit ein Satz in der Projekt-Satzhistorie — angelegt über *Projekte → Zeile aufklappen →
Satz*, mit „Gilt für: Reisezeit“. Die Auflösung nimmt den spezifischsten Treffer, das
Wochenraster erfasst sie wie jede andere Zeile.

## Spesenarten (`/spesenarten`)

Eine Spesenart legt fest, **wie** erfasst wird:

| Erfassungsart | Was erfasst wird | Beispiel |
|---|---|---|
| Beleg | Betrag direkt, optional MwSt.-Satz | Hotel, Bahnticket |
| Pauschale | Menge × Satz, mit Einheit | 214 km × 0,30 € |

Vier häufige Arten lassen sich als Vorlage übernehmen (Kilometergeld, Verpflegung,
Übernachtung, Bahnfahrt) — die **Sätze trägst du selbst ein**, sie hängen von deiner
Vereinbarung ab und sollen nicht aus einer Voreinstellung stammen, die niemand geprüft hat.

## Spesen (`/spesen`)

Liste über einen frei wählbaren Zeitraum mit drei Summen, die verschiedene Fragen
beantworten: **Ausgelegt** (was du vorgestreckt hast), **Weiterberechnet** (was der Kunde
zahlt, inklusive Aufschlag) und **Bleibt bei mir** (was nicht weiterberechenbar ist — die
Zahl, die im Jahresergebnis fehlt).

Bei einer Pauschale wird der hinterlegte Satz vorbelegt und der Betrag aus Menge mal Satz
berechnet, während du tippst; überschreiben geht trotzdem. Beim Beleg wird der Betrag
erfasst, der MwSt.-Satz ist optional.

**Belege** landen in einem privaten Bucket unter `receipts/<benutzerkennung>/…` — genau
das prüft die Storage-Policy. Abrufbar sind sie nur über Adressen mit fünf Minuten
Gültigkeit; es gibt bewusst keine dauerhaft gültige öffentliche Adresse. Das Dateifeld
trägt `capture="environment"`, sodass ein Mobilgerät direkt die Kamera anbietet: der
Beleg ist genau dann in der Hand.

Spesen laufen durch denselben Trigger wie Zeiten — Periodenzuordnung beim Speichern,
Sperre nach der Meldung. Bei einer Pauschale rechnet der Trigger `amount_net` aus Menge
und Satz nach, unabhängig davon, was die Oberfläche schickt.

## Export

Liegen im gewählten Zeitraum Spesen, bekommt die Datei ein **zweites Blatt**: Datum,
Kunde, Projekt, Art, Beschreibung, Menge, Satz, Betrag, weiterberechenbar, Aufschlag und
weiterberechneter Betrag, mit eigener Summenzeile. Ein Betrag gehört nicht in eine
Spalte, die Stunden zählt.

## Beim Bauen gefunden und behoben

- **`today()` rechnete in UTC.** `new Date().toISOString().slice(0,10)` liefert in Berlin
  zwischen Mitternacht und zwei Uhr noch den Vortag. Ein Eintrag wäre am falschen Tag und
  womöglich in der falschen Meldeperiode gelandet. Betroffen waren die Datumsvorgabe bei
  Spesen und Stundensätzen sowie die Markierung des aktuell gültigen Satzes. Jetzt über
  lokale Datumsteile, mit Regressionstest.
- **Unkontrolliertes Feld wurde kontrolliert.** Beleg- und Pauschalfelder standen an
  derselben Stelle im Baum; React verwendete dieselben DOM-Knoten weiter, und ein Feld mit
  `defaultValue` traf auf eines mit `value`. Eigene Schlüssel für beide Zweige.
- **Der Dialog behielt seinen Zustand.** Zwei Spesen nacheinander zu öffnen zeigte beim
  zweiten Mal noch die Werte der ersten. Gelöst wie schon beim Zeiteintrag: ein Schlüssel
  auf der Identität setzt das Formular zurück.

Und zweimal ein Fehler **in der Prüfung, nicht in der Anwendung**: `innerText` gibt den
Wert eines `<textarea>` nicht preis, weshalb korrekt gefüllte Formulare als leer
erschienen. Erst das Auslesen der Feldwerte zeigte, dass alles stimmte.

## Geprüft

Spesenliste mit nachgerechneten Summen (222,10 € ausgelegt, 188,10 € weiterberechnet),
Pauschale rechnet 214 × 0,30 = 64,20 €, drei Dialoge nacheinander mit den jeweils
richtigen Werten, dreimaliger Wechsel der Erfassungsart ohne Warnung, Export meldet
„3 Spesen als eigenes Blatt“. Zehn Seiten mal vier Breiten (320–1400 px): kein seitliches
Scrollen, keine Konsolenmeldungen.
