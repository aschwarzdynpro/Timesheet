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
    onSuccess: () => void qc.invalidateQueries({ queryKey: rateKey(projectId) }),
  })
}

export function useDeleteProjectRate(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: rateKey(projectId) }),
  })
}
