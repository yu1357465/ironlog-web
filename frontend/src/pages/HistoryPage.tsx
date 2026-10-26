import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, FilePlus2, History, MoreVertical, SquarePen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useProfile } from '../App'
import { api, type Entry, type MuscleGroup, type Session } from '../api'
import { formatFullDate, formatSessionDate, formatVolume, formatWeight, relativeDay, todayInput, unitLabel, type Unit } from '../format'
import { useI18n } from '../i18n'
import { ExercisePicker, SetEditor } from '../pickers'
import { Button, Card, ConfirmDialog, cx, EmptyState, IconButton, Menu, MuscleDot, PageHeader, PromptDialog, TextField, useToast } from '../ui'

export default function HistoryPage() {
  const { t, lang } = useI18n()
  const unit = useProfile().unit as Unit
  const qc = useQueryClient()
  const toast = useToast()
  const history = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => api.history(pageParam),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  })
  const library = useQuery({ queryKey: ['exercises'], queryFn: api.exercises })
  const sessions = history.data?.pages.flatMap(p => p.sessions) ?? []
  const total = history.data?.pages[0]?.total ?? 0

  const [open, setOpen] = useState<Set<number> | null>(null)
  const expanded = open ?? new Set(sessions[0] ? [sessions[0].id] : [])
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editingDate, setEditingDate] = useState('')
  const [renaming, setRenaming] = useState<Session | null>(null)
  const [deleting, setDeleting] = useState<Session | null>(null)
  const [picking, setPicking] = useState(false)
  const [manual, setManual] = useState<{ name: string; group: MuscleGroup } | null>(null)

  const mutate = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['trend'] })
      qc.invalidateQueries({ queryKey: ['exercises'] })
    },
    onError: e => toast(e.message),
  })

  return (
    <div>
      <PageHeader
        title={t('history.title')}
        subtitle={sessions[0] ? t('history.summary', { n: total, when: relativeDay(sessions[0].performed_at, lang) }) : undefined}
        actions={<IconButton label={t('history.addManual')} onClick={() => setPicking(true)}><FilePlus2 size={20} /></IconButton>}
      />
      {history.isSuccess && !sessions.length && (
        <EmptyState icon={<History />} title={t('history.emptyTitle')} body={t('history.emptyBody')}
                    action={<Button variant="tonal" onClick={() => setPicking(true)}>{t('history.addManual')}</Button>} />
      )}
      <div className="space-y-2.5 px-4 md:px-0">
        {sessions.map(s => (
          <SessionCard key={s.id} s={s} unit={unit} expanded={expanded.has(s.id)}
                       onToggle={() => setOpen(() => { const n = new Set(expanded); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                       onEditEntry={e => { setEditing(e); setEditingDate(s.performed_at) }}
                       onRename={() => setRenaming(s)} onDelete={() => setDeleting(s)} />
        ))}
        {history.hasNextPage && (
          <Button variant="ghost" className="w-full" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
            {t('history.loadMore')}
          </Button>
        )}
      </div>

      <SetEditor open={!!editing} title={editing?.exercise.name ?? ''} unit={unit}
                 weightKg={editing?.weight_kg ?? 0} sets={editing?.sets ?? 0} reps={editing?.reps ?? 0}
                 header={<p className="mb-2 text-sm text-muted">{editingDate && formatFullDate(editingDate, lang)}</p>}
                 footer={<Button variant="danger" className="mr-auto" onClick={() => { mutate.mutate(() => api.deleteEntry(editing!.id)); setEditing(null) }}>
                   {t('history.deleteEntry')}
                 </Button>}
                 onConfirm={(weight_kg, sets, reps) => editing && mutate.mutate(() => api.updateEntry(editing.id, { weight_kg, sets, reps }))}
                 onClose={() => setEditing(null)} />
      <PromptDialog open={!!renaming} title={t('history.renameDay')} label={t('history.dayLabel')}
                    initial={renaming?.day_name ?? ''} onClose={() => setRenaming(null)}
                    onConfirm={v => renaming && mutate.mutate(() => api.renameSession(renaming.id, v))} />
      <ConfirmDialog open={!!deleting} title={t('history.deleteSession')} destructive confirmLabel={t('delete')}
                     body={t('history.deleteSessionBody', { date: deleting ? formatFullDate(deleting.performed_at, lang) : '' })}
                     onClose={() => setDeleting(null)} onConfirm={() => deleting && mutate.mutate(() => api.deleteSession(deleting.id))} />
      <ExercisePicker open={picking} title={t('history.manualTitle')} library={library.data ?? []} confirmLabel={t('confirm')}
                      onConfirm={(name, group) => setManual({ name, group })} onClose={() => setPicking(false)} />
      {manual && <ManualEntry name={manual.name} unit={unit} onClose={() => setManual(null)}
                              onSave={(date, day, w, sets, reps) => mutate.mutate(() => api.addManual({
                                performed_at: new Date(`${date}T12:00:00`).toISOString(), day_name: day,
                                name: manual.name, muscle_group: manual.group, weight_kg: w, sets, reps,
                              }))} />}
    </div>
  )
}

function SessionCard({ s, unit, expanded, onToggle, onEditEntry, onRename, onDelete }: {
  s: Session; unit: Unit; expanded: boolean; onToggle: () => void; onEditEntry: (e: Entry) => void
  onRename: () => void; onDelete: () => void
}) {
  const { t, lang } = useI18n()
  const groups = [...new Set(s.entries.map(e => e.exercise.muscle_group))]
  return (
    <Card>
      <div className="flex items-center">
        <button onClick={onToggle} className="min-w-0 flex-1 px-4 py-3 text-left" aria-expanded={expanded}>
          <p className="font-bold">{formatSessionDate(s.performed_at, lang)}</p>
          <p className="truncate text-sm text-muted">
            {[s.day_name, t('history.exercises', { n: s.entries.length }), `${formatVolume(s.volume_kg, unit, lang)} ${unitLabel(unit)}`]
              .filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1.5 flex gap-1">{groups.map(g => <MuscleDot key={g} group={g} />)}</div>
        </button>
        <ChevronDown className={cx('shrink-0 text-outline transition-transform', expanded && 'rotate-180')} size={20} />
        <Menu trigger={open => <IconButton label={t('more')} onClick={open}><MoreVertical size={20} /></IconButton>} items={[
          { label: t('history.renameDay'), icon: <SquarePen size={18} />, onClick: onRename },
          { label: t('history.deleteSession'), icon: <Trash2 size={18} />, danger: true, onClick: onDelete },
        ]} />
      </div>
      {expanded && (
        <div className="border-t border-line">
          {s.entries.map(e => (
            <button key={e.id} onClick={() => onEditEntry(e)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-field/60">
              <MuscleDot group={e.exercise.muscle_group} />
              <span className="min-w-0 flex-1 truncate">{e.exercise.name}</span>
              <span className="tabular text-sm font-semibold">
                {formatWeight(e.weight_kg, unit)} {unitLabel(unit)} · {e.sets}×{e.reps}
              </span>
            </button>
          ))}
          {s.plan_name && <p className="px-4 pb-3 text-xs text-outline">{s.plan_name}</p>}
        </div>
      )}
    </Card>
  )
}

function ManualEntry({ name, unit, onSave, onClose }: {
  name: string; unit: Unit; onClose: () => void
  onSave: (date: string, day: string, weightKg: number, sets: number, reps: number) => void
}) {
  const { t } = useI18n()
  const [date, setDate] = useState(todayInput())
  const [day, setDay] = useState('')
  return (
    <SetEditor open title={name} unit={unit} weightKg={20} sets={4} reps={12} confirmLabel={t('save')} onClose={onClose}
               onConfirm={(w, s, r) => onSave(date, day, w, s, r)}
               header={<div className="mb-3 grid grid-cols-2 gap-2">
                 <TextField type="date" label={t('history.date')} value={date} max={todayInput()} onChange={e => setDate(e.target.value)} />
                 <TextField label={t('history.dayName')} value={day} maxLength={60} onChange={e => setDay(e.target.value)} />
               </div>} />
  )
}
