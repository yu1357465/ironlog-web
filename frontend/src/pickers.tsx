/** Exercise picker and set editor sheets, shared by Today, Plans and History. */
import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from './api'
import { formatNumber, formatWeight, toKg, unitLabel, type Unit } from './format'
import { groupLabel, useI18n } from './i18n'
import { Button, Chip, IconButton, MuscleBadge, MuscleDot, Sheet, Switch, TextField } from './ui'

/**
 * Choose or create an exercise. When the typed name matches the library, its muscle group is locked to the
 * library's, so the same exercise can never end up in two groups and skew the strength scores.
 */
export function ExercisePicker({ open, title, library, confirmLabel, initialName = '', addToPlanDefault, onConfirm, onClose }: {
  open: boolean; title: string; library: Exercise[]; confirmLabel: string; initialName?: string
  /** When set, shows the “add to template” switch. */
  addToPlanDefault?: boolean
  onConfirm: (name: string, group: MuscleGroup, addToPlan: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initialName)
  const [group, setGroup] = useState<MuscleGroup>('CHEST')
  const [addToPlan, setAddToPlan] = useState(addToPlanDefault ?? false)
  useEffect(() => {
    if (open) { setName(initialName); setGroup('CHEST'); setAddToPlan(addToPlanDefault ?? false) }
  }, [open, initialName, addToPlanDefault])

  const query = name.trim()
  const match = library.find(e => e.name === query)
  const suggestions = useMemo(() => {
    const q = query.toLowerCase()
    return q ? library.filter(e => e.name.toLowerCase().includes(q) && e.name !== query).slice(0, 6) : library.slice(0, 6)
  }, [library, query])
  const submit = () => { if (query) { onConfirm(query, match?.muscle_group ?? group, addToPlan); onClose() } }

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button disabled={!query} onClick={submit}>{confirmLabel}</Button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); submit() }}>
        <TextField autoFocus value={name} placeholder={t('picker.placeholder')} maxLength={60}
                   onChange={e => setName(e.target.value)} aria-label={t('name')} />
      </form>
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-muted">{query ? t('picker.similar') : t('picker.library')}</p>
          {suggestions.map(e => (
            <button key={e.id} type="button" onClick={() => setName(e.name)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-field">
              <MuscleDot group={e.muscle_group} />
              <span className="flex-1 truncate">{e.name}</span>
              <span className="text-xs text-muted">{groupLabel(t, e.muscle_group)}</span>
            </button>
          ))}
        </div>
      )}
      <hr className="my-3 border-line" />
      {match ? (
        <p className="flex items-center gap-2 text-sm text-muted">{t('picker.inLibrary')} <MuscleBadge group={match.muscle_group} /></p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold">{t('muscleGroup')}</p>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map(g => <Chip key={g} selected={g === group} onClick={() => setGroup(g)}>{groupLabel(t, g)}</Chip>)}
          </div>
        </>
      )}
      {addToPlanDefault !== undefined && (
        <label className="mt-4 flex cursor-pointer items-center gap-3 py-1">
          <span className="flex-1">
            <span className="block">{t('picker.addToPlan')}</span>
            <span className="block text-xs text-muted">{addToPlan ? t('picker.addToPlanOn') : t('picker.addToPlanOff')}</span>
          </span>
          <Switch checked={addToPlan} onChange={setAddToPlan} label={t('picker.addToPlan')} />
        </label>
      )}
    </Sheet>
  )
}

/** Edit weight / sets / reps with steppers — easy to use between sets. */
export function SetEditor({ open, title, unit, weightKg, sets, reps, onConfirm, onClose, header, footer, confirmLabel }: {
  open: boolean; title: string; unit: Unit; weightKg: number; sets: number; reps: number
  onConfirm: (weightKg: number, sets: number, reps: number) => void; onClose: () => void
  header?: ReactNode; footer?: ReactNode; confirmLabel?: string
}) {
  const { t } = useI18n()
  const [w, setW] = useState('')
  const [s, setS] = useState('')
  const [r, setR] = useState('')
  useEffect(() => {
    if (open) { setW(formatWeight(weightKg, unit)); setS(String(sets)); setR(String(reps)) }
  }, [open, weightKg, sets, reps, unit])
  const step = unit === 'KG' ? 2.5 : 5
  const wv = Number(w), sv = Number(s), rv = Number(r)
  const valid = w !== '' && wv >= 0 && wv <= 2000 && Number.isInteger(sv) && sv >= 1 && sv <= 99 && Number.isInteger(rv) && rv >= 1 && rv <= 999
  const submit = () => { if (valid) { onConfirm(toKg(wv, unit), sv, rv); onClose() } }
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<>
      {footer}
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button disabled={!valid} onClick={submit}>{confirmLabel ?? t('save')}</Button>
    </>}>
      {header}
      <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-1">
        <Stepper label={t('editor.weight', { unit: unitLabel(unit) })} value={w} onChange={setW} decimal
                 onMinus={() => setW(formatNumber(Math.max(0, wv - step)))} onPlus={() => setW(formatNumber((wv || 0) + step))} />
        <Stepper label={t('setsLabel')} value={s} onChange={setS}
                 onMinus={() => setS(String(Math.max(1, sv - 1)))} onPlus={() => setS(String(Math.min(99, (sv || 0) + 1)))} />
        <Stepper label={t('repsLabel')} value={r} onChange={setR}
                 onMinus={() => setR(String(Math.max(1, rv - 1)))} onPlus={() => setR(String(Math.min(999, (rv || 0) + 1)))} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

function Stepper({ label, value, onChange, onMinus, onPlus, decimal }: {
  label: string; value: string; onChange: (v: string) => void; onMinus: () => void; onPlus: () => void; decimal?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="flex-1 text-[15px]">{label}</span>
      <IconButton label="−" type="button" onClick={onMinus} className="bg-primary-soft text-on-primary-soft"><Minus size={18} /></IconButton>
      <input
        value={value} inputMode={decimal ? 'decimal' : 'numeric'} aria-label={label}
        onChange={e => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ''))}
        className="tabular h-11 w-24 rounded-xl border border-line bg-field text-center text-lg font-bold outline-none focus:border-primary"
      />
      <IconButton label="+" type="button" onClick={onPlus} className="bg-primary-soft text-on-primary-soft"><Plus size={18} /></IconButton>
    </div>
  )
}
