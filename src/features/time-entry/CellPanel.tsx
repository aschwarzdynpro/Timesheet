import { X } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import { minutesToHours } from '@/lib/week'
import type { TimeEntryFull } from '@/types/database'
import { EntryEditor, entryEditorKey, type EntryDialogTarget } from './EntryDialog'

/**
 * Die Eintraege der gewaehlten Rasterzelle, unter dem Raster.
 *
 * Am Laptop ist unter der Woche viel Platz, und ein Dialog verdeckte
 * ausgerechnet die Zeilen, aus denen die Summe stammt. Hier bleibt beides
 * gleichzeitig sichtbar: oben die Zahl, unten woraus sie besteht.
 */
export function CellPanel({
  target, entries, onClose, onRetarget,
}: {
  target: EntryDialogTarget
  entries: TimeEntryFull[]
  onClose: () => void
  /** Die Zelle haengt um: die Auswahl im Raster muss mitwandern. */
  onRetarget: (target: EntryDialogTarget) => void
}) {
  const summe = entries.reduce((n, e) => n + e.duration_minutes, 0)

  return (
    <Card className="mt-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-800">
            {target.project.name}
            <span className="tabular ml-2 font-normal text-ink-500">
              {formatDate(target.workDate)}
            </span>
          </h2>
          {/* Arbeitspaket und Taetigkeitsart stehen im Editor darunter, samt
              Stift zum Aendern - hier waeren sie ein zweites Mal dasselbe. */}
          {entries.length > 0 && (
            <p className="tabular mt-0.5 text-xs text-ink-500">
              {entries.length === 1 ? '1 Eintrag' : `${entries.length} Einträge`},{' '}
              {minutesToHours(summe)} h
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" aria-label="Tafel schließen" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-5 py-4">
        {/* Derselbe Editor wie im Dialog auf dem Telefon. */}
        <EntryEditor key={entryEditorKey(target)} target={target} entries={entries}
                     onRetarget={onRetarget} />
      </div>
    </Card>
  )
}
