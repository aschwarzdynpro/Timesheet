# Phasen 3 und 5 – Auswertungen und Perioden-Workflow

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

## Perioden (`/perioden`)

Die Liste aller Meldeperioden mit Status, Summen und Positionen. Offene Perioden rechnen
live aus den Einträgen; gemeldete tragen ihre Summen selbst, weil sie beim Freigeben
zusammen mit dem Stundensatz eingefroren wurden.

Oben steht eine Warnung für **abgelaufene, noch nicht gemeldete Perioden** — der Fall,
den man im Alltag tatsächlich vergisst und der im Fachkonzept als wichtigster
Dashboard-Punkt genannt ist.

Die Freigabe ruft `fn_submit_period()` als RPC auf. Die gesamte Arbeit — Sätze einfrieren,
Summen schreiben, Status setzen — passiert in der Datenbank, in einer Transaktion. Vorher
nennt eine Rückfrage Kunde, Zeitraum und die Folge im Klartext: Danach sind die Zeiten
gesperrt und die Sätze eingefroren, und das lässt sich in der App nicht zurücknehmen.

## Beim Bauen gefunden

- **Ein Typ-Cast, der zur Laufzeit falsch gewesen wäre.** Die Tooltip-Position im
  Verlaufsdiagramm wurde mit `as unknown as number` durch die Typprüfung gezwungen,
  hätte aber Prozentwerte als Pixel geliefert. Jetzt sauber als CSS-Prozentwerte.
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
