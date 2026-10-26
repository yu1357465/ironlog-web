import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, ChevronDown, GripVertical, LineChart, MoreVertical, Pin, Plus, RefreshCw, Repeat, SquarePen, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../App'
import { AppMark } from '../brand'
import { api, type ActiveItem, type Workout } from '../api'
import { TrendChart } from '../charts'
import { formatShortDate, formatVolume, formatWeight, fromKg, unitLabel, type Unit } from '../format'
import { useI18n } from '../i18n'
import { ExercisePicker, SetEditor } from '../pickers'
import { useReorder } from '../reorder'
import { Button, Card, ConfirmDialog, cx, EmptyState, IconButton, Menu, MuscleBadge, Sheet, useToast } from '../ui'

export default function TodayPage() {
  const { t, lang } = useI18n()
  const profile = useProfile()
  const unit = profile.unit as Unit
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()

  const workout = useQuery({ queryKey: ['workout'], queryFn: api.workout })
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans })
  const library = useQuery({ queryKey: ['exercises'], queryFn: api.exercises })

  /** Every workout endpoint returns the fresh board, so the cache is updated in place. */
  const act = useMutation({
    mutationFn: (fn: () => Promise<Workout>) => fn(),
    onSuccess: w => qc.setQueryData(['workout'], w),
    onError: e => toast(e.message),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['plans'] }); qc.invalidateQueries({ queryKey: ['exercises'] }) },
  })
  const run = (fn: () => Promise<Workout>, after?: (w: Workout) => void) =>
    act.mutate(fn, { onSuccess: w => after?.(w) })

  const [adding, setAdding] = useState(false)
  const [replacing, setReplacing] = useState<ActiveItem | null>(null)
  const [editing, setEditing] = useState<ActiveItem | null>(null)
  const [deleting, setDeleting] = useState<ActiveItem | null>(null)
  const [pendingDay, setPendingDay] = useState<number | null>(null)
  const [confirmReload, setConfirmReload] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const w = workout.data
  const items = w?.items ?? []
  const reorder = useReorder(items, i => i.id, ids => run(() => api.reorderActive(ids)))
  const currentDay = w?.days.find(d => d.id === w.current_day_id) ?? null
  const done = items.filter(i => i.completed).length
  const remaining = items.length - done

  const remove = (item: ActiveItem, fromPlan: boolean) =>
    act.mutate(() => api.deleteActive(item.id, fromPlan), {
      onSuccess: res => toast(t('today.deleted', { name: item.exercise.name }), {
        label: t('undo'),
        run: () => run(() => api.restoreActive((res as Workout & { undo: unknown }).undo)),
      }),
    })

  const finish = (markAll: boolean) => {
    const days = w?.days ?? []
    act.mutate(() => api.finish(markAll), {
      onSuccess: r => {
        const res = r as Awaited<ReturnType<typeof api.finish>>
        qc.invalidateQueries({ queryKey: ['history'] })
        qc.invalidateQueries({ queryKey: ['stats'] })
        if (!res.archived) toast(t('today.nothingDone'))
        else if (res.next_day && days.length > 1) toast(t('today.savedNext', { n: res.archived, day: res.next_day }))
        else toast(t('today.saved', { n: res.archived }))
      },
    })
    setFinishing(false)
  }

  if (workout.isError) {
    return <EmptyState icon={<AppMark size={30} />} title={t('somethingWrong')} body={workout.error.message}
                       action={<Button onClick={() => workout.refetch()}>{t('retry')}</Button>} />
  }

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col md:min-h-dvh">
      {/* header: plan & day selection */}
      <header className="px-5 pt-6 md:px-0">
        <div className="flex items-center">
          <Menu align="left" trigger={open => (
            <button onClick={open} className="flex items-center gap-1 rounded-lg py-1 text-sm font-semibold text-primary">
              {w?.plan?.name ?? t('today.noPlan')} <ChevronDown size={16} />
            </button>
          )} items={[
            ...(plans.data ?? []).map(p => ({
              label: p.name + (p.is_active ? ' ✓' : ''),
              onClick: () => {
                if (!p.is_active) act.mutate(() => api.activatePlan(p.id).then(() => api.workout()),
                  { onSuccess: () => toast(t('plans.activated', { name: p.name })) })
              },
            })),
            { label: t('today.managePlans'), onClick: () => navigate('/plans') },
          ]} />
          <div className="flex-1" />
          <Menu trigger={open => <IconButton label={t('more')} onClick={open}><MoreVertical size={20} /></IconButton>} items={[
            { label: t('today.reload'), icon: <RefreshCw size={18} />, disabled: !currentDay, onClick: () => setConfirmReload(true) },
            { label: t('today.editPlan'), icon: <SquarePen size={18} />, onClick: () => navigate('/plans') },
          ]} />
        </div>
        <Menu align="left" trigger={open => (
          <button onClick={open} disabled={(w?.days.length ?? 0) < 2}
                  className="flex max-w-full items-center gap-1 text-left text-4xl font-bold tracking-tight disabled:cursor-default">
            <span className="truncate">{currentDay?.name ?? t('today.freeTraining')}</span>
            {(w?.days.length ?? 0) > 1 && <ChevronDown className="mt-1 shrink-0 text-muted" size={28} />}
          </button>
        )} items={(w?.days ?? []).map((d, i) => ({
          label: `${i + 1}. ${d.name}${d.id === currentDay?.id ? ' ✓' : ''}`,
          onClick: () => {
            if (d.id === currentDay?.id) return
            if (done > 0) setPendingDay(d.id)
            else run(() => api.selectDay(d.id))
          },
        }))} />
        {items.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-field">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
            <span className="tabular text-sm font-semibold text-muted">{done}/{items.length}</span>
          </div>
        )}
      </header>

      {/* exercise cards */}
      <div className="flex-1 space-y-2.5 px-4 pt-4 md:px-0">
        {workout.isPending && <div className="py-16 text-center text-muted">{t('loading')}</div>}
        {w && items.length === 0 && (
          <EmptyState icon={<AppMark size={30} />} title={t('today.emptyTitle')}
                      body={w.plan ? t('today.emptyDay') : t('today.emptyNoPlan')}
                      action={<Button onClick={() => setAdding(true)}><Plus size={18} />{t('today.addExercise')}</Button>} />
        )}
        {reorder.order.map(item => (
          <div key={item.id} ref={reorder.itemRef(item.id)}
               className={cx('transition-transform', reorder.dragging === item.id && 'relative z-10 scale-[1.02] shadow-lg rounded-2xl')}>
            <ExerciseCard
              item={item} unit={unit} hasDay={!!currentDay} expanded={expanded.has(item.id)}
              handle={reorder.handleProps(item.id)}
              onToggle={() => run(() => api.updateActive(item.id, { completed: !item.completed }))}
              onEdit={() => setEditing(item)}
              onExpand={() => setExpanded(s => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n })}
              onReplace={() => setReplacing(item)}
              onTogglePlan={() => run(() => api.setInPlan(item.id, !item.in_plan), () =>
                toast(item.in_plan ? t('today.removedFromPlan') : t('today.addedToPlan', { day: currentDay?.name ?? '' })))}
              onDelete={() => (item.in_plan ? setDeleting(item) : remove(item, false))}
            />
          </div>
        ))}
        {items.length > 0 && (
          <button onClick={() => setAdding(true)}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-outline text-sm font-semibold text-primary hover:bg-primary-soft/40">
            <Plus size={18} />{t('today.addExercise')}
          </button>
        )}
      </div>

      {/* finish bar */}
      <div className="sticky bottom-16 z-10 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-3 md:bottom-0 md:px-0">
        <Button className="h-14 w-full rounded-2xl text-base" variant={items.length && !remaining ? 'success' : 'primary'}
                disabled={!items.length} onClick={() => setFinishing(true)}>
          {!items.length ? t('today.noItems') : !remaining ? t('today.finishAll') : t('today.finishRemaining', { n: remaining })}
        </Button>
      </div>

      {/* sheets */}
      <ExercisePicker open={adding} title={t('picker.addTitle')} library={library.data ?? []} confirmLabel={t('add')}
                      addToPlanDefault={currentDay ? profile.add_to_plan_by_default : undefined}
                      onConfirm={(name, group, toPlan) => run(() => api.addActive(name, group, toPlan))}
                      onClose={() => setAdding(false)} />
      <ExercisePicker open={!!replacing} title={t('picker.replaceTitle')} library={library.data ?? []}
                      confirmLabel={t('today.replace')} initialName={replacing?.exercise.name}
                      onConfirm={(name, group) => replacing && run(() => api.replaceActive(replacing.id, name, group))}
                      onClose={() => setReplacing(null)} />
      <SetEditor open={!!editing} title={editing?.exercise.name ?? ''} unit={unit}
                 weightKg={editing?.weight_kg ?? 0} sets={editing?.sets ?? 0} reps={editing?.reps ?? 0}
                 onConfirm={(weight_kg, sets, reps) => editing && run(() => api.updateActive(editing.id, { weight_kg, sets, reps }))}
                 onClose={() => setEditing(null)} />
      <Sheet open={!!deleting} onClose={() => setDeleting(null)} title={t('today.deleteTitle', { name: deleting?.exercise.name ?? '' })}
             footer={<>
               <Button variant="ghost" onClick={() => { remove(deleting!, false); setDeleting(null) }}>{t('today.deleteJustToday')}</Button>
               <Button variant="danger" onClick={() => { remove(deleting!, true); setDeleting(null) }}>{t('today.deleteFromPlan')}</Button>
             </>}>
        <p className="text-sm text-muted">{t('today.deleteBody', { day: currentDay?.name ?? '' })}</p>
      </Sheet>
      <ConfirmDialog open={pendingDay !== null} title={t('today.switchTitle')} body={t('today.switchBody', { n: done })}
                     confirmLabel={t('today.switch')} destructive onClose={() => setPendingDay(null)}
                     onConfirm={() => pendingDay !== null && run(() => api.selectDay(pendingDay))} />
      <ConfirmDialog open={confirmReload} title={t('today.reloadTitle')} body={t('today.reloadBody')}
                     confirmLabel={t('today.reload')} onClose={() => setConfirmReload(false)}
                     onConfirm={() => run(() => api.reloadDay())} />
      <Sheet open={finishing} onClose={() => setFinishing(false)}
             title={remaining ? t('today.finishPartialTitle', { n: remaining }) : t('today.finishDoneTitle')}>
        <p className="text-sm text-muted">
          {remaining ? t('today.finishPartialBody') : t('today.finishDoneBody', {
            n: done,
            v: `${formatVolume(items.filter(i => i.completed).reduce((s, i) => s + i.weight_kg * i.sets * i.reps, 0), unit, lang)} ${unitLabel(unit)}`,
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2 pb-3">
          {remaining ? <>
            <Button className="h-12" onClick={() => finish(true)}>{t('today.finishMarkAll')}</Button>
            <Button className="h-12" variant="tonal" disabled={!done} onClick={() => finish(false)}>
              {done ? t('today.finishOnlyDone', { n: done }) : t('today.finishNoneDone')}
            </Button>
          </> : <Button className="h-12" variant="success" onClick={() => finish(false)}>{t('today.finishSave')}</Button>}
          <Button variant="ghost" onClick={() => setFinishing(false)}>{t('today.keepGoing')}</Button>
        </div>
      </Sheet>
    </div>
  )
}

function ExerciseCard({ item, unit, hasDay, expanded, handle, onToggle, onEdit, onExpand, onReplace, onTogglePlan, onDelete }: {
  item: ActiveItem; unit: Unit; hasDay: boolean; expanded: boolean
  handle: ReturnType<ReturnType<typeof useReorder>['handleProps']>
  onToggle: () => void; onEdit: () => void; onExpand: () => void; onReplace: () => void; onTogglePlan: () => void; onDelete: () => void
}) {
  const { t } = useI18n()
  const done = item.completed
  return (
    <Card className={cx('transition-colors', done && '!bg-success-soft', !item.in_plan && !done && 'ring-1 ring-warn/50')}>
      <div className="flex items-center gap-3 pt-2 pl-3">
        <button onClick={onToggle} aria-label={done ? 'done' : 'not done'} aria-pressed={done}
                className={cx('flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition',
                  done ? 'border-success bg-success text-white' : 'border-outline hover:border-primary')}>
          {done && <Check size={18} strokeWidth={3} />}
        </button>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className={cx('truncate text-[17px] font-bold', done && 'text-muted line-through')}>{item.exercise.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <MuscleBadge group={item.exercise.muscle_group} dimmed={done} />
            {!item.in_plan && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">{t('today.temp')}</span>}
          </div>
        </button>
        <IconButton label={t('today.trend')} onClick={onExpand} className={cx(expanded && 'text-primary')}><LineChart size={20} /></IconButton>
        <Menu trigger={open => <IconButton label={t('more')} onClick={open}><MoreVertical size={20} /></IconButton>} items={[
          { label: t('today.replace'), icon: <Repeat size={18} />, onClick: onReplace },
          ...(hasDay ? [{ label: item.in_plan ? t('today.removeFromPlan') : t('today.addToPlan'), icon: <Pin size={18} />, onClick: onTogglePlan }] : []),
          { label: t('delete'), icon: <Trash2 size={18} />, danger: true, onClick: onDelete },
        ]} />
        <span {...handle} aria-label={t('today.dragHint')} className="flex h-10 w-9 items-center justify-center text-outline">
          <GripVertical size={20} />
        </span>
      </div>
      <div className={cx('flex gap-2 px-3 pt-2 pb-3', done && 'opacity-60')}>
        <ValueTile value={formatWeight(item.weight_kg, unit)} unit={unitLabel(unit)} grow={1.4} onClick={onEdit} />
        <ValueTile value={String(item.sets)} unit={t('sets')} onClick={onEdit} />
        <ValueTile value={String(item.reps)} unit={t('reps')} onClick={onEdit} />
      </div>
      {expanded && <TrendPanel exerciseId={item.exercise.id} unit={unit} />}
    </Card>
  )
}

function ValueTile({ value, unit, grow = 1, onClick }: { value: string; unit: string; grow?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flexGrow: grow }}
            className="flex h-13 basis-0 items-baseline justify-center gap-1 rounded-xl bg-field pt-3 transition hover:brightness-95">
      <span className="tabular text-xl font-bold">{value}</span>
      <span className="text-xs text-muted">{unit}</span>
    </button>
  )
}

function TrendPanel({ exerciseId, unit }: { exerciseId: number; unit: Unit }) {
  const { t } = useI18n()
  const trend = useQuery({ queryKey: ['trend', exerciseId], queryFn: () => api.trend(exerciseId) })
  return (
    <div className="mx-3 border-t border-line pt-2 pb-3">
      {trend.isPending ? <div className="h-36" /> : !trend.data?.length ? (
        <p className="py-4 text-sm text-muted">{t('today.noTrend')}</p>
      ) : <>
        <p className="text-xs text-muted">{t('today.lastN', { n: trend.data.length, unit: unitLabel(unit) })}</p>
        <TrendChart points={trend.data.map(p => ({
          label: formatShortDate(p.performed_at), value: fromKg(p.weight_kg, unit), valueLabel: formatWeight(p.weight_kg, unit),
        }))} />
      </>}
    </div>
  )
}
