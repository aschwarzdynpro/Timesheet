import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { anwenden, istWahl, type ThemeChoice } from './theme'

const THEME_KEY = 'theme'
const TAX_KEY = 'income_tax_percent'

/** Ohne Pflege gilt derselbe Standard wie in fn_income_tax_percent(). */
export const STEUER_STANDARD = 42

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

/* -------------------------------------------------------------- Zeitnehmer */

const TIMER_KEY = 'show_timer'

/**
 * Ob die Zeiterfassung den Zeitnehmer zeigt.
 *
 * Aus, solange nichts gepflegt ist: Wer nach Feierabend eintraegt, was er
 * gemacht hat, braucht keine laufende Uhr - fuer den ist sie eine Auswahl mehr
 * ueber dem Raster. Wer sie will, schaltet sie im Konto ein.
 */
export function useShowTimer() {
  return useQuery({
    queryKey: ['app-settings', TIMER_KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('app_settings').select('value').eq('key', TIMER_KEY).maybeSingle()
      if (error) throw error
      return (data as { value?: unknown } | null)?.value === true
    },
  })
}

export function useSaveShowTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (an: boolean) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: TIMER_KEY, value: an }, { onConflict: 'owner_id,key' })
      if (error) throw error
      return an
    },
    onSuccess: (an) => qc.setQueryData(['app-settings', TIMER_KEY], an),
  })
}

/* --------------------------------------------------------- Einkommensteuer */

/**
 * Der Einkommensteuersatz aus dem Profil. Die Zahl selbst braucht die
 * Oberflaeche nur fuer das Formular und den Hinweis daneben - gerechnet wird
 * der Betrag nach Steuern in der Datenbank, damit Wochenuebersicht, Auswertung und
 * spaeterer Export nicht auseinanderlaufen.
 */
export function useIncomeTaxPercent() {
  return useQuery({
    queryKey: ['app-settings', TAX_KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('app_settings').select('value').eq('key', TAX_KEY).maybeSingle()
      if (error) throw error
      const wert = (data as { value?: unknown } | null)?.value
      return typeof wert === 'number' ? wert : STEUER_STANDARD
    },
  })
}

export function useSaveIncomeTaxPercent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prozent: number) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: TAX_KEY, value: prozent }, { onConflict: 'owner_id,key' })
      if (error) throw error
      return prozent
    },
    onSuccess: (prozent) => {
      qc.setQueryData(['app-settings', TAX_KEY], prozent)
      // Der Betrag nach Steuern steckt in den Sichten: alles, was ihn zeigt, muss neu
      // gelesen werden. Sonst stuende die alte Zahl bis zum naechsten Laden da.
      void qc.invalidateQueries({ queryKey: ['time-entries'] })
      void qc.invalidateQueries({ queryKey: ['report'] })
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
