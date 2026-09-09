import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Ist die App ueberhaupt konfiguriert? Wird beim Start geprueft. */
export const isConfigured = Boolean(url && anonKey)

/**
 * Ohne Konfiguration wird bewusst kein Client erzeugt. Die App zeigt dann einen
 * Hinweis statt mit einem unverstaendlichen Netzwerkfehler abzustuerzen.
 */
export const supabase: SupabaseClient = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : (null as unknown as SupabaseClient)

/** Uebersetzt Datenbankfehler in Saetze, die im Formular etwas aussagen. */
export function describeError(error: unknown): string {
  if (!error) return 'Unbekannter Fehler.'
  const message = typeof error === 'object' && 'message' in error ? String(error.message) : String(error)

  if (message.includes('project_rates_no_overlap')) {
    return 'Für diesen Zeitraum gibt es bereits einen Satz. Beende den bestehenden Satz zuerst.'
  }
  if (message.includes('work_schedules_no_overlap')) {
    return 'Für diesen Zeitraum ist bereits ein Arbeitszeitmodell hinterlegt.'
  }
  if (message.includes('activity_types_one_default')) {
    return 'Es gibt bereits eine Standard-Tätigkeitsart. Lade die Seite neu — '
      + 'inzwischen wurde an anderer Stelle eine gesetzt.'
  }
  if (message.includes('app_settings_income_tax_percent_valid')) {
    return 'Der Einkommensteuersatz muss eine Zahl zwischen 0 und 100 sein.'
  }
  if (message.includes('customers_owner_id_code_key') || message.includes('activity_types_owner_id_code_key')) {
    return 'Dieses Kürzel ist bereits vergeben.'
  }
  if (message.includes('projects_customer_id_code_key')) {
    return 'Dieses Projektkürzel gibt es bei diesem Kunden schon.'
  }
  if (message.includes('Der Wochenbeginn')) {
    return 'Für diesen Kunden ist bereits eine Woche gemeldet. Der Wochenbeginn lässt '
      + 'sich danach nicht mehr ändern, sonst würde ein gemeldeter Zeitraum nachträglich '
      + 'verschoben.'
  }
  if (message.includes('gesperrt') || message.includes('gemeldeten')) {
    return message
  }
  if (message.includes('violates foreign key') && message.includes('projects')) {
    return 'Der Kunde wird noch von Projekten verwendet und kann nicht gelöscht werden.'
  }
  if (message.includes('violates foreign key')) {
    return 'Der Datensatz wird noch verwendet und kann nicht gelöscht werden.'
  }
  return message
}
