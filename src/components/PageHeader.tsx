import type { ReactNode } from 'react'

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-header flex flex-wrap items-start justify-between gap-4 pb-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
