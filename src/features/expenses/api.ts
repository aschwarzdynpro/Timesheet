import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ExpenseCategory, ExpenseCategoryInsert, ExpenseFull, ExpenseInput,
} from '@/types/database'

const BUCKET = 'receipts'

/* ------------------------------------------------------------ Spesenarten */

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name')
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
  })
}

export function useSaveExpenseCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ExpenseCategoryInsert }) => {
      const query = id
        ? supabase.from('expense_categories').update(values).eq('id', id).select().single()
        : supabase.from('expense_categories').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as ExpenseCategory
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expense-categories'] }),
  })
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expense_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expense-categories'] }),
  })
}

/* ----------------------------------------------------------------- Spesen */

export function useExpenses(from: string, to: string) {
  return useQuery({
    queryKey: ['expenses', from, to],
    queryFn: async (): Promise<ExpenseFull[]> => {
      const { data, error } = await supabase
        .from('v_expenses_full')
        .select('*')
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as ExpenseFull[]
    },
  })
}

export function useSaveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ExpenseInput }) => {
      // amount_net rechnet der Trigger bei Pauschalen ohnehin neu; wir schicken
      // den Wert nur mit, weil die Spalte nicht leer sein darf.
      const query = id
        ? supabase.from('expenses').update(values).eq('id', id).select().single()
        : supabase.from('expenses').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] })
      void qc.invalidateQueries({ queryKey: ['periods'] })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, receiptPath }: { id: string; receiptPath: string | null }) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      // Beleg erst entfernen, wenn der Datensatz weg ist: andersherum bliebe bei
      // einem Fehler eine Spese ohne ihren Nachweis zurueck.
      if (receiptPath) await supabase.storage.from(BUCKET).remove([receiptPath])
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] })
      void qc.invalidateQueries({ queryKey: ['periods'] })
    },
  })
}

/* ------------------------------------------------------------------ Belege */

/**
 * Laedt einen Beleg in den privaten Bucket. Der erste Pfadabschnitt ist die
 * Benutzerkennung - genau darauf greift die Storage-Policy zu.
 */
export async function uploadReceipt(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Nicht angemeldet.')

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const path = `${uid}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

/**
 * Zeitlich begrenzte Adresse fuer einen Beleg. Der Bucket ist privat; es gibt
 * bewusst keine dauerhaft gueltige oeffentliche Adresse.
 */
export function useReceiptUrl(path: string | null) {
  return useQuery({
    queryKey: ['receipt-url', path],
    enabled: Boolean(path),
    staleTime: 4 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path as string, 300)
      if (error) throw error
      return data?.signedUrl ?? null
    },
  })
}
