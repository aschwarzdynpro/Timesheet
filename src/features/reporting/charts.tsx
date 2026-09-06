import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Handgezeichnete Diagramme als Inline-SVG.
 *
 * Zwei einfache Formen rechtfertigen keine Diagrammbibliothek – und von Hand
 * lassen sich die Regeln genauer einhalten: duenne Marken, 2px Luft zwischen
 * benachbarten Flaechen, gerundete Datenenden, ausgewaehlte statt flaechendeckende
 * Beschriftungen, zuruecktretende Achsen.
 *
 * Die Farben stammen aus der geprueften Kategorienpalette (Slot 1 Blau,
 * Slot 2 Orange). Beide bestehen Helligkeitsband, Chroma-Untergrenze,
 * Farbsehschwaechen-Abstand und Kontrast gegen weisse Flaeche.
 */
export const SERIES = {
  billable: '#2a78d6',
  internal: '#eb6834',
} as const

const AXIS = '#d6dce3'
const GRID = '#eef1f4'

/** Position in Prozent der Zeichenflaeche, damit sie beim Skalieren des SVG stimmt. */
function Tooltip({ left, top, lines }: { left: string; top: string; lines: string[] }) {
  return (
    <div
      role="tooltip"
      style={{ left, top }}
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
    >
      {lines.map((line, i) => (
        <span key={i} className={cn('block', i === 0 ? 'font-semibold text-ink-800' : 'text-ink-600')}>
          {line}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------- Verlauf, gestapelt */

export type TrendPoint = { label: string; full: string; billable: number; internal: number }

export function TrendChart({ points, unit }: { points: TrendPoint[]; unit: string }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const titleId = useId()

  const width = 720
  const height = 220
  const padLeft = 44
  const padBottom = 26
  const padTop = 12

  const max = Math.max(1, ...points.map((p) => p.billable + p.internal))
  const step = Math.max(1, Math.ceil(max / 4))
  const top = step * 4
  const plotH = height - padBottom - padTop
  const plotW = width - padLeft
  const slot = plotW / Math.max(1, points.length)
  const barW = Math.min(28, Math.max(4, slot * 0.62))
  const scale = (v: number) => (v / top) * plotH

  // Nicht jede Saeule beschriften: bei vielen Punkten nur jede zweite oder vierte
  const labelEvery = points.length > 26 ? 4 : points.length > 14 ? 2 : 1

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Stunden je Zeitraum, aufgeteilt in abrechenbar und intern</title>

        {[0, 1, 2, 3, 4].map((i) => {
          const y = padTop + plotH - scale(step * i)
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width} y2={y} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="#7c8998">
                {step * i}
              </text>
            </g>
          )
        })}

        {points.map((p, i) => {
          const x = padLeft + slot * i + (slot - barW) / 2
          const hb = scale(p.billable)
          const hi = scale(p.internal)
          const baseY = padTop + plotH
          return (
            <g key={p.full}>
              {/* Interne Zeit oben, mit 2px Luft zur abrechenbaren darunter */}
              {p.internal > 0 && (
                <rect x={x} y={baseY - hb - hi} width={barW} height={Math.max(1, hi - (p.billable > 0 ? 2 : 0))}
                      rx={3} fill={SERIES.internal} />
              )}
              {p.billable > 0 && (
                <rect x={x} y={baseY - hb} width={barW} height={Math.max(1, hb)} rx={3} fill={SERIES.billable} />
              )}
              {/* Grosszuegiges Ziel fuer die Maus, unabhaengig von der Saeulenhoehe */}
              <rect x={padLeft + slot * i} y={padTop} width={slot} height={plotH} fill="transparent"
                    onMouseEnter={() => setHover({ i, x: padLeft + slot * i + slot / 2, y: baseY - hb - hi })}
                    onMouseLeave={() => setHover(null)} />
              {i % labelEvery === 0 && (
                <text x={padLeft + slot * i + slot / 2} y={height - 8} textAnchor="middle"
                      fontSize={10} fill="#7c8998">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && points[hover.i] && (
        <Tooltip
          left={`${(hover.x / width) * 100}%`}
          top={`${(hover.y / height) * 100}%`}
          lines={[
            points[hover.i]!.full,
            `abrechenbar ${fmt(points[hover.i]!.billable)} ${unit}`,
            ...(points[hover.i]!.internal > 0 ? [`intern ${fmt(points[hover.i]!.internal)} ${unit}`] : []),
          ]}
        />
      )}

      <ul className="mt-2 flex flex-wrap gap-4 pl-11 text-xs text-ink-600">
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
