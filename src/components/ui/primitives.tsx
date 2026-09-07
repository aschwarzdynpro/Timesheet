import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes,
         type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect } from 'react'
import { cn } from '@/lib/utils'

/* Bewusst schlanke Bausteine statt eines Generatorlaufs: sie halten das Repo
   selbsttragend. shadcn/ui-Komponenten lassen sich spaeter danebenlegen. */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'border-accent-600 bg-accent-500 text-white hover:bg-accent-600',
        variant === 'secondary' && 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
        variant === 'ghost' && 'border-transparent bg-transparent text-ink-500 hover:bg-ink-100',
        variant === 'danger' && 'border-red-200 bg-white text-red-700 hover:bg-red-50',
        variant === 'destructive' && 'border-red-700 bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // min-w-0: ein Feld vom Typ date bringt auf iOS eine eigene Mindestbreite
        // mit und stuende sonst ueber seine Rasterspalte hinaus.
        'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-800',
        'placeholder:text-ink-400 focus:border-accent-500 focus:outline-none',
        'focus:ring-2 focus:ring-accent-100 disabled:bg-ink-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800',
        'placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-800',
        'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({
  label, hint, error, children, className,
}: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

export function Badge({
  children, tone = 'neutral',
}: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-accent-50 text-accent-700',
        tone === 'good' && 'bg-emerald-50 text-emerald-700',
        tone === 'warn' && 'bg-amber-50 text-amber-800',
        tone === 'muted' && 'bg-ink-100 text-ink-500',
      )}
    >
      {children}
    </span>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-ink-200 bg-white', className)}>{children}</div>
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Dialog({
  open, title, description, onClose, children,
}: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg border border-ink-200 bg-white shadow-xl"
      >
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-800">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
