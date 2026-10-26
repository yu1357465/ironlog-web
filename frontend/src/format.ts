import type { Lang } from './i18n'

export const LBS_PER_KG = 2.20462
export type Unit = 'KG' | 'LBS'

export const unitLabel = (u: Unit) => (u === 'LBS' ? 'lbs' : 'kg')
export const fromKg = (kg: number, u: Unit) => (u === 'LBS' ? kg * LBS_PER_KG : kg)
export const toKg = (v: number, u: Unit) => (u === 'LBS' ? v / LBS_PER_KG : v)

/** 40 → "40", 42.5 → "42.5" (one decimal at most). */
export function formatNumber(v: number): string {
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export const formatWeight = (kg: number, u: Unit) => formatNumber(fromKg(kg, u))

export function formatVolume(kg: number, u: Unit, lang: Lang): string {
  const v = fromKg(kg, u)
  if (lang === 'zh' && v >= 10_000) return `${(v / 10_000).toFixed(1)}万`
  if (lang === 'en' && v >= 10_000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v))
}

export function formatSessionDate(iso: string, lang: Lang): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: lang === 'zh' ? 'numeric' : 'short', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export const formatShortDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const formatFullDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

export function relativeDay(iso: string, lang: Lang): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86_400_000)
  if (days === 0) return lang === 'zh' ? '今天' : 'today'
  if (days === 1) return lang === 'zh' ? '昨天' : 'yesterday'
  if (days <= 30) return lang === 'zh' ? `${days} 天前` : `${days} days ago`
  return formatFullDate(iso, lang)
}

/** yyyy-mm-dd for <input type="date"> in local time. */
export const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
