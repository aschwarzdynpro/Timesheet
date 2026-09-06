import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActivityType, ActivityTypeInsert } from '@/types/database'

const KEY = ['activity-types'] as const

export function useActivityTypes() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ActivityType[]> => {
      const { data, error } = await supabase
        .from('activity_types')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as ActivityType[]
    },
  })
}

export function useSaveActivityType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ActivityTypeInsert }) => {
      const query = id
        ? supabase.from('activity_types').update(values).eq('id', id).select().single()
        : supabase.from('activity_types').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as ActivityType
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteActivityType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activity_types').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
