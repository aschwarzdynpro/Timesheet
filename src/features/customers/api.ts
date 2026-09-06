import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerInsert } from '@/types/database'

const KEY = ['customers'] as const

export function useCustomers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name')
      if (error) throw error
      return (data ?? []) as Customer[]
    },
  })
}

export function useSaveCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: CustomerInsert }) => {
      const query = id
        ? supabase.from('customers').update(values).eq('id', id).select().single()
        : supabase.from('customers').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
