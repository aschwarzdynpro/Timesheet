import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui/primitives'

type Weg = 'passwort' | 'link'

/** Anmeldefehler von Supabase kommen englisch zurueck. */
function uebersetze(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'E-Mail oder Passwort stimmt nicht. Falls du noch kein Passwort gesetzt hast, '
      + 'melde dich per Link an und lege es unter Konto an.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Diese Adresse ist noch nicht bestätigt. Melde dich einmal per Link an.'
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Zu viele Versuche in kurzer Zeit. Warte einen Moment.'
  }
  return message
}

export function LoginPage() {
  const [weg, setWeg] = useState<Weg>('passwort')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error: authError } = weg === 'passwort'
      ? await supabase.auth.signInWithPassword({ email, password: passwort })
      : await supabase.auth.signInWithOtp({
          email, options: { emailRedirectTo: window.location.origin },
        })

    setBusy(false)
    if (authError) setError(uebersetze(authError.message))
    else if (weg === 'link') setSent(true)
    // Bei Passwort uebernimmt der AuthProvider: die Sitzung steht, die Seite wechselt.
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-ink-800">Zeiterfassung</h1>
        <p className="mt-1 mb-5 text-sm text-ink-500">
          {weg === 'passwort'
            ? 'Mit E-Mail und Passwort anmelden.'
            : 'Anmeldung per Link — ohne Passwort.'}
        </p>

        {sent ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Der Anmeldelink ist unterwegs an <strong>{email}</strong>. Öffne ihn auf diesem Gerät.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="E-Mail">
              <Input type="email" required autoComplete="email" value={email}
                     onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </Field>

            {weg === 'passwort' && (
              <Field label="Passwort">
                <Input type="password" required autoComplete="current-password" value={passwort}
                       onChange={(e) => setPasswort(e.target.value)} />
              </Field>
            )}

            <ErrorNote message={error} />

            <Button type="submit" variant="primary" className="w-full"
                    disabled={busy || !email || (weg === 'passwort' && !passwort)}>
              {busy
                ? (weg === 'passwort' ? 'Wird geprüft …' : 'Wird gesendet …')
                : (weg === 'passwort' ? 'Anmelden' : 'Anmeldelink senden')}
            </Button>

            {/* Der Link bleibt der Weg fuer das erste Mal und fuer ein vergessenes
                Passwort - deshalb steht er hier und nicht in einer Fussnote. */}
            <button type="button"
                    onClick={() => { setWeg(weg === 'passwort' ? 'link' : 'passwort'); setError(null) }}
                    className="w-full text-center text-sm text-accent-600 underline underline-offset-2 hover:text-accent-700">
              {weg === 'passwort'
                ? 'Kein Passwort? Per Link anmelden'
                : 'Mit Passwort anmelden'}
            </button>
          </form>
        )}
      </Card>
    </div>
  )
}
