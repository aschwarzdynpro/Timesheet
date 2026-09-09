import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/format'

/**
 * Handgezeichnete Diagramme als Inline-SVG.
 *
 * Zwei einfache Formen rechtfertigen keine Diagrammbibliothek – und von Hand
 * lassen sich die Regeln genauer einhalten: duenne Marken, 2px Luft zwischen
 * benachbarten Flaechen, gerundete Datenenden, ausgewaehlte statt flaechendeckende
 * Beschriftungen, zuruecktretende Achsen.
 *
 * Die Farben stammen aus der geprueften Kategorienpalette (Slot 1 Blau,
 * Slot 2 Orange) und stehen in index.css. Der dunkle Modus benutzt nicht
 * dieselben Werte, sondern die dunklen Stufen derselben zwei Farbtoene -
 * beide gegen die dunkle Kartenflaeche geprueft, nicht umgedreht.
 */
export const SERIES = {
  billable: 'var(--serie-abrechenbar)',
  internal: 'var(--serie-intern)',
} as const

const AXIS = 'var(--diagramm-achse)'
const GRID = 'var(--diagramm-gitter)'

/** Position in Prozent der Zeichenflaeche, damit sie beim Skalieren des SVG stimmt. */
function Tooltip({ left, top, lines }: { left: string; top: string; lines: string[] }) {
  return (
    <div
      role="tooltip"
      style={{ left, top }}
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-ink-200 bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
    >
      {lines.map((line, i) => (
        <span key={i} className={cn('block', i === 0 ? 'font-semibold text-ink-800' : 'text-ink-600')}>
          {line}
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------------- Verlauf: zwei Felder, eine Achse */

export type TrendPoint = {
  label: string; full: string; billable: number; internal: number; fees: number
}

/**
 * Achsenschritt auf eine glatte Zahl runden.
 *
 * Ohne das stuenden am Honorarfeld Werte wie 19.837 an der Achse - Zahlen, die
 * niemand liest und an denen sich nichts ablesen laesst.
 *
 * Die Leiter ist bewusst fein (bis hinauf zu 8): Bei nur zwei Schritten im
 * Honorarfeld liesse eine grobe Leiter die Saeulen auf halber Hoehe enden -
 * das Feld saehe leer aus, obwohl die Zahlen stimmen.
 *
 * Mindestens 1, damit ein leerer Zeitraum nicht "0, 0, 1, 1, 1" an die Achse
 * schreibt: ganze Zahlen aus Vierteln, dreimal dieselbe.
 */
function rasterSchritt(rohwert: number): number {
  if (!(rohwert > 0)) return 1
  const potenz = 10 ** Math.floor(Math.log10(rohwert))
  const faktor = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].find((f) => rohwert <= f * potenz)
  return Math.max(1, (faktor ?? 10) * potenz)
}

/**
 * Stunden und Honorar uebereinander, auf derselben Zeitachse.
 *
 * Bewusst zwei Felder und keine zweite Y-Achse: Stunden und Euro haben keinen
 * gemeinsamen Massstab, und zwei Skalen in einem Feld liessen sich immer so
 * legen, dass die Linien sich schneiden oder auseinanderlaufen - die Aussage
 * kaeme dann aus der Skalierung, nicht aus den Daten. Untereinander stehen die
 * Monate an derselben Stelle; wo Stunden und Honorar auseinandergehen, sieht
 * man es an den Saeulenhoehen, ohne dass das Diagramm eine Beziehung behauptet.
 *
 * Das Blau ist in beiden Feldern dasselbe, weil es dieselbe Sache zeigt: die
 * abrechenbare Arbeit, einmal in Stunden und einmal bewertet. Interne Zeit hat
 * kein Gegenstueck in Euro und steht deshalb nur oben.
 */
export function TrendChart({ points, unit }: { points: TrendPoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const ganz = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  const titleId = useId()

  const width = 720
  const padLeft = 52          // Platz fuer fuenfstellige Betraege an der Achse
  const padTop = 24           // darueber steht die Beschriftung des Feldes
  const stundenH = 140
  const abstand = 32
  const honorarH = 76
  const padBottom = 26
  const height = padTop + stundenH + abstand + honorarH + padBottom

  const plotW = width - padLeft
  const slot = plotW / Math.max(1, points.length)
  const barW = Math.min(28, Math.max(4, slot * 0.62))

  const stundenSchritt = rasterSchritt(Math.max(1, ...points.map((p) => p.billable + p.internal)) / 4)
  const honorarSchritt = rasterSchritt(Math.max(1, ...points.map((p) => p.fees)) / 2)
  const stundenBasis = padTop + stundenH
  const honorarOben = stundenBasis + abstand
  const honorarBasis = honorarOben + honorarH
  const skalaStunden = (v: number) => (v / (stundenSchritt * 4)) * stundenH
  const skalaHonorar = (v: number) => (v / (honorarSchritt * 2)) * honorarH

  // Nicht jede Saeule beschriften: bei vielen Punkten nur jede zweite oder vierte
  const labelEvery = points.length > 26 ? 4 : points.length > 14 ? 2 : 1

  /** Waagerechte Linien mit Beschriftung fuer ein Feld. */
  const raster = (
    anzahl: number, schritt: number, basis: number,
    skala: (v: number) => number, format: (v: number) => string,
  ) => Array.from({ length: anzahl + 1 }, (_, i) => {
    const y = basis - skala(schritt * i)
    return (
      <g key={`${basis}-${i}`}>
        <line x1={padLeft} y1={y} x2={width} y2={y} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
        <text x={padLeft - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-400)">
          {format(schritt * i)}
        </text>
      </g>
    )
  })

  const aktiv = hover !== null ? points[hover] : undefined

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Zwei Felder auf derselben Zeitachse: oben die erfasste Zeit, aufgeteilt in
          abrechenbar und intern, darunter das Honorar in Euro
        </title>

        <text x={padLeft} y={padTop - 10} fontSize={10} fill="var(--ink-500)">Stunden</text>
        {raster(4, stundenSchritt, stundenBasis, skalaStunden, ganz)}

        <text x={padLeft} y={honorarOben - 10} fontSize={10} fill="var(--ink-500)">Honorar in €</text>
        {raster(2, honorarSchritt, honorarBasis, skalaHonorar, ganz)}

        {points.map((p, i) => {
          const x = padLeft + slot * i + (slot - barW) / 2
          const hb = skalaStunden(p.billable)
          const hi = skalaStunden(p.internal)
          const hf = skalaHonorar(p.fees)
          return (
            <g key={p.full}>
              {/* Interne Zeit oben, mit 2px Luft zur abrechenbaren darunter */}
              {p.internal > 0 && (
                <rect x={x} y={stundenBasis - hb - hi} width={barW}
                      height={Math.max(1, hi - (p.billable > 0 ? 2 : 0))}
                      rx={3} fill={SERIES.internal} />
              )}
              {p.billable > 0 && (
                <rect x={x} y={stundenBasis - hb} width={barW} height={Math.max(1, hb)}
                      rx={3} fill={SERIES.billable} />
              )}
              {p.fees > 0 && (
                <rect x={x} y={honorarBasis - hf} width={barW} height={Math.max(1, hf)}
                      rx={3} fill={SERIES.billable} />
              )}
              {i % labelEvery === 0 && (
                <text x={padLeft + slot * i + slot / 2} y={height - 8} textAnchor="middle"
                      fontSize={10} fill="var(--ink-400)">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Ein Ziel je Zeitraum ueber beide Felder: die Maus trifft die Spalte,
            nicht die einzelne Saeule, und beide Zahlen stehen zusammen. */}
        {points.map((p, i) => (
          <rect key={`ziel-${p.full}`} x={padLeft + slot * i} y={padTop} width={slot}
                height={honorarBasis - padTop} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>

      {aktiv && hover !== null && (
        <Tooltip
          left={`${((padLeft + slot * hover + slot / 2) / width) * 100}%`}
          top={`${((stundenBasis - skalaStunden(aktiv.billable + aktiv.internal)) / height) * 100}%`}
          lines={[
            aktiv.full,
            `abrechenbar ${fmt(aktiv.billable)} ${unit}`,
            ...(aktiv.internal > 0 ? [`intern ${fmt(aktiv.internal)} ${unit}`] : []),
            `Honorar ${formatEuro(aktiv.fees)}`,
          ]}
        />
      )}

      <ul className="mt-2 flex flex-wrap gap-4 pl-13 text-xs text-ink-600">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES.billable }} />
          abrechenbar
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES.internal }} />
          intern
        </li>
      </ul>
    </div>
  )
}

/* --------------------------------------------- Rangfolge, waagerechte Balken */

export type RankPoint = { label: string; value: number; formatted: string }

export function RankChart({ points }: { points: RankPoint[] }) {
  const titleId = useId()
  const max = Math.max(1, ...points.map((p) => p.value))

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-400">Keine Daten im Zeitraum.</p>
  }

  return (
    <ul className="space-y-2" aria-labelledby={titleId}>
      <span id={titleId} className="sr-only">Honorar je Kunde</span>
      {points.map((p) => (
        <li key={p.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-ink-700">{p.label}</span>
          <span className="h-4 rounded-sm bg-ink-100/70">
            <span className="block h-4 rounded-sm"
                  style={{ width: `${Math.max(2, (p.value / max) * 100)}%`, background: SERIES.billable }} />
          </span>
          {/* Direkt beschriftet: die Zahl steht am Balken, nicht nur in der Achse */}
          <span className="tabular text-sm font-medium text-ink-800">{p.formatted}</span>
        </li>
      ))}
    </ul>
  )
}
