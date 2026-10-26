import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, CalendarRange, ChevronRight, FileDown, FileSpreadsheet, FileUp, LogOut, Sparkles, Smartphone, Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSignedIn, useMe, useProfile } from '../App'
import { api, downloadFile, type HistoryImportPreview, type Profile } from '../api'
import { formatFullDate, formatNumber } from '../format'
import { useI18n } from '../i18n'
import { Button, Card, ConfirmDialog, cx, PageHeader, SectionTitle, Segmented, Sheet, Switch, TextField, useToast } from '../ui'

export default function SettingsPage() {
  const { t } = useI18n()
  const profile = useProfile()
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const csvInput = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<{ text: string; preview: HistoryImportPreview } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const updateProfile = useMutation({
    mutationFn: (p: Partial<Profile>) => api.updateProfile(p),
    onSuccess: p => {
      qc.setQueryData(['me'], { ...me.data, profile: p })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: e => toast(e.message),
  })
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => setSignedIn(qc, { user: null }) })
  const refreshData = () => ['history', 'stats', 'exercises', 'trend', 'workout'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))

  const pickCsv = async (file: File) => {
    // Excel often saves Chinese CSVs as GBK; decode UTF-8 first and fall back if it produced replacement characters.
    const buf = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('gbk').decode(buf)
    api.previewHistoryImport(text).then(preview => setCsv({ text, preview })).catch((e: Error) => toast(e.message))
  }
  const applyCsv = () => {
    const text = csv!.text
    setCsv(null)
    api.importHistory(text).then(r => { refreshData(); toast(t('csv.done', { s: r.sessions, e: r.entries })) })
      .catch((e: Error) => toast(e.message))
  }

  return (
    <div className="pb-6">
      <PageHeader title={t('settings.title')} subtitle={me.data?.user?.username} />
      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div>
          <div className="md:hidden">
            <SectionTitle>{t('nav.plans')}</SectionTitle>
            <Card className="mx-4 divide-y divide-line">
              <Row icon={<CalendarRange size={20} />} title={t('plans.title')} onClick={() => navigate('/plans')} chevron />
              <Row icon={<BookOpen size={20} />} title={t('library.title')} onClick={() => navigate('/library')} chevron />
            </Card>
          </div>

          <SectionTitle>{t('settings.preferences')}</SectionTitle>
          <Card className="mx-4 divide-y divide-line md:mx-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>{t('settings.unit')}</span>
              <Segmented value={profile.unit} onChange={unit => updateProfile.mutate({ unit })}
                         options={[{ value: 'KG', label: 'kg' }, { value: 'LBS', label: 'lbs' }]} />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>{t('settings.language')}</span>
              <Segmented value={profile.language} onChange={language => updateProfile.mutate({ language })}
                         options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }]} />
            </div>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="block">{t('settings.addToPlan')}</span>
                <span className="block text-xs text-muted">{t('settings.addToPlanHint')}</span>
              </span>
              <Switch checked={profile.add_to_plan_by_default} label={t('settings.addToPlan')}
                      onChange={v => updateProfile.mutate({ add_to_plan_by_default: v })} />
            </label>
          </Card>

          <SectionTitle>{t('settings.body')}</SectionTitle>
          <BodyCard profile={profile} saving={updateProfile.isPending}
                    onSave={b => updateProfile.mutate(b, { onSuccess: () => toast(t('settings.bodySaved')) })} />
        </div>

        <div>
          <SectionTitle>{t('settings.importTitle')}</SectionTitle>
          <Card className="mx-4 divide-y divide-line md:mx-0">
            <Row icon={<FileSpreadsheet size={20} />} title={t('settings.template')} subtitle={t('settings.templateHint')}
                 onClick={() => downloadFile('history/template.csv', 'ironlog_import_template.csv')} />
            <Row icon={<Sparkles size={20} />} title={t('settings.prompt')} subtitle={t('settings.promptHint')}
                 onClick={async () => {
                   const { prompt } = await api.aiPrompt()
                   await navigator.clipboard.writeText(prompt)
                   toast(t('settings.promptCopied'))
                 }} />
            <Row icon={<FileUp size={20} />} title={t('settings.importCsv')} subtitle={t('settings.importCsvHint')}
                 onClick={() => csvInput.current?.click()} />
          </Card>

          <SectionTitle>{t('settings.data')}</SectionTitle>
          <Card className="mx-4 divide-y divide-line md:mx-0">
            <Row icon={<FileDown size={20} />} title={t('settings.export')} subtitle={t('settings.exportHint')}
                 onClick={() => downloadFile('history/export.csv', 'ironlog_history.csv')} />
            <Row icon={<Trash2 size={20} />} title={t('settings.clear')} subtitle={t('settings.clearHint')} danger
                 onClick={() => setConfirmClear(true)} />
          </Card>

          <SectionTitle>{t('settings.account')}</SectionTitle>
          <Card className="mx-4 divide-y divide-line md:mx-0">
            <Row icon={<Smartphone size={20} />} title={t('settings.android')} subtitle={t('settings.androidHint')}
                 onClick={() => window.open('https://github.com/yu1357465/ironlog-android', '_blank', 'noopener')} chevron />
            <Row icon={<LogOut size={20} />} title={t('auth.logout')} subtitle={me.data?.user?.username} onClick={() => logout.mutate()} />
          </Card>
        </div>
      </div>

      <input ref={csvInput} type="file" accept=".csv,text/csv,text/plain" hidden onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) pickCsv(f)
      }} />
      <CsvPreview preview={csv?.preview ?? null} onConfirm={applyCsv} onClose={() => setCsv(null)} />
      <ConfirmDialog open={confirmClear} destructive confirmLabel={t('settings.clear')} title={t('settings.clearTitle')}
                     body={t('settings.clearBody')} onClose={() => setConfirmClear(false)}
                     onConfirm={() => api.clearHistory().then(() => { refreshData(); toast(t('settings.cleared')) })} />
    </div>
  )
}

function Row({ icon, title, subtitle, onClick, danger, chevron }: {
  icon: ReactNode; title: string; subtitle?: string; onClick: () => void; danger?: boolean; chevron?: boolean
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-field/50">
      <span className={cx('shrink-0', danger ? 'text-danger' : 'text-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block', danger && 'text-danger')}>{title}</span>
        {subtitle && <span className="block text-xs text-muted">{subtitle}</span>}
      </span>
      {chevron && <ChevronRight size={18} className="text-outline" />}
    </button>
  )
}

function BodyCard({ profile, saving, onSave }: {
  profile: Profile; saving: boolean
  onSave: (b: Pick<Profile, 'height_cm' | 'wingspan_cm' | 'body_weight_kg'>) => void
}) {
  const { t } = useI18n()
  const show = (v: number) => (v > 0 ? formatNumber(v) : '')
  const [h, setH] = useState(show(profile.height_cm))
  const [w, setW] = useState(show(profile.wingspan_cm))
  const [bw, setBw] = useState(show(profile.body_weight_kg))
  useEffect(() => {
    setH(show(profile.height_cm)); setW(show(profile.wingspan_cm)); setBw(show(profile.body_weight_kg))
  }, [profile.height_cm, profile.wingspan_cm, profile.body_weight_kg])
  const n = (s: string) => Number(s || 0)
  const valid = n(h) <= 250 && n(w) <= 260 && n(bw) <= 300 && [h, w, bw].every(s => !Number.isNaN(Number(s || 0)))
  const changed = n(h) !== profile.height_cm || n(w) !== profile.wingspan_cm || n(bw) !== profile.body_weight_kg
  const num = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d.]/g, ''))
  return (
    <Card className="mx-4 p-4 md:mx-0">
      <div className="grid grid-cols-3 gap-2">
        <TextField label={t('settings.height')} inputMode="decimal" value={h} onChange={num(setH)} />
        <TextField label={t('settings.wingspan')} inputMode="decimal" value={w} onChange={num(setW)} />
        <TextField label={t('settings.bodyWeight')} inputMode="decimal" value={bw} onChange={num(setBw)} />
      </div>
      <p className={cx('mt-2 text-xs', valid ? 'text-muted' : 'text-danger')}>
        {valid ? t('settings.wingspanHint') : t('settings.outOfRange')}
      </p>
      <Button variant="tonal" className="mt-3 w-full" disabled={!valid || !changed || saving}
              onClick={() => onSave({ height_cm: n(h), wingspan_cm: n(w), body_weight_kg: n(bw) })}>
        {t('save')}
      </Button>
    </Card>
  )
}

function CsvPreview({ preview, onConfirm, onClose }: { preview: HistoryImportPreview | null; onConfirm: () => void; onClose: () => void }) {
  const { t, lang } = useI18n()
  const p = preview
  const ok = !!p && p.entries > 0
  return (
    <Sheet open={!!p} onClose={onClose} title={ok ? t('csv.previewTitle') : t('csv.nothing')} footer={ok ? <>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button onClick={onConfirm}>{t('import')}</Button>
    </> : <Button onClick={onClose}>{t('close')}</Button>}>
      {p && <div className="space-y-2 pb-2 text-sm">
        {ok && <>
          <p className="text-base font-semibold">{t('csv.summary', { s: p.sessions, e: p.entries })}</p>
          {p.first_date && p.last_date && (
            <p className="text-muted">{formatFullDate(p.first_date, lang)} — {formatFullDate(p.last_date, lang)}</p>
          )}
        </>}
        {p.new_exercises.length > 0 && (
          <p>{t('csv.newExercises', { n: p.new_exercises.length, list: p.new_exercises.slice(0, 12).join(', ') + (p.new_exercises.length > 12 ? '…' : '') })}</p>
        )}
        {p.duplicates > 0 && <p className="text-muted">{t('csv.duplicates', { n: p.duplicates })}</p>}
        {p.issues.length > 0 && <>
          <p className="text-danger">{t('csv.issues', { n: p.issues.length })}</p>
          {p.issues.slice(0, 8).map(i => (
            <p key={i.line} className="text-xs text-muted">{i.line > 0 ? t('csv.line', { n: i.line, msg: i.message }) : i.message}</p>
          ))}
        </>}
        {ok && <p className="text-xs text-muted">{t('csv.appendNote')}</p>}
      </div>}
    </Sheet>
  )
}
