import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Project, ProjectInsert, ProjectRate, ProjectRateInsert } from '@/types/database'

const PROJECTS = ['projects'] as const
const rateKey = (projectId: string) => ['project-rates', projectId] as const

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('projects').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Project[]
    },
  })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ProjectInsert }) => {
      const query = id
        ? supabase.from('projects').update(values).eq('id', id).select().single()
        : supabase.from('projects').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as Project
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: PROJECTS }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: PROJECTS }),
  })
}

/* ------------------------------------------------------------ Stundensaetze */

export interface CurrentRate {
  project_id: string
  activity_type_id: string | null
  activity_name: string | null
  hourly_rate: number
  valid_from: string
  valid_to: string | null
}

/**
 * Der heute gueltige Satz je Projekt, aus der Sicht v_project_current_rate.
 * Damit sieht man schon in der Liste, ob ein Projekt bewertet werden kann -
 * ohne jede Zeile einzeln aufzuklappen.
 */
export function useCurrentRates() {
  return useQuery({
    queryKey: ['current-rates'],
    queryFn: async (): Promise<CurrentRate[]> => {
      const { data, error } = await supabase.from('v_project_current_rate').select('*')
      if (error) throw error
      return (data ?? []) as CurrentRate[]
    },
  })
}

export function useProjectRates(projectId: string | null) {
  return useQuery({
    queryKey: rateKey(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectRate[]> => {
      const { data, error } = await supabase
        .from('project_rates')
        .select('*')
        .eq('project_id', projectId as string)
        .order('valid_from', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectRate[]
    },
  })
}

export function useSaveProjectRate(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ProjectRateInsert }) => {
      const query = id
        ? supabase.from('project_rates').update(values).eq('id', id).select().single()
        : supabase.from('project_rates').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as ProjectRate
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rateKey(projectId) })
      void qc.invalidateQueries({ queryKey: ['current-rates'] })
    },
  })
}

export function useDeleteProjectRate(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rateKey(projectId) })
      void qc.invalidateQueries({ queryKey: ['current-rates'] })
    },
  })
}
