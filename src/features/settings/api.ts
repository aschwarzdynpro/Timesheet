import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Absence, AbsenceInsert, HolidayRow, WorkSchedule, WorkScheduleInsert,
} from '@/types/database'
import type { Holiday } from '@/lib/holidays'

/** Alles, was die Sollarbeitszeit bestimmt, haengt an diesen drei Tabellen. */
function invalidateTarget(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['target-minutes'] })
}

/* --------------------------------------------------------- Arbeitszeitmodell */

export function useWorkSchedules() {
  return useQuery({
    queryKey: ['work-schedules'],
    queryFn: async (): Promise<WorkSchedule[]> => {
      const { data, error } = await supabase
        .from('work_schedules').select('*').order('valid_from', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkSchedule[]
    },
  })
}

export function useSaveWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: WorkScheduleInsert }) => {
      const query = id
        ? supabase.from('work_schedules').update(values).eq('id', id).select().single()
        : supabase.from('work_schedules').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as WorkSchedule
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['work-schedules'] })
      invalidateTarget(qc)
    },
  })
}

export function useDeleteWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_schedules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['work-schedules'] })
      invalidateTarget(qc)
    },
  })
}

/* ------------------------------------------------------------ Abwesenheiten */

export function useAbsences() {
  return useQuery({
    queryKey: ['absences'],
    queryFn: async (): Promise<Absence[]> => {
      const { data, error } = await supabase
        .from('absences').select('*').order('date_from', { ascending: false })
      if (error) throw error
      return (data ?? []) as Absence[]
    },
  })
}

export function useSaveAbsence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: AbsenceInsert }) => {
      const query = id
        ? supabase.from('absences').update(values).eq('id', id).select().single()
        : supabase.from('absences').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as Absence
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['absences'] })
      invalidateTarget(qc)
    },
  })
}

export function useDeleteAbsence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('absences').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['absences'] })
      invalidateTarget(qc)
    },
  })
}

/* ----------------------------------------------------------------- Feiertage */

export function useHolidays() {
  return useQuery({
    queryKey: ['holidays'],
    queryFn: async (): Promise<HolidayRow[]> => {
      const { data, error } = await supabase
        .from('holidays').select('*').order('holiday_date')
      if (error) throw error
      return (data ?? []) as HolidayRow[]
    },
  })
}

/**
 * Uebernimmt eine berechnete Jahresliste. Bereits vorhandene Tage bleiben
 * unveraendert - der Schluessel ist (Benutzer, Datum, Bundesland), sodass ein
 * zweiter Lauf nichts doppelt anlegt.
 */
export function useImportHolidays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ region, holidays }: { region: string; holidays: Holiday[] }) => {
      const rows = holidays.map((h) => ({
        holiday_date: h.date, region, name: h.name,
      }))
      const { error } = await supabase
        .from('holidays')
        .upsert(rows, { onConflict: 'owner_id,holiday_date,region', ignoreDuplicates: true })
      if (error) throw error
      return rows.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['holidays'] })
      invalidateTarget(qc)
    },
  })
}

export function useDeleteHolidayYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ region, year }: { region: string; year: number }) => {
      const { error } = await supabase
        .from('holidays').delete()
        .eq('region', region)
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['holidays'] })
      invalidateTarget(qc)
    },
  })
}
