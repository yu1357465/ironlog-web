import { useQuery } from '@tanstack/react-query'
import { CircleHelp, LineChart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../App'
import { api, RADAR_GROUPS, type RadarMode } from '../api'
import { RadarChart } from '../charts'
import { formatVolume, formatWeight, unitLabel, type Unit } from '../format'
import { groupLabel, useI18n } from '../i18n'
import { Card, EmptyState, IconButton, MuscleBadge, PageHeader, SectionTitle, Segmented, Sheet } from '../ui'

const MODE_COLORS: Record<RadarMode, string> = { OVERALL: 'var(--primary)', STRENGTH: '#e53935', ENDURANCE: '#2e9e4f' }

export default function StatsPage() {
  const { t, lang } = useI18n()
  const profile = useProfile()
  const unit = profile.unit as Unit
  const [mode, setMode] = useState<RadarMode>('OVERALL')
  const [help, setHelp] = useState(false)
  const stats = useQuery({ queryKey: ['stats', mode], queryFn: () => api.stats(mode), placeholderData: prev => prev })
  const s = stats.data
  const r = s?.report

  return (
    <div>
      <PageHeader title={t('stats.title')} actions={
        <IconButton label={t('stats.howTitle')} onClick={() => setHelp(true)}><CircleHelp size={20} /></IconButton>
      } />
      {s && !r && <EmptyState icon={<LineChart />} title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />}
      {s && r && <>
        <div className="grid grid-cols-3 gap-2.5 px-4 md:px-0">
          <Tile label={t('stats.sessions')} value={String(s.session_count)} />
          <Tile label={t('stats.last30')} value={String(s.sessions_last_30_days)} />
          <Tile label={t('stats.volume')} value={formatVolume(s.total_volume_kg, unit, lang)} unit={unitLabel(unit)} />
        </div>

        <div className="md:grid md:grid-cols-2 md:gap-6">
          <div>
            <SectionTitle>{t('stats.scores')}</SectionTitle>
            <Card className="mx-4 p-4 md:mx-0">
              <Segmented value={mode} onChange={setMode} options={(['OVERALL', 'STRENGTH', 'ENDURANCE'] as RadarMode[]).map(m => ({
                value: m, label: t(`stats.mode.${m}`),
              }))} />
              <p className="mt-2 text-xs text-muted">{t('stats.window', {
                window: r.recent_only ? t('stats.recent', { n: r.recent_days }) : t('stats.allTime'),
                a: s.rep_range[0], b: s.rep_range[1],
              })}</p>
              <RadarChart labels={RADAR_GROUPS.map(g => groupLabel(t, g))} values={RADAR_GROUPS.map(g => r.scores[g] ?? 0)}
                          color={MODE_COLORS[mode]} />
              <BodyInsight />
            </Card>
          </div>
          <div>
            <SectionTitle>{t('stats.structure')}</SectionTitle>
            <Card className="mx-4 p-4 md:mx-0"><EnergyBar d={r.distribution} /></Card>
            {r.best_lifts.length > 0 && <>
              <SectionTitle>{t('stats.best')}</SectionTitle>
              <Card className="mx-4 divide-y divide-line md:mx-0">
                {r.best_lifts.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 text-sm font-semibold text-outline">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <MuscleBadge group={b.group} />
                    <span className="tabular w-20 text-right font-bold">{formatWeight(b.estimated_1rm_kg, unit)} {unitLabel(unit)}</span>
                  </div>
                ))}
              </Card>
            </>}
          </div>
        </div>
      </>}
      <Sheet open={help} onClose={() => setHelp(false)} title={t('stats.howTitle')}>
        <p className="pb-4 text-sm whitespace-pre-line text-muted">{t('stats.how')}</p>
      </Sheet>
    </div>
  )
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1"><span className="tabular text-xl font-bold">{value}</span> {unit && <span className="text-xs text-muted">{unit}</span>}</p>
    </Card>
  )
}

function BodyInsight() {
  const { t } = useI18n()
  const p = useProfile()
  const ape = p.ape_index.toFixed(2)
  const missing = p.body_weight_kg <= 0 || p.height_cm <= 0 || p.wingspan_cm <= 0
  const text = p.body_weight_kg <= 0 ? t('stats.noWeight')
    : p.height_cm <= 0 || p.wingspan_cm <= 0 ? t('stats.noArms')
    : p.ape_index > 1.02 ? t('stats.apeLong', { v: ape })
    : p.ape_index < 0.98 ? t('stats.apeShort', { v: ape })
    : t('stats.apeEven', { v: ape })
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl bg-primary-soft/60 p-3 text-xs text-on-primary-soft">
      <span className="flex-1">{text}</span>
      {missing && <Link to="/settings" className="shrink-0 font-semibold text-primary">{t('stats.fillIn')}</Link>}
    </div>
  )
}

function EnergyBar({ d }: { d: { strength: number; hypertrophy: number; endurance: number } }) {
  const { t } = useI18n()
  const total = d.strength + d.hypertrophy + d.endurance
  const parts = [
    { label: t('stats.strengthRange'), n: d.strength, c: '#e53935' },
    { label: t('stats.hypertrophyRange'), n: d.hypertrophy, c: '#3f6fd8' },
    { label: t('stats.enduranceRange'), n: d.endurance, c: '#2e9e4f' },
  ]
  return (
    <>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-field">
        {parts.filter(p => p.n).map(p => <div key={p.label} style={{ flexGrow: p.n, background: p.c }} />)}
      </div>
      <div className="mt-3 flex justify-between">
        {parts.map(p => (
          <div key={p.label}>
            <p className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: p.c }} />{p.label}</p>
            <p className="pl-3.5 font-semibold">{total ? Math.round((p.n / total) * 100) : 0}%</p>
          </div>
        ))}
      </div>
    </>
  )
}
