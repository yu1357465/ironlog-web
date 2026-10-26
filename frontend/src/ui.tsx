/** Small design-system components shared by every page. */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react'
import type { MuscleGroup } from './api'
import { groupLabel, useI18n } from './i18n'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const GROUP_COLORS: Record<MuscleGroup, string> = {
  CHEST: '#1e88e5', BACK: '#2e9e4f', LEGS: '#f4511e', SHOULDERS: '#8e24aa',
  ARMS: '#e53935', CORE: '#e09a00', OTHER: '#78909c',
}

// ---------------- buttons ----------------

type Variant = 'primary' | 'tonal' | 'ghost' | 'danger' | 'success'

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-primary text-on-primary hover:brightness-110',
    success: 'bg-success text-white hover:brightness-110',
    tonal: 'bg-primary-soft text-on-primary-soft hover:brightness-95',
    ghost: 'text-primary hover:bg-primary-soft/60',
    danger: 'text-danger hover:bg-danger/10',
  }
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-sm font-semibold transition',
        'disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-primary',
        styles[variant], className,
      )}
    />
  )
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...p}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-field',
        'focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40', className,
      )}
    />
  )
}

// ---------------- surfaces ----------------

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-2xl bg-card', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-5 pt-6 pb-3 md:px-0">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

export function SectionTitle({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center px-5 pt-6 pb-2 md:px-1">
      <h2 className="flex-1 text-sm font-semibold text-muted">{children}</h2>
      {trailing}
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function MuscleBadge({ group, dimmed }: { group: MuscleGroup; dimmed?: boolean }) {
  const { t } = useI18n()
  const c = GROUP_COLORS[group]
  return (
    <span
      className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ color: c, background: `${c}${dimmed ? '12' : '1f'}`, opacity: dimmed ? 0.6 : 1 }}
    >
      {groupLabel(t, group)}
    </span>
  )
}

export const MuscleDot = ({ group }: { group: MuscleGroup }) => (
  <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: GROUP_COLORS[group] }} />
)

// ---------------- form controls ----------------

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-outline/60')}
    >
      <span className={cx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  )
}

export function Segmented<V extends string>({ value, options, onChange }: {
  value: V; options: { value: V; label: string }[]; onChange: (v: V) => void
}) {
  return (
    <div className="inline-flex rounded-xl bg-field p-1" role="radiogroup">
      {options.map(o => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 rounded-lg px-3 text-sm font-semibold transition',
            value === o.value ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TextField({ label, className, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>}
      <input
        {...p}
        className="h-11 w-full rounded-xl border border-line bg-field px-3 text-[15px] outline-none transition focus:border-primary"
      />
    </label>
  )
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={cx(
        'h-8 shrink-0 rounded-lg border px-3 text-sm transition',
        selected ? 'border-primary bg-primary-soft text-on-primary-soft font-semibold' : 'border-line text-text hover:bg-field',
      )}
    >
      {children}
    </button>
  )
}

// ---------------- dialog / sheet ----------------

/** Native <dialog>: focus trap, Esc to close and a backdrop for free. A bottom sheet on phones (see index.css). */
export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      className={cx('sheet', wide && 'md:!w-[40rem]')}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === ref.current) onClose() }}
    >
      <div className="flex max-h-[inherit] flex-col">
        {title && <h2 className="px-6 pt-6 pb-2 text-lg font-bold">{title}</h2>}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>}
      </div>
    </dialog>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, destructive, onConfirm, onClose }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; destructive?: boolean
  onConfirm: () => void; onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button variant={destructive ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
    </>}>
      <div className="text-sm text-muted">{body}</div>
    </Sheet>
  )
}

export function PromptDialog({ open, title, label, initial = '', confirmLabel, onConfirm, onClose }: {
  open: boolean; title: string; label: string; initial?: string; confirmLabel?: string
  onConfirm: (v: string) => void; onClose: () => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(initial)
  useEffect(() => { if (open) setValue(initial) }, [open, initial])
  const submit = () => { if (value.trim()) { onConfirm(value.trim()); onClose() } }
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button disabled={!value.trim()} onClick={submit}>{confirmLabel ?? t('save')}</Button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); submit() }}>
        <TextField label={label} value={value} autoFocus onChange={e => setValue(e.target.value)} maxLength={60} />
      </form>
    </Sheet>
  )
}

// ---------------- menu ----------------

export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }

export function Menu({ trigger, items, align = 'right' }: { trigger: (open: () => void) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen(o => !o))}
      {open && (
        <div
          role="menu"
          className={cx(
            'absolute z-30 mt-1 min-w-48 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map(i => (
            <button
              key={i.label} role="menuitem" disabled={i.disabled}
              onClick={() => { setOpen(false); i.onClick() }}
              className={cx(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-field disabled:opacity-40',
                i.danger ? 'text-danger' : 'text-text',
              )}
            >
              {i.icon && <span className={cx('shrink-0', i.danger ? 'text-danger' : 'text-muted')}>{i.icon}</span>}
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- toasts ----------------

interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
const ToastContext = createContext<(text: string, action?: Toast['action']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((text: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts([{ id, text, action }]) // one at a time: a new message replaces the old
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), action ? 6000 : 3500)
  }, [])
  // Modal <dialog> sheets live in the browser's top layer, above any z-index. Showing the toast host as a
  // popover after the dialog opened puts it on top of the sheet, so messages are never hidden behind it.
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = hostRef.current
    if (!el?.showPopover) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (toasts.length) el.showPopover()
  }, [toasts])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div ref={hostRef} popover="manual" aria-live="polite" className="toast-host">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-4 rounded-xl bg-[#2b3035] px-4 py-3 text-sm text-white shadow-xl">
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button className="font-semibold text-[#80cbc4]" onClick={() => { t.action!.run(); setToasts([]) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
