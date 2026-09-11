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

/* -------------------------------------------- Verlauf, ein Mass zur Zeit */

export type TrendPoint = {
  label: string; full: string; billable: number; internal: number; fees: number
}

/** Was die Saeulen zeigen. Beide Zahlen stehen immer im Hinweis, nur eine im Bild. */
export type TrendMetric = 'hours' | 'fees'

/**
 * Achsenschritt auf eine glatte Zahl runden.
 *
 * Ohne das stuenden am Honorarverlauf Werte wie 19.837 an der Achse - Zahlen,
 * die niemand liest und an denen sich nichts ablesen laesst.
 *
 * Mindestens 1, damit ein leerer Zeitraum nicht "0, 0, 1, 1, 1" anschreibt:
 * ganze Zahlen aus Vierteln, dreimal dieselbe.
 */
function rasterSchritt(rohwert: number): number {
  if (!(rohwert > 0)) return 1
  const potenz = 10 ** Math.floor(Math.log10(rohwert))
  const faktor = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].find((f) => rohwert <= f * potenz)
  return Math.max(1, (faktor ?? 10) * potenz)
}

/**
 * Verlauf als Saeulen - Stunden oder Honorar, umgeschaltet statt nebeneinander.
 *
 * Zwei Felder uebereinander waren der Versuch, beides zugleich zu zeigen; jedes
 * bekam dabei nur die halbe Hoehe und war schlechter zu lesen als eines. Eine
 * zweite Y-Achse loest das nicht, sondern verschlimmert es: Stunden und Euro
 * haben keinen gemeinsamen Massstab, und zwei Skalen in einem Feld lassen sich
 * immer so legen, dass die Saeulen zusammenlaufen - die Aussage kaeme dann aus
 * der Skalierung und nicht aus den Daten.
 *
 * Deshalb ein Feld in voller Hoehe mit einem Umschalter darueber. Der Hinweis
 * an der Saeule nennt beide Zahlen, sodass fuer den Vergleich eines einzelnen
 * Zeitraums niemand umschalten muss.
 *
 * Das Blau ist in beiden Ansichten dasselbe, weil es dieselbe Sache zeigt: die
 * abrechenbare Arbeit, einmal in Stunden und einmal bewertet. Interne Zeit hat
 * kein Gegenstueck in Euro und erscheint nur in der Stundenansicht - die
 * Honoraransicht hat eine Reihe und braucht deshalb keine Legende.
 */
export function TrendChart({
  points, metric, unit,
}: { points: TrendPoint[]; metric: TrendMetric; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const ganz = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  const titleId = useId()

  const width = 720
  const height = 220
  const padLeft = 52          // Platz auch fuer fuenfstellige Betraege an der Achse
  const padBottom = 26
  const padTop = 12

  const stunden = metric === 'hours'
  /**
   * Ob im Zeitraum ueberhaupt interne Zeit vorkommt.
   *
   * Wer ausschliesslich fuer Kunden bucht, bekam bisher eine Legende mit zwei
   * Eintraegen, von denen einer nie im Bild auftaucht - und die Aussage
   * "aufgeteilt in abrechenbar und intern" ueber einem einfarbigen Feld.
   */
  const hatIntern = points.some((p) => p.internal > 0)
  const hoehe = (p: TrendPoint) => (stunden ? p.billable + p.internal : p.fees)
  const schritt = rasterSchritt(Math.max(1, ...points.map(hoehe)) / 4)
  const top = schritt * 4

  const plotH = height - padBottom - padTop
  const plotW = width - padLeft
  const slot = plotW / Math.max(1, points.length)
  const barW = Math.min(28, Math.max(4, slot * 0.62))
  const scale = (v: number) => (v / top) * plotH
  const baseY = padTop + plotH

  // Nicht jede Saeule beschriften: bei vielen Punkten nur jede zweite oder vierte
  const labelEvery = points.length > 26 ? 4 : points.length > 14 ? 2 : 1

  const aktiv = hover !== null ? points[hover] : undefined

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {!stunden ? 'Honorar je Zeitraum in Euro'
            : hatIntern ? 'Erfasste Zeit je Zeitraum, aufgeteilt in abrechenbar und intern'
              : 'Abrechenbare Zeit je Zeitraum'}
        </title>

        {[0, 1, 2, 3, 4].map((i) => {
          const y = padTop + plotH - scale(schritt * i)
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width} y2={y} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-400)">
                {ganz(schritt * i)}
              </text>
            </g>
          )
        })}

        {points.map((p, i) => {
          const x = padLeft + slot * i + (slot - barW) / 2
          const hb = scale(stunden ? p.billable : p.fees)
          const hi = stunden ? scale(p.internal) : 0
          return (
            <g key={p.full}>
              {/* Interne Zeit oben, mit 2px Luft zur abrechenbaren darunter */}
              {stunden && p.internal > 0 && (
                <rect x={x} y={baseY - hb - hi} width={barW}
                      height={Math.max(1, hi - (p.billable > 0 ? 2 : 0))}
                      rx={3} fill={SERIES.internal} />
              )}
              {(stunden ? p.billable : p.fees) > 0 && (
                <rect x={x} y={baseY - hb} width={barW} height={Math.max(1, hb)}
                      rx={3} fill={SERIES.billable} />
              )}
              {/* Grosszuegiges Ziel fuer die Maus, unabhaengig von der Saeulenhoehe */}
              <rect x={padLeft + slot * i} y={padTop} width={slot} height={plotH} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              {i % labelEvery === 0 && (
                <text x={padLeft + slot * i + slot / 2} y={height - 8} textAnchor="middle"
                      fontSize={10} fill="var(--ink-400)">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {aktiv && hover !== null && (
        <Tooltip
          left={`${((padLeft + slot * hover + slot / 2) / width) * 100}%`}
          top={`${((baseY - scale(hoehe(aktiv))) / height) * 100}%`}
          lines={[
            aktiv.full,
            `abrechenbar ${fmt(aktiv.billable)} ${unit}`,
            ...(aktiv.internal > 0 ? [`intern ${fmt(aktiv.internal)} ${unit}`] : []),
            `Honorar ${formatEuro(aktiv.fees)}`,
          ]}
        />
      )}

      {/* Eine Reihe braucht keine Legende - die Ueberschrift nennt sie. */}
      {stunden && hatIntern && (
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
      )}
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
