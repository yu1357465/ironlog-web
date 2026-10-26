import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Dumbbell, GripVertical, Plus, SquarePen, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '../App'
import { api, type DayDetail, type DayItem } from '../api'
import { formatWeight, unitLabel, type Unit } from '../format'
import { useI18n } from '../i18n'
import { ExercisePicker, SetEditor } from '../pickers'
import { useReorder } from '../reorder'
import { Button, Card, cx, EmptyState, IconButton, MuscleBadge, PageHeader, PromptDialog, useToast } from '../ui'

/** Edit a training day's template exercises. */
export default function DayPage() {
  const { t } = useI18n()
  const dayId = Number(useParams().dayId)
  const unit = useProfile().unit as Unit
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const day = useQuery({ queryKey: ['day', dayId], queryFn: () => api.day(dayId) })
  const library = useQuery({ queryKey: ['exercises'], queryFn: api.exercises })
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [editing, setEditing] = useState<DayItem | null>(null)

  const act = useMutation({
    mutationFn: (fn: () => Promise<DayDetail>) => fn(),
    onSuccess: d => {
      qc.setQueryData(['day', dayId], d)
      qc.invalidateQueries({ queryKey: ['plans'] })
      qc.invalidateQueries({ queryKey: ['exercises'] })
    },
    onError: e => toast(e.message),
  })
  const run = (fn: () => Promise<DayDetail>) => act.mutate(fn)
  const items = day.data?.items ?? []
  const reorder = useReorder(items, i => i.id, ids => run(() => api.reorderDayItems(dayId, ids)))

  if (day.isError) return <EmptyState icon={<Dumbbell />} title={t('somethingWrong')} body={day.error.message}
                                      action={<Button onClick={() => navigate('/plans')}>{t('nav.plans')}</Button>} />

  return (
    <div>
      <div className="flex items-center gap-1 px-2 pt-4 md:px-0">
        <IconButton label="back" onClick={() => navigate('/plans')}><ArrowLeft size={20} /></IconButton>
      </div>
      <PageHeader title={day.data?.name ?? ''} subtitle={t('plans.dayTemplate', { n: items.length })} actions={<>
        <IconButton label={t('rename')} onClick={() => setRenaming(true)}><SquarePen size={20} /></IconButton>
        <Button onClick={() => setAdding(true)}><Plus size={18} />{t('add')}</Button>
      </>} />
      {day.isSuccess && !items.length && (
        <EmptyState icon={<Dumbbell />} title={t('plans.noExercises')} body={t('plans.dayEmptyBody')} />
      )}
      <div className="space-y-2 px-4 md:px-0">
        {reorder.order.map(item => (
          <div key={item.id} ref={reorder.itemRef(item.id)}
               className={cx(reorder.dragging === item.id && 'relative z-10 scale-[1.02] rounded-2xl shadow-lg')}>
            <Card className="flex items-center gap-2 py-2.5 pl-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(item)}>
                <p className="truncate font-bold">{item.exercise.name}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                  <MuscleBadge group={item.exercise.muscle_group} />
                  <span className="tabular">{item.sets} × {item.reps} · {formatWeight(item.weight_kg, unit)} {unitLabel(unit)}</span>
                </p>
              </button>
              <IconButton label={t('delete')} onClick={() => run(() => api.deleteDayItem(item.id))}><X size={18} /></IconButton>
              <span {...reorder.handleProps(item.id)} aria-label={t('today.dragHint')} className="flex h-10 w-9 items-center justify-center text-outline">
                <GripVertical size={20} />
              </span>
            </Card>
          </div>
        ))}
      </div>

      <ExercisePicker open={adding} title={t('picker.addTitle')} library={library.data ?? []} confirmLabel={t('add')}
                      onConfirm={(name, group) => run(() => api.addDayItem(dayId, name, group))} onClose={() => setAdding(false)} />
      <PromptDialog open={renaming} title={t('rename')} label={t('name')} initial={day.data?.name ?? ''}
                    onClose={() => setRenaming(false)} onConfirm={v => run(() => api.renameDay(dayId, v))} />
      <SetEditor open={!!editing} title={editing ? t('plans.defaults', { name: editing.exercise.name }) : ''} unit={unit}
                 weightKg={editing?.weight_kg ?? 0} sets={editing?.sets ?? 0} reps={editing?.reps ?? 0}
                 onConfirm={(weight_kg, sets, reps) => editing && run(() => api.updateDayItem(editing.id, { weight_kg, sets, reps }))}
                 onClose={() => setEditing(null)} />
    </div>
  )
}
