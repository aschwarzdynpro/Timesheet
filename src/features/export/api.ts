import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TimeEntryFull } from '@/types/database'
import type { ColumnKey } from './columns'

export interface ExportFilters {
  from: string
  to: string
  customerId: string
  projectId: string
  onlyBillable: boolean
}

export interface ExportProfile {
  id: string
  owner_id: string
  name: string
  target: 'excel' | 'csv' | 'finops'
  columns: ColumnKey[]
  filters: Partial<ExportFilters>
  group_by: string[]
  customer_id: string | null
  is_default: boolean
  created_at: string
}

export function useExportProfiles() {
  return useQuery({
    queryKey: ['export-profiles'],
    queryFn: async (): Promise<ExportProfile[]> => {
      const { data, error } = await supabase.from('export_profiles').select('*').order('name')
      if (error) throw error
      return (data ?? []) as ExportProfile[]
    },
  })
}

export function useSaveExportProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: {
      id?: string
      values: Pick<ExportProfile, 'name' | 'target' | 'columns' | 'filters' | 'customer_id'>
    }) => {
      const query = id
        ? supabase.from('export_profiles').update(values).eq('id', id).select().single()
        : supabase.from('export_profiles').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as ExportProfile
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['export-profiles'] }),
  })
}

export function useDeleteExportProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('export_profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['export-profiles'] }),
  })
}

/**
 * Die Zeilen des Exports – aus derselben angereicherten Sicht, die auch
 * Wochenraster und Auswertungen lesen. Damit steht im Export exakt das, was
 * die App anzeigt.
 */
export function useExportRows(filters: ExportFilters) {
  return useQuery({
    queryKey: ['export-rows', filters],
    enabled: Boolean(filters.from && filters.to),
    queryFn: async (): Promise<TimeEntryFull[]> => {
      let query = supabase
        .from('v_time_entries_full')
        .select('*')
        .gte('work_date', filters.from)
        .lte('work_date', filters.to)
        .order('work_date')
        .order('created_at')

      if (filters.customerId) query = query.eq('customer_id', filters.customerId)
      if (filters.projectId) query = query.eq('project_id', filters.projectId)
      if (filters.onlyBillable) query = query.eq('is_billable', true)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as TimeEntryFull[]
    },
  })
}
