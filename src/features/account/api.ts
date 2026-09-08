import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { anwenden, istWahl, type ThemeChoice } from './theme'

const THEME_KEY = 'theme'

/**
 * Die Darstellungswahl aus der Datenbank. Sie gilt fuer alle Geraete; der
 * Speicher des Browsers haelt nur eine Kopie fuer den naechsten Start.
 */
export function useStoredTheme() {
  return useQuery({
    queryKey: ['app-settings', THEME_KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ThemeChoice | null> => {
      const { data, error } = await supabase
        .from('app_settings').select('value').eq('key', THEME_KEY).maybeSingle()
      if (error) throw error
      const wert = (data as { value?: unknown } | null)?.value
      return istWahl(wert) ? wert : null
    },
  })
}

export function useSaveTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (wahl: ThemeChoice) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: THEME_KEY, value: wahl }, { onConflict: 'owner_id,key' })
      if (error) throw error
      return wahl
    },
    onSuccess: (wahl) => {
      qc.setQueryData(['app-settings', THEME_KEY], wahl)
      anwenden(wahl)
    },
  })
}

/**
 * Passwort setzen oder aendern.
 *
 * Supabase haengt es an denselben Benutzer, der bisher nur den Anmeldelink
 * benutzt hat - der Link funktioniert danach weiter. Ein zweiter Weg hinein,
 * kein Ersatz.
 */
export function useSetPassword() {
  return useMutation({
    mutationFn: async (passwort: string) => {
      // hat_passwort merkt sich, dass es eines gibt - Supabase verraet das sonst
      // nirgends, und die Kontoseite soll "aendern" statt "einrichten" sagen.
      const { error } = await supabase.auth.updateUser({
        password: passwort,
        data: { hat_passwort: true },
      })
      if (error) throw error
    },
  })
}
