import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Ellipsis, UserCog } from 'lucide-react'
import { istAktiv, TAEGLICH, WEITER, type NavEintrag } from './navigation'
import { cn } from '@/lib/utils'

/**
 * Die Navigation trennt nach Haeufigkeit, nicht nach Thema.
 *
 * Vier Seiten benutzt der Nutzer taeglich, alles andere richtet er einmal ein.
 * Frueher standen zwoelf gleichrangige Eintraege in einer Zeile, die auf dem
 * Telefon ueber zwei Bildschirmbreiten quer lief. Jetzt liegen die taeglichen
 * Ziele unten in Daumenreichweite und der Rest hinter "Mehr"; die Liste selbst
 * steht in `navigation.ts`, weil die Stammdatenseite dieselbe braucht.
 */

export function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [mehrOffen, setMehrOffen] = useState(false)

  return (
    <div className="flex min-h-full flex-col sm:flex-row">
      {/* Breit bleibt es bei der Seitenleiste: dort ist Platz, und ein Menue,
          das man aufklappen muss, waere mit der Maus nur ein Klick mehr. */}
      {/* Bleibt stehen, waehrend der Inhalt scrollt. Ohne das stand der
          Kontoblock am unteren Rand des *Dokuments*: auf der Zeitenseite mit
          ihrem langen Raster also erst nach ein paar Bildschirmhoehen - das
          Konto war von dort praktisch nicht erreichbar. */}
      <nav
        aria-label="Bereiche"
        className={cn(
          'hidden shrink-0 flex-col border-ink-200 bg-surface sm:flex sm:w-56 sm:border-r',
          'sm:sticky sm:top-0 sm:h-screen sm:overflow-y-auto',
        )}
      >
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="rounded bg-accent-500 px-1.5 py-0.5 text-xs font-bold text-on-strong">ZE</span>
          <span className="text-sm font-semibold text-ink-800">Zeiterfassung</span>
        </div>

        <ul className="flex flex-1 flex-col gap-1 px-3 pb-3">
          {TAEGLICH.map((eintrag) => (
            <li key={eintrag.to}>
              <SeitenLink eintrag={eintrag} aktiv={istAktiv(path, eintrag)} />
            </li>
          ))}
          <li className="my-2 border-t border-ink-100" aria-hidden />
          {WEITER.filter((e) => e.to !== '/konto').map((eintrag) => (
            <li key={eintrag.to}>
              <SeitenLink eintrag={eintrag} aktiv={istAktiv(path, eintrag)} />
            </li>
          ))}
        </ul>

        {/* Das Konto steht unten bei der Adresse, nicht zwischen den Daten -
            dort sucht man Darstellung und Anmeldung. */}
        <div className="border-t border-ink-100 px-3 py-3">
          {email && <p className="truncate px-3 pb-2 text-xs text-ink-400">{email}</p>}
          <Link
            to="/konto"
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition',
              istAktiv(path, '/konto')
                ? 'bg-accent-50 font-medium text-accent-700'
                : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
            )}
          >
            <UserCog className="size-4" /> Konto
          </Link>
        </div>
      </nav>

      {/* Unten Platz fuer die feste Leiste, sonst verdeckt sie die letzte Zeile.
          env(safe-area-inset-bottom) haelt sie ueber dem Home-Indikator. */}
      <main className="min-w-0 flex-1 px-5 py-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <TabLeiste path={path} onMehr={() => setMehrOffen(true)} mehrOffen={mehrOffen} />
      {mehrOffen && <MehrBlatt path={path} email={email} onClose={() => setMehrOffen(false)} />}
    </div>
  )
}

function SeitenLink({ eintrag, aktiv }: { eintrag: NavEintrag; aktiv: boolean }) {
  const Icon = eintrag.icon
  return (
    <Link
      to={eintrag.to}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition',
        aktiv
          ? 'bg-accent-50 font-medium text-accent-700'
          : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
      )}
    >
      <Icon className="size-4" />
      {eintrag.label}
    </Link>
  )
}

/**
 * Die feste Leiste am unteren Rand. Fuenf Felder gleicher Breite - vier Ziele
 * und "Mehr" - damit auf 320 px nichts quer laufen muss.
 */
function TabLeiste({
  path, onMehr, mehrOffen,
}: { path: string; onMehr: () => void; mehrOffen: boolean }) {
  const imBlatt = WEITER.some((e) => istAktiv(path, e))

  return (
    <nav
      aria-label="Hauptbereiche"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-surface sm:hidden',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="flex">
        {TAEGLICH.map((eintrag) => {
          const aktiv = istAktiv(path, eintrag)
          const Icon = eintrag.icon
          return (
            <li key={eintrag.to} className="min-w-0 flex-1">
              <Link
                to={eintrag.to}
                aria-current={aktiv ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 px-0.5 pt-1.5 pb-1.5"
              >
                <span
                  className={cn(
                    'flex h-6 items-center justify-center rounded-full px-4 transition',
                    aktiv ? 'bg-accent-50 text-accent-700' : 'text-ink-500',
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span
                  className={cn(
                    'block max-w-full truncate text-[10px] leading-tight',
                    aktiv ? 'font-medium text-accent-700' : 'text-ink-500',
                  )}
                >
                  {eintrag.kurz ?? eintrag.label}
                </span>
              </Link>
            </li>
          )
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onMehr}
            aria-expanded={mehrOffen}
            aria-haspopup="dialog"
            className="flex w-full flex-col items-center gap-0.5 px-0.5 pt-1.5 pb-1.5"
          >
            <span
              className={cn(
                'flex h-6 items-center justify-center rounded-full px-4 transition',
                imBlatt ? 'bg-accent-50 text-accent-700' : 'text-ink-500',
              )}
            >
              <Ellipsis className="size-[18px]" />
            </span>
            <span
              className={cn(
                'block max-w-full truncate text-[10px] leading-tight',
                imBlatt ? 'font-medium text-accent-700' : 'text-ink-500',
              )}
            >
              Mehr
            </span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

/**
 * Was selten gebraucht wird, faehrt von unten auf - in derselben Formensprache
 * wie die Rueckfrage, damit auf dem Telefon nur eine Art Blatt existiert.
 */
function MehrBlatt({
  path, email, onClose,
}: { path: string; email?: string; onClose: () => void }) {
  const karte = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null
    karte.current?.querySelector<HTMLElement>('a,button')?.focus()
    // Die Seite dahinter soll nicht mitscrollen, waehrend das Blatt oben liegt.
    const vorigesOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = vorigesOverflow
      vorher?.focus?.()
    }
  }, [])

  useEffect(() => {
    // Der Zurueck-Schalter des Browsers wechselt die Seite unter dem Blatt -
    // es soll dann nicht darueber stehen bleiben.
    window.addEventListener('popstate', onClose)
    return () => window.removeEventListener('popstate', onClose)
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab') return
      const ziele = karte.current?.querySelectorAll<HTMLElement>('a,button')
      if (!ziele?.length) return
      const erstes = ziele[0]!
      const letztes = ziele[ziele.length - 1]!
      if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault()
        erstes.focus()
      } else if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault()
        letztes.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/50 backdrop-blur-[2px] sm:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={karte}
        role="dialog"
        aria-modal="true"
        aria-label="Weitere Bereiche"
        className={cn(
          'w-full rounded-t-2xl border-t border-ink-200 bg-surface shadow-2xl',
          'motion-safe:animate-[confirm-auf_.18s_ease-out]',
          'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-ink-200" />

        <ul className="px-3 py-2">
          {WEITER.map((eintrag) => {
            const { to, label, icon: Icon } = eintrag
            const aktiv = istAktiv(path, eintrag)
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={onClose}
                  aria-current={aktiv ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm transition',
                    aktiv ? 'bg-accent-50 font-medium text-accent-700' : 'text-ink-700',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-ink-100 px-6 pt-3">
          {email && <p className="truncate text-xs text-ink-400">{email}</p>}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-md py-2 text-sm font-medium text-ink-500"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
