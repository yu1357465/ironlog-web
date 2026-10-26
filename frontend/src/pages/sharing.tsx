/** Plan sharing (QR / code / image / file) and importing (camera / image / paste / file). Format: docs/formats.md. */
import { useQuery } from '@tanstack/react-query'
import { Copy, FileDown, ImageDown, Share2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, saveBlob, type PlanImportPreview, type SharedPlan } from '../api'
import { formatNumber } from '../format'
import { useI18n } from '../i18n'
import { posterBlob, qrMatrix, qrPath, scanVideo } from '../qr'
import { Button, MuscleDot, Sheet, Switch, useToast } from '../ui'

export function ShareSheet({ planId, onClose }: { planId: number | null; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [weights, setWeights] = useState(false)
  useEffect(() => { if (planId) setWeights(false) }, [planId])
  const info = useQuery({
    queryKey: ['share', planId, weights],
    queryFn: () => api.share(planId!, weights),
    enabled: planId !== null,
    placeholderData: prev => prev,
  })
  const d = info.data
  const matrix = useMemo(() => (d ? qrMatrix(d.code) : null), [d])
  const subtitle = d ? t('share.summary', { d: d.plan.days.length, e: d.plan.exercise_count }) + (weights ? t('share.withWeights') : '') : ''

  const poster = () => posterBlob(matrix!, d!.plan.name, subtitle, t('share.posterHint'))
  const fileName = (ext: string) => `${d!.file_name.replace(/\.json$/, '')}.${ext}`
  const copy = async () => {
    await navigator.clipboard.writeText(d!.text)
    toast(t('share.copied'))
  }
  const shareImage = async () => {
    const file = new File([await poster()], fileName('png'), { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: d!.plan.name }).catch(() => {})
    else saveBlob(file, file.name) // desktop browsers without Web Share: just download it
  }
  const exportFile = () =>
    saveBlob(new Blob([JSON.stringify(stripMeta(d!.plan), null, 2)], { type: 'application/json' }), d!.file_name)

  return (
    <Sheet open={planId !== null} onClose={onClose} title={d?.plan.name}>
      <p className="-mt-2 text-sm text-muted">{subtitle}</p>
      <div className="mx-auto my-4 flex aspect-square w-full max-w-64 items-center justify-center rounded-2xl bg-white p-3">
        {!d ? <span className="text-sm text-[#68717b]">…</span> : matrix ? (
          <svg viewBox={`-1 -1 ${matrix.length + 2} ${matrix.length + 2}`} className="size-full" shapeRendering="crispEdges" aria-label="QR code">
            <path d={qrPath(matrix)} fill="#000" />
          </svg>
        ) : <p className="text-center text-sm text-[#68717b]">{t('share.tooBig')}</p>}
      </div>
      <label className="flex cursor-pointer items-center gap-3 py-1">
        <span className="flex-1">
          <span className="block">{t('share.includeWeights')}</span>
          <span className="block text-xs text-muted">{weights ? t('share.weightsOn') : t('share.weightsOff')}</span>
        </span>
        <Switch checked={weights} onChange={setWeights} label={t('share.includeWeights')} />
      </label>
      <div className="grid grid-cols-4 gap-2 pt-3 pb-5">
        <Action icon={<Copy size={20} />} label={t('share.copy')} disabled={!d} onClick={copy} />
        <Action icon={<ImageDown size={20} />} label={t('share.saveImage')} disabled={!matrix}
                onClick={async () => saveBlob(await poster(), fileName('png'))} />
        <Action icon={<Share2 size={20} />} label={t('share.shareImage')} disabled={!matrix} onClick={shareImage} />
        <Action icon={<FileDown size={20} />} label={t('share.file')} disabled={!d} onClick={exportFile} />
      </div>
    </Sheet>
  )
}

/** The exported file is the plain plan JSON (same as the Android app), without UI-only fields. */
function stripMeta(p: SharedPlan) {
  return { type: 'fitness-plan', version: 1, name: p.name, days: p.days }
}

function Action({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-primary-soft px-1 py-3 text-xs font-semibold text-on-primary-soft transition hover:brightness-95 disabled:opacity-40">
      {icon}<span className="text-center leading-tight">{label}</span>
    </button>
  )
}

export function PasteSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [auto, setAuto] = useState(false)
  useEffect(() => {
    if (!open) return
    setText(''); setAuto(false)
    navigator.clipboard?.readText?.().then(c => { if (c.includes('FP1:')) { setText(c); setAuto(true) } }).catch(() => {})
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={t('import.pasteTitle')} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button disabled={!text.trim()} onClick={() => { onSubmit(text); onClose() }}>{t('import.recognise')}</Button>
    </>}>
      <p className="mb-2 text-xs text-muted">{auto ? t('import.pasteAuto') : t('import.pasteHint')}</p>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="FP1:…" autoFocus
                className="h-40 w-full resize-none rounded-xl border border-line bg-field p-3 text-sm outline-none focus:border-primary" />
    </Sheet>
  )
}

export function ScanSheet({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const { t } = useI18n()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  // Callbacks via refs: the camera effect must only restart when the sheet opens, not on every parent render.
  const callbacks = useRef({ onClose, onResult })
  callbacks.current = { onClose, onResult }
  useEffect(() => {
    if (!open) return
    setError(false)
    const abort = new AbortController()
    let stream: MediaStream | undefined
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async s => {
        stream = s
        if (abort.signal.aborted) return
        video.current!.srcObject = s
        await video.current!.play()
        const text = await scanVideo(video.current!, abort.signal)
        if (text) { callbacks.current.onResult(text); callbacks.current.onClose() }
      })
      .catch(() => { if (!abort.signal.aborted) setError(true) })
    return () => { abort.abort(); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title={t('import.scanTitle')} footer={<Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>}>
      {error ? <p className="py-6 text-sm text-muted">{t('import.cameraError')}</p> : <>
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
        </div>
        <p className="mt-2 text-center text-sm text-muted">{t('import.scanHint')}</p>
      </>}
    </Sheet>
  )
}

export function ImportPreviewSheet({ preview, onConfirm, onClose }: { preview: PlanImportPreview | null; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const p = preview?.plan
  return (
    <Sheet open={!!preview} onClose={onClose} title={p && t('import.planTitle', { name: p.name })} footer={<>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button onClick={onConfirm}>{t('import')}</Button>
    </>}>
      {p && preview && <div className="space-y-3 pb-2 text-sm">
        <p className="font-semibold">
          {t('share.summary', { d: p.days.length, e: p.exercise_count })}{p.includes_weights ? t('share.withWeights') : t('import.noWeights')}
        </p>
        {p.days.map((d, i) => (
          <div key={i}>
            <p>{i + 1}. {d.name}</p>
            {d.exercises.map(e => (
              <p key={e.name} className="flex items-center gap-2 pl-4 text-xs text-muted">
                <MuscleDot group={e.group} />{e.name}  {e.sets}×{e.reps}{e.weightKg !== undefined ? `  ${formatNumber(e.weightKg)}kg` : ''}
              </p>
            ))}
          </div>
        ))}
        {preview.new_exercises.length > 0 && (
          <p className="text-xs">{t('import.newExercises', { n: preview.new_exercises.length, list: preview.new_exercises.slice(0, 10).join(', ') })}</p>
        )}
        <p className="text-xs text-muted">
          {preview.final_name !== p.name && t('import.renamed', { name: preview.final_name })}{t('import.safe')}
        </p>
      </div>}
    </Sheet>
  )
}
