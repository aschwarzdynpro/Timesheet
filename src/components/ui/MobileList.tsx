import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
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

/**
 * Eine Karte aus beschrifteten Werten - fuer Zeilen ohne Namen, den man oben
 * hinstellen koennte.
 *
 * `MobileListItem` daneben zeigt Stammdaten: Name und Kuerzel im Kopf, darunter
 * das Weitere ohne Beschriftung, weil auf einer Kundenkarte klar ist, was
 * "woechentlich" bedeutet. Die Positionen einer Periode tragen dagegen die
 * Spalten, die sich der Nutzer im Export-Profil selbst zusammenstellt: Dort
 * braucht jeder Wert seine Beschriftung, sonst stuenden "125,00 EUR" und
 * "62,50 EUR" untereinander und nichts sagte, welches davon der Satz ist.
 *
 * Die Beschriftung steht neben dem Wert und nicht darueber: Eine Karte mit
 * sechzehn Spalten waere sonst doppelt so hoch, und fuer die zwei Woerter links
 * ist auch auf 320 px Platz.
 */
export function MobileFieldItem({ felder }: {
  felder: { label: string; wert: ReactNode; /** Zahlen bekommen die Ziffernbreite der Tabelle. */ zahl?: boolean }[]
}) {
  return (
    <li className="px-4 py-3">
      {/* minmax(0,…) auf beiden Spalten: sonst waechst die Wertspalte auf die
          laengste Beschreibung und schiebt die Karte aus dem Schirm. */}
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {felder.map((feld, i) => (
          <Fragment key={i}>
            <dt className="pt-0.5 text-xs text-ink-500">{feld.label}</dt>
            <dd className={cn('min-w-0 text-sm break-words text-ink-800', feld.zahl && 'tabular')}>
              {feld.wert}
            </dd>
          </Fragment>
        ))}
      </dl>
    </li>
  )
}
