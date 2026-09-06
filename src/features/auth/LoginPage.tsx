import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui/primitives'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (authError) setError(authError.message)
    else setSent(true)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-ink-800">Zeiterfassung</h1>
        <p className="mt-1 mb-5 text-sm text-ink-500">
          Anmeldung per Link. Es wird kein Passwort gespeichert.
        </p>

        {sent ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Der Anmeldelink ist unterwegs an <strong>{email}</strong>. Öffne ihn auf diesem Gerät.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="E-Mail">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !email}>
              {busy ? 'Wird gesendet …' : 'Anmeldelink senden'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
