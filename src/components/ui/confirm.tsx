import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { Send, Trash2 } from 'lucide-react'
import { Button } from './primitives'
import { cn } from '@/lib/utils'

/**
 * Rueckfrage in der Formensprache der App statt window.confirm().
 *
 * Der eingebaute Dialog laesst sich nicht gestalten, zeigt auf dem Telefon die
 * nackte Systemkarte und macht aus "Periode melden" ein beliebiges OK. Hier
 * traegt die bestaetigende Schaltflaeche den Namen der Handlung, und eine
 * folgenschwere steht in Rot.
 */

export type ConfirmTone = 'danger' | 'primary'

export interface ConfirmOptions {
  title: string
  /** Was passiert, in einem Satz. */
  body?: ReactNode
  /** Der Gegenstand: Kunde, Zeitraum, Datei. Steht hervorgehoben ueber dem Text. */
  subject?: string
  /** Beschriftung der bestaetigenden Schaltflaeche - nennt die Handlung, nie "OK". */
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type Frage = ConfirmOptions & { antwort: (ja: boolean) => void }

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [frage, setFrage] = useState<Frage | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setFrage({ ...options, antwort: resolve })
      }),
    [],
  )

  const schliessen = useCallback((ja: boolean) => {
    setFrage((offen) => {
      offen?.antwort(ja)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {frage && <ConfirmDialog frage={frage} onAntwort={schliessen} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm braucht einen ConfirmProvider darueber')
  return confirm
}

function ConfirmDialog({
  frage, onAntwort,
}: { frage: Frage; onAntwort: (ja: boolean) => void }) {
  const tone = frage.tone ?? 'danger'
  const karte = useRef<HTMLDivElement>(null)

  // Der Fokus liegt bewusst auf "Abbrechen": Wer versehentlich die Eingabetaste
  // trifft, soll nicht loeschen oder melden. Nach dem Schliessen geht er dorthin
  // zurueck, wo er herkam.
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null
    return () => vorher?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onAntwort(false)
      if (e.key !== 'Tab') return
      // Der Tabulator bleibt im Dialog, statt hinter ihm durch die Seite zu wandern.
      const ziele = karte.current?.querySelectorAll<HTMLElement>('button')
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
  }, [onAntwort])

  const Icon = tone === 'danger' ? Trash2 : Send

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-overlay/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onAntwort(false) }}
    >
      <div
        ref={karte}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titel"
        aria-describedby={frage.body ? 'confirm-text' : undefined}
        // Auf dem Telefon faehrt die Karte von unten auf und sitzt in
        // Daumenreichweite; ab Tablet steht sie mittig.
        className={cn(
          'w-full max-w-md rounded-t-2xl border border-ink-200 bg-surface shadow-2xl',
          'motion-safe:animate-[confirm-auf_.18s_ease-out]',
          'sm:rounded-2xl',
        )}
      >
        <div className="flex gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <span
            aria-hidden
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-accent-50 text-accent-600',
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-titel" className="text-base font-semibold text-ink-900">
              {frage.title}
            </h2>
            {frage.subject && (
              <p className="mt-1 truncate text-sm font-medium text-ink-700">{frage.subject}</p>
            )}
            {frage.body && (
              <p id="confirm-text" className="mt-2 text-sm leading-relaxed text-ink-500">
                {frage.body}
              </p>
            )}
          </div>
        </div>

        {/* Unten Luft fuer den Home-Indikator, sonst klebt "Abbrechen" am Rand. */}
        <div className="flex flex-col-reverse gap-2 border-t border-ink-100 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
          <Button autoFocus type="button" onClick={() => onAntwort(false)}
                  className="justify-center sm:w-auto">
            {frage.cancelLabel ?? 'Abbrechen'}
          </Button>
          <Button type="button" variant={tone === 'danger' ? 'destructive' : 'primary'}
                  onClick={() => onAntwort(true)} className="justify-center sm:w-auto">
            {frage.confirmLabel ?? 'Löschen'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Kurzform fuer den haeufigsten Fall: einen Datensatz loeschen. */
export function loeschFrage(art: string, name?: string): ConfirmOptions {
  return {
    title: `${art} löschen?`,
    subject: name,
    body: 'Das lässt sich nicht rückgängig machen.',
    confirmLabel: 'Löschen',
    tone: 'danger',
  }
}
