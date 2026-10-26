import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown, ArrowUp, CalendarRange, ChevronRight, ClipboardPaste, Copy, Download, FileText, ImageUp, MoreVertical, Plus,
  QrCode, Share2, SquarePen, Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PlanImportPreview, type PlanSummary } from '../api'
import { useI18n } from '../i18n'
import { decodeImageFile } from '../qr'
import { Button, Card, ConfirmDialog, cx, EmptyState, IconButton, Menu, PageHeader, PromptDialog, Sheet, useToast } from '../ui'
import { ImportPreviewSheet, PasteSheet, ScanSheet, ShareSheet } from './sharing'

type Day = PlanSummary['days'][number]
type Dialog =
  | { kind: 'newPlan' } | { kind: 'renamePlan'; plan: PlanSummary } | { kind: 'deletePlan'; plan: PlanSummary }
  | { kind: 'addDay'; plan: PlanSummary } | { kind: 'renameDay'; day: Day } | { kind: 'deleteDay'; day: Day }
  | { kind: 'copyDay'; day: Day; planId: number }

export default function PlansPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const toast = useToast()
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [sharing, setSharing] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [preview, setPreview] = useState<{ text: string; data: PlanImportPreview } | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const update = useMutation({
    mutationFn: (fn: () => Promise<PlanSummary[] | unknown>) => fn(),
    onSuccess: data => {
      if (Array.isArray(data)) qc.setQueryData(['plans'], data)
      else qc.invalidateQueries({ queryKey: ['plans'] })
      qc.invalidateQueries({ queryKey: ['workout'] })
    },
    onError: e => toast(e.message),
  })
  const run = (fn: () => Promise<unknown>, after?: () => void) => update.mutate(fn, { onSuccess: () => after?.() })

  const startImport = (text: string) =>
    api.previewPlanImport(text).then(data => setPreview({ text, data })).catch((e: Error) => toast(e.message))
  const confirmImport = () => {
    const text = preview!.text
    setPreview(null)
    run(() => api.importPlan(text).then(r => {
      toast(r.is_active ? t('import.doneActive', { name: r.name }) : t('import.done', { name: r.name }))
      qc.invalidateQueries({ queryKey: ['exercises'] })
      return r.plans
    }))
  }

  const list = plans.data ?? []
  const move = (ids: number[], from: number, delta: number) => {
    const next = [...ids]
    next.splice(from + delta, 0, next.splice(from, 1)[0])
    return next
  }

  return (
    <div>
      <PageHeader title={t('plans.title')} actions={<>
        <Menu trigger={open => <Button variant="ghost" onClick={open}><Download size={18} />{t('plans.importMenu')}</Button>} items={[
          { label: t('plans.scan'), icon: <QrCode size={18} />, onClick: () => setScanning(true) },
          { label: t('plans.fromImage'), icon: <ImageUp size={18} />, onClick: () => imageInput.current?.click() },
          { label: t('plans.paste'), icon: <ClipboardPaste size={18} />, onClick: () => setPasting(true) },
          { label: t('plans.fromFile'), icon: <FileText size={18} />, onClick: () => fileInput.current?.click() },
        ]} />
        <Button className="hidden md:inline-flex" onClick={() => setDialog({ kind: 'newPlan' })}><Plus size={18} />{t('plans.new')}</Button>
      </>} />

      {plans.isSuccess && !list.length && <EmptyState icon={<CalendarRange />} title={t('plans.emptyTitle')} body={t('plans.emptyBody')} />}
      <div className="space-y-3 px-4 md:px-0">
        {list.map((p, idx) => (
          <PlanCard key={p.id} plan={p}
                    canUp={idx > 0} canDown={idx < list.length - 1}
                    onMove={d => run(() => api.reorderPlans(move(list.map(x => x.id), idx, d)))}
                    onActivate={() => run(() => api.activatePlan(p.id), () => toast(t('plans.activated', { name: p.name })))}
                    onShare={() => setSharing(p.id)}
                    onDialog={setDialog}
                    onMoveDay={(i, d) => run(() => api.reorderDays(p.id, move(p.days.map(x => x.id), i, d)))} />
        ))}
      </div>

      {/* mobile: floating "new plan" button */}
      <Button className="fixed right-5 bottom-20 z-10 h-14 rounded-2xl shadow-lg md:hidden" onClick={() => setDialog({ kind: 'newPlan' })}>
        <Plus size={20} />{t('plans.new')}
      </Button>

      <input ref={imageInput} type="file" accept="image/*" hidden onChange={async e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        const text = await decodeImageFile(f).catch(() => null)
        if (text) startImport(text)
        else toast(t('import.noQr'))
      }} />
      <input ref={fileInput} type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={async e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) startImport(await f.text())
      }} />

      <ShareSheet planId={sharing} onClose={() => setSharing(null)} />
      <ScanSheet open={scanning} onClose={() => setScanning(false)} onResult={startImport} />
      <PasteSheet open={pasting} onClose={() => setPasting(false)} onSubmit={startImport} />
      <ImportPreviewSheet preview={preview?.data ?? null} onConfirm={confirmImport} onClose={() => setPreview(null)} />

      <PromptDialog open={dialog?.kind === 'newPlan'} title={t('plans.new')} label={t('plans.newName')} confirmLabel={t('add')}
                    onClose={() => setDialog(null)} onConfirm={v => run(() => api.createPlan(v))} />
      <PromptDialog open={dialog?.kind === 'renamePlan'} title={t('rename')} label={t('plans.newName')}
                    initial={dialog?.kind === 'renamePlan' ? dialog.plan.name : ''} onClose={() => setDialog(null)}
                    onConfirm={v => dialog?.kind === 'renamePlan' && run(() => api.renamePlan(dialog.plan.id, v))} />
      <ConfirmDialog open={dialog?.kind === 'deletePlan'} destructive confirmLabel={t('delete')}
                     title={dialog?.kind === 'deletePlan' ? t('plans.deletePlanTitle', { name: dialog.plan.name }) : ''}
                     body={dialog?.kind === 'deletePlan' ? t('plans.deletePlanBody') + (dialog.plan.is_active ? t('plans.deletePlanActive') : '') : ''}
                     onClose={() => setDialog(null)}
                     onConfirm={() => dialog?.kind === 'deletePlan' && run(() => api.deletePlan(dialog.plan.id))} />
      <PromptDialog open={dialog?.kind === 'addDay'} title={t('plans.addDay')} label={t('plans.dayName')} confirmLabel={t('add')}
                    onClose={() => setDialog(null)} onConfirm={v => dialog?.kind === 'addDay' && run(() => api.addDay(dialog.plan.id, v))} />
      <PromptDialog open={dialog?.kind === 'renameDay'} title={t('rename')} label={t('name')}
                    initial={dialog?.kind === 'renameDay' ? dialog.day.name : ''} onClose={() => setDialog(null)}
                    onConfirm={v => dialog?.kind === 'renameDay' && run(() => api.renameDay(dialog.day.id, v))} />
      <ConfirmDialog open={dialog?.kind === 'deleteDay'} destructive confirmLabel={t('delete')}
                     title={dialog?.kind === 'deleteDay' ? t('plans.deleteDayTitle', { name: dialog.day.name }) : ''}
                     body={t('plans.deleteDayBody')} onClose={() => setDialog(null)}
                     onConfirm={() => dialog?.kind === 'deleteDay' && run(() => api.deleteDay(dialog.day.id))} />
      <Sheet open={dialog?.kind === 'copyDay'} onClose={() => setDialog(null)}
             title={dialog?.kind === 'copyDay' ? t('plans.copyTitle', { name: dialog.day.name }) : ''}>
        <div className="pb-4">
          {dialog?.kind === 'copyDay' && list.map(p => (
            <button key={p.id} className="w-full rounded-lg px-2 py-3 text-left hover:bg-field" onClick={() => {
              const day = dialog.day
              setDialog(null)
              run(() => api.copyDay(day.id, p.id), () => toast(t('plans.copied', { name: p.name })))
            }}>
              {p.name} {p.id === dialog.planId && <span className="text-muted">{t('plans.thisPlan')}</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function PlanCard({ plan, canUp, canDown, onMove, onActivate, onShare, onDialog, onMoveDay }: {
  plan: PlanSummary; canUp: boolean; canDown: boolean; onMove: (d: number) => void; onActivate: () => void
  onShare: () => void; onDialog: (d: Dialog) => void; onMoveDay: (index: number, delta: number) => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <Card>
      <div className="flex items-center gap-1 py-2 pl-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-bold">{plan.name}</span>
            {plan.is_active && <span className="shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary">{t('plans.active')}</span>}
          </p>
          <p className="text-xs text-muted">{t('plans.days', { n: plan.days.length })}</p>
        </div>
        {!plan.is_active && <Button variant="ghost" onClick={onActivate}>{t('plans.activate')}</Button>}
        <Menu trigger={open => <IconButton label={t('more')} onClick={open}><MoreVertical size={20} /></IconButton>} items={[
          { label: t('plans.share'), icon: <Share2 size={18} />, onClick: onShare },
          { label: t('rename'), icon: <SquarePen size={18} />, onClick: () => onDialog({ kind: 'renamePlan', plan }) },
          ...(canUp ? [{ label: t('plans.moveUp'), icon: <ArrowUp size={18} />, onClick: () => onMove(-1) }] : []),
          ...(canDown ? [{ label: t('plans.moveDown'), icon: <ArrowDown size={18} />, onClick: () => onMove(1) }] : []),
          { label: t('plans.deletePlan'), icon: <Trash2 size={18} />, danger: true, onClick: () => onDialog({ kind: 'deletePlan', plan }) },
        ]} />
      </div>
      <div className="border-t border-line">
        {plan.days.map((day, i) => {
          const current = plan.is_active && plan.current_day_id === day.id
          return (
            <div key={day.id} className="flex items-center hover:bg-field/50">
              <button className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left" onClick={() => navigate(`/plans/days/${day.id}`)}>
                <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  current ? 'bg-primary text-on-primary' : 'bg-field text-muted')}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate">{day.name}</span>
                  <span className={cx('block text-xs', current ? 'text-primary' : 'text-muted')}>
                    {day.exercise_count ? t('plans.exercises', { n: day.exercise_count }) : t('plans.noExercises')}
                    {current && ` · ${t('plans.next')}`}
                  </span>
                </span>
              </button>
              <Menu trigger={open => <IconButton label={t('more')} onClick={open}><MoreVertical size={18} /></IconButton>} items={[
                { label: t('rename'), icon: <SquarePen size={18} />, onClick: () => onDialog({ kind: 'renameDay', day }) },
                ...(i > 0 ? [{ label: t('plans.moveUp'), icon: <ArrowUp size={18} />, onClick: () => onMoveDay(i, -1) }] : []),
                ...(i < plan.days.length - 1 ? [{ label: t('plans.moveDown'), icon: <ArrowDown size={18} />, onClick: () => onMoveDay(i, 1) }] : []),
                { label: t('plans.copyTo'), icon: <Copy size={18} />, onClick: () => onDialog({ kind: 'copyDay', day, planId: plan.id }) },
                { label: t('delete'), icon: <Trash2 size={18} />, danger: true, onClick: () => onDialog({ kind: 'deleteDay', day }) },
              ]} />
              <ChevronRight size={18} className="mr-3 text-outline" />
            </div>
          )
        })}
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-semibold text-primary hover:bg-field/50"
                onClick={() => onDialog({ kind: 'addDay', plan })}>
          <Plus size={18} />{t('plans.addDay')}
        </button>
      </div>
    </Card>
  )
}
