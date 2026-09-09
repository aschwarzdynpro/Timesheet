import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, LogOut, Monitor, Moon, Percent, Sun, Timer } from 'lucide-react'
import {
  Button, Card, ErrorNote, Field, Input, Segmented, WarnNote,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError, supabase } from '@/lib/supabase'
import { formatPercent } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  STEUER_STANDARD, useIncomeTaxPercent, useSaveIncomeTaxPercent, useSaveShowTimer, useSaveTheme,
  useSetPassword, useShowTimer, useStoredTheme,
} from './api'
import { THEME_LABEL, useTheme, type ThemeChoice } from './theme'

const SYMBOL: Record<ThemeChoice, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

/** Mindestlaenge wie in Supabase eingestellt; kuerzer lehnt der Dienst ab. */
const MIN_LAENGE = 8

function Darstellung() {
  const { choice, setChoice } = useTheme()
  const gespeichert = useStoredTheme()
  const speichern = useSaveTheme()
  const [error, setError] = useState<string | null>(null)

  // Die Datenbank gilt: hat ein anderes Geraet umgestellt, zieht dieses nach.
  useEffect(() => {
    if (gespeichert.data && gespeichert.data !== choice) setChoice(gespeichert.data)
    // choice bewusst nicht in den Abhaengigkeiten: sonst zoege jede eigene
    // Umstellung sofort den alten Wert aus der Datenbank wieder hoch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gespeichert.data])

  async function waehle(wahl: ThemeChoice) {
    setError(null)
    setChoice(wahl)          // wirkt sofort, auch wenn das Sichern scheitert
    try {
      await speichern.mutateAsync(wahl)
    } catch (err) {
      setError(`${describeError(err)} — auf diesem Gerät gilt die Wahl trotzdem.`)
    }
  }

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-700">Darstellung</h2>
        <p className="text-xs text-ink-400">
          Gilt auf allen Geräten. „Wie das Gerät“ folgt der Einstellung von System oder Browser.
        </p>
      </div>

      <div className="px-5 py-4">
        <Segmented
          label="Darstellung"
          value={choice}
          onChange={(wahl) => void waehle(wahl)}
          options={(Object.keys(THEME_LABEL) as ThemeChoice[]).map((wahl) => ({
            value: wahl, label: THEME_LABEL[wahl], icon: SYMBOL[wahl],
          }))}
        />
      </div>

      {error && <div className="px-5 pb-4"><ErrorNote message={error} /></div>}
    </Card>
  )
}

function Zeitnehmer() {
  const gespeichert = useShowTimer()
  const speichern = useSaveShowTimer()
  const [error, setError] = useState<string | null>(null)

  async function schalte(an: boolean) {
    setError(null)
    try {
      await speichern.mutateAsync(an)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <Timer className="size-4 text-ink-400" />
          Zeitnehmer
        </h2>
        <p className="text-xs text-ink-400">
          Eine laufende Uhr über der Zeiterfassung, die beim Stoppen einen Eintrag vorbereitet.
        </p>
      </div>

      <div className="px-5 py-4">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={gespeichert.data === true}
                 disabled={gespeichert.isPending || speichern.isPending}
                 onChange={(e) => void schalte(e.target.checked)}
                 className="size-4 rounded border-ink-300" />
          Zeitnehmer in der Zeiterfassung anzeigen
        </label>
        {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      </div>
    </Card>
  )
}

function Einkommensteuer() {
  const gespeichert = useIncomeTaxPercent()
  const speichern = useSaveIncomeTaxPercent()
  // null heisst "noch nichts getippt" - dann zeigt das Feld den gepflegten
  // Wert und zieht nach, sobald er geladen ist.
  const [eingabe, setEingabe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fertig, setFertig] = useState(false)

  const wert = eingabe ?? (gespeichert.data === undefined
    ? '' : String(gespeichert.data).replace('.', ','))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFertig(false)

    const zahl = Number(wert.trim().replace(',', '.'))
    if (wert.trim() === '' || !Number.isFinite(zahl) || zahl < 0 || zahl > 100) {
      return setError('Ein Satz zwischen 0 und 100 — etwa 42 oder 42,5.')
    }

    try {
      await speichern.mutateAsync(zahl)
      setEingabe(null)
      setFertig(true)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <Percent className="size-4 text-ink-400" />
          Einkommensteuer
        </h2>
        <p className="text-xs text-ink-400">
          Um diesen Satz gekürzt steht das Honorar als „Nach Steuern“ neben den Zeiten
          und in den Auswertungen. Ohne eigene Angabe gelten {formatPercent(STEUER_STANDARD)}
          — der deutsche Spitzensteuersatz.
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Satz" className="w-32">
            <div className="flex items-center gap-1.5">
              <Input inputMode="decimal" className="text-right" value={wert}
                     aria-label="Einkommensteuersatz in Prozent"
                     onChange={(e) => { setEingabe(e.target.value); setFertig(false) }} />
              <span className="text-sm text-ink-500">%</span>
            </div>
          </Field>
          <Button type="submit" variant="primary" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>

        {gespeichert.error && (
          <div className="mt-3"><ErrorNote message={describeError(gespeichert.error)} /></div>
        )}
        {error && <div className="mt-3"><ErrorNote message={error} /></div>}
        {fertig && (
          <p className="mt-3 text-sm text-ink-500">
            Gespeichert. „Nach Steuern“ rechnet ab sofort mit {formatPercent(gespeichert.data)}.
          </p>
        )}
      </form>
    </Card>
  )
}

function Passwort({ hatPasswort }: { hatPasswort: boolean }) {
  const setzen = useSetPassword()
  const [passwort, setPasswort] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fertig, setFertig] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFertig(false)

    if (passwort.length < MIN_LAENGE) {
      return setError(`Mindestens ${MIN_LAENGE} Zeichen.`)
    }
    if (passwort !== wiederholung) {
      return setError('Die beiden Eingaben stimmen nicht überein.')
    }

    try {
      await setzen.mutateAsync(passwort)
      setPasswort('')
      setWiederholung('')
      setFertig(true)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <KeyRound className="size-4 text-ink-400" />
          {hatPasswort ? 'Passwort ändern' : 'Passwort einrichten'}
        </h2>
        <p className="text-xs text-ink-400">
          {hatPasswort
            ? 'Ein neues Passwort ersetzt das bisherige sofort.'
            : 'Damit kannst du dich künftig ohne Anmeldelink anmelden.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Neues Passwort" hint={`mindestens ${MIN_LAENGE} Zeichen`}>
            <Input type="password" autoComplete="new-password" value={passwort}
                   onChange={(e) => setPasswort(e.target.value)} />
          </Field>
          <Field label="Wiederholen">
            <Input type="password" autoComplete="new-password" value={wiederholung}
                   onChange={(e) => setWiederholung(e.target.value)} />
          </Field>
        </div>

        <WarnNote>
          Der Anmeldelink funktioniert weiterhin — das Passwort ist ein zweiter Weg hinein,
          kein Ersatz. Ihn brauchst du auch, wenn du das Passwort einmal vergisst.
        </WarnNote>

        <ErrorNote message={error} />
        {fertig && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Passwort gespeichert. Beim nächsten Mal kannst du dich damit anmelden.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary"
                  disabled={setzen.isPending || !passwort || !wiederholung}>
            {setzen.isPending ? 'Wird gespeichert …' : 'Passwort speichern'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function AccountPage() {
  const { session } = useAuth()
  // Supabase fuehrt die Anmeldewege des Benutzers mit; daran haengt, ob hier
  // "einrichten" oder "aendern" steht.
  const wege = session?.user.identities?.map((i) => i.provider) ?? []
  const hatPasswort = wege.includes('email') && Boolean(session?.user.user_metadata?.hat_passwort)

  return (
    <>
      <PageHeader
        title="Konto"
        subtitle="Darstellung, Zeitnehmer, Steuersatz und Anmeldung. Die Zeitdaten selbst liegen unter den anderen Punkten."
      />

      <Card className="mt-4 px-5 py-4">
        <p className="text-xs tracking-wide text-ink-400 uppercase">Angemeldet als</p>
        <p className="mt-0.5 text-sm font-medium text-ink-800">{session?.user.email ?? '—'}</p>
      </Card>

      <Darstellung />
      <Zeitnehmer />
      <Einkommensteuer />
      <Passwort hatPasswort={hatPasswort} />

      <Card className="mt-3 px-5 py-4">
        <Button onClick={() => void supabase.auth.signOut()}>
          <LogOut className="size-4" /> Abmelden
        </Button>
      </Card>
    </>
  )
}
