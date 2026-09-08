import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

export function PageHeader({
  title, subtitle, action, parent,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  /**
   * Uebergeordneter Bereich. Eine Unterseite ist sonst eine Sackgasse: die
   * Leiste kennt sie nicht, und der einzige Rueckweg waere die Ruecktaste des
   * Browsers - die es auf dem Telefon als Schaltflaeche nicht gibt.
   */
  parent?: { to: string; label: string }
}) {
  return (
    <div className="border-b border-ink-200 pb-4">
      {parent && (
        <Link
          to={parent.to}
          // Grosszuegige Hoehe, damit der Daumen ihn trifft; der Zugewinn an
          // Bauhoehe faellt oben auf der Seite nicht ins Gewicht.
          className="-mt-1 mb-0.5 inline-flex items-center gap-1 py-1.5 pr-2 text-sm text-ink-500 transition hover:text-accent-500 sm:mb-0 sm:py-0.5 sm:text-xs"
        >
          <ChevronLeft className="size-4 shrink-0 sm:size-3.5" aria-hidden />
          {parent.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-800">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}
