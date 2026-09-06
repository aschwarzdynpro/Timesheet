import { Card } from '@/components/ui/primitives'

/** Ohne Zugangsdaten ist ein klarer Hinweis nuetzlicher als ein Netzwerkfehler. */
export function ConfigNotice() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-xl p-6">
        <h1 className="text-lg font-semibold text-ink-800">Verbindung fehlt</h1>
        <p className="mt-2 text-sm text-ink-600">
          Die App weiß noch nicht, mit welchem Supabase-Projekt sie sprechen soll. Lege eine
          Datei <code className="rounded bg-ink-100 px-1">.env</code> im Projektverzeichnis an:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">
{`VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>`}
        </pre>
        <p className="mt-3 text-sm text-ink-500">
          Beide Werte stehen im Supabase-Dashboard unter Einstellungen → API. Danach den
          Entwicklungsserver neu starten.
        </p>
      </Card>
    </div>
  )
}
