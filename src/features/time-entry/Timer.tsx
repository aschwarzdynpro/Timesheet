import { useEffect, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Button, Select } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { minutesToClock, toIsoDate } from '@/lib/week'
import type { ActivityType, Project } from '@/types/database'
import { standardArt } from '@/features/activity-types/api'

const STORAGE_KEY = 'timesheet.timer'

type RunningTimer = { projectId: string; activityTypeId: string | null; startedAt: number }

function load(): RunningTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RunningTimer
    return typeof parsed?.startedAt === 'number' ? parsed : null
  } catch {
    // Privater Modus oder blockierter Speicher: dann eben ohne laufenden Timer.
    return null
  }
}

function store(timer: RunningTimer | null) {
  try {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* kein Grund, die Erfassung daran scheitern zu lassen */
  }
}

/**
 * Start/Stopp fuer die laufende Taetigkeit. Ueberlebt einen Neuladen des
 * Browsers, weil der Startzeitpunkt lokal gespeichert wird – ein Timer, der
 * beim versehentlichen Schliessen des Tabs verschwindet, ist wertlos.
 */
export function Timer({
  projects, activityTypes, onStop,
}: {
  projects: Project[]
  activityTypes: ActivityType[]
  onStop: (args: { projectId: string; activityTypeId: string | null; minutes: number; workDate: string }) => void
}) {
  const [timer, setTimer] = useState<RunningTimer | null>(() => load())
  const [projectId, setProjectId] = useState('')
  // null heisst "noch nicht gewaehlt": bis dahin gilt die Standardart, auch
  // wenn die Arten erst nach dem ersten Rendern eintreffen.
  const [artWahl, setArtWahl] = useState<string | null>(null)
  const activityId = artWahl ?? standardArt(activityTypes)
  // Verstrichene Minuten liegen im State, nicht in einer Berechnung waehrend des
  // Renderns: die Uhrzeit ist veraenderlich, das Rendern muss rein bleiben.
  const [elapsed, setElapsed] = useState(() =>
    timer ? Math.floor((Date.now() - timer.startedAt) / 60000) : 0)

  // Der Effekt haelt nur den Takt. Den Anfangswert setzen Start, Stopp und der
  // Erstaufbau; so wird waehrend eines Effekts kein State synchron gesetzt.
  useEffect(() => {
    if (!timer) return
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - timer.startedAt) / 60000)),
      15_000,
    )
    return () => window.clearInterval(id)
  }, [timer])

  const running = timer
    ? projects.find((p) => p.id === timer.projectId)
    : undefined

  function start() {
    if (!projectId) return
    const next: RunningTimer = {
      projectId,
      activityTypeId: activityId || null,
      startedAt: Date.now(),
    }
    store(next)
    setElapsed(0)
    setTimer(next)
  }

  function stop() {
    if (!timer) return
    const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt) / 60000))
    store(null)
    setElapsed(0)
    setTimer(null)
    onStop({
      projectId: timer.projectId,
      activityTypeId: timer.activityTypeId,
      minutes,
      workDate: toIsoDate(new Date(timer.startedAt)),
    })
  }

  if (timer) {
    return (
      <div className="flex w-full items-center gap-3 rounded-md border border-accent-500 bg-accent-50 px-3 py-2 sm:w-auto">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-accent-500" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-accent-700">
            {running?.name ?? 'Läuft'}
          </span>
          <span className="tabular block text-xs text-accent-700/80">
            seit {minutesToClock(elapsed)} h
          </span>
        </span>
        <Button size="sm" variant="primary" onClick={stop}>
          <Square className="size-3.5" /> Stoppen
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-surface px-3 py-2 sm:w-auto sm:flex-nowrap">
      <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className={cn('min-w-0 flex-1 sm:w-44 sm:flex-none', !projectId && 'text-ink-400')} aria-label="Projekt für den Timer">
        <option value="">Projekt wählen …</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select value={activityId} onChange={(e) => setArtWahl(e.target.value)}
              className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Tätigkeitsart für den Timer">
        <option value="">ohne Art</option>
        {activityTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
      <Button size="sm" onClick={start} disabled={!projectId}>
        <Play className="size-3.5" /> Start
      </Button>
    </div>
  )
}
