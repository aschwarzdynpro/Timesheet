import type { ReactNode } from 'react'
import { Badge } from './primitives'

/**
 * Dieselbe Liste, die breit eine Tabelle ist - schmal als Karten.
 *
 * Fuenf bis sieben Spalten passen auf 320 px nicht nebeneinander. Die Tabelle
 * blieb zwar in ihrem Kasten und schob die Seite nicht seitwaerts, aber die
 * Haelfte stand ausserhalb und musste erst herangeschoben werden - und dass da
 * ueberhaupt noch etwas kommt, sah man nicht. Untereinander ist alles da.
 *
 * Die Tabelle daneben bekommt `hidden … sm:table`, diese Liste `sm:hidden`.
 * Beide zeigen dieselben Daten; nur die Kopfzeile faellt weg, weil auf einer
 * Karte die Beschriftung neben dem Wert steht statt darueber.
 */
export function MobileList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-ink-100 sm:hidden">{children}</ul>
}

export function MobileListItem({
  code, name, inaktiv, zeilen, aktionen,
}: {
  code: string
  name: string
  /** Steht als Kennzeichen neben dem Kuerzel, nicht als blasse Schrift. */
  inaktiv?: boolean
  /** Was breit eigene Spalten hat - schmal untereinander. Leeres faellt weg. */
  zeilen?: ReactNode[]
  aktionen?: ReactNode
}) {
  const gefuellt = zeilen?.filter(Boolean) ?? []
  // Rechts weniger Luft als links: die Schaltflaechen bringen ihre eigene mit,
  // und ein negativer Rand dafuer liesse den Inhalt aus der Karte herausragen.
  return (
    <li className="py-3 pr-2 pl-4">
      <div className="flex items-start gap-2">
        {/* min-w-0: sonst waechst die Spalte auf den laengsten Namen und
            schiebt die Schaltflaechen aus der Karte. */}
        <div className="min-w-0 flex-1">
          {/* Kein truncate: auf einer Karte ist Hoehe frei, und ein
              abgeschnittener Name waere genau das Problem von vorhin. */}
          <p className="text-sm font-medium break-words text-ink-800">{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-ink-500">{code}</span>
            {inaktiv && <Badge tone="muted">inaktiv</Badge>}
          </p>
        </div>
        {aktionen && <div className="shrink-0 whitespace-nowrap">{aktionen}</div>}
      </div>

      {gefuellt.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-ink-500">
          {gefuellt.map((zeile, i) => <div key={i} className="min-w-0">{zeile}</div>)}
        </div>
      )}
    </li>
  )
}
