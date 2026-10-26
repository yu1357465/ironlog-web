import { useQuery, type QueryClient } from '@tanstack/react-query'
import { BarChart3, BookOpen, CalendarRange, History, Settings } from 'lucide-react'
import { AppLogo, AppMark } from './brand'
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { api, type Me, type Profile } from './api'
import { browserLang, I18nProvider, useI18n, type TKey } from './i18n'
import AuthPage from './pages/AuthPage'
import TodayPage from './pages/TodayPage'
import { cx } from './ui'

// Secondary pages are split into their own chunks; Today loads first.
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const DayPage = lazy(() => import('./pages/DayPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

/**
 * Switch the signed-in user: drop every cached query except `me` (whose observer the app shell holds;
 * `queryClient.clear()` would orphan it), then set the new `me`.
 */
export function setSignedIn(qc: QueryClient, me: Me) {
  qc.removeQueries({ predicate: q => q.queryKey[0] !== 'me' })
  qc.setQueryData(['me'], me)
}

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })

/** Current profile (only rendered inside the logged-in shell, so it is always present). */
export function useProfile(): Profile {
  return useMe().data!.profile!
}

export default function App() {
  const me = useMe()
  if (me.isPending) return <Splash />
  const lang = me.data?.profile?.language ?? browserLang()
  return (
    <I18nProvider lang={lang}>
      {me.data?.user ? <Shell /> : <AuthPage />}
    </I18nProvider>
  )
}

function Splash() {
  return <div className="flex h-dvh items-center justify-center text-muted"><AppLogo size={48} className="animate-pulse" /></div>
}

const NAV: { to: string; key: TKey; icon: (active: boolean) => ReactNode; mobile: boolean }[] = [
  { to: '/', key: 'nav.today', icon: (active: boolean) => <AppMark size={22} filled={active} />, mobile: true },
  { to: '/plans', key: 'nav.plans', icon: () => <CalendarRange size={22} />, mobile: true },
  { to: '/history', key: 'nav.history', icon: () => <History size={22} />, mobile: true },
  { to: '/stats', key: 'nav.stats', icon: () => <BarChart3 size={22} />, mobile: true },
  { to: '/library', key: 'nav.library', icon: () => <BookOpen size={22} />, mobile: false },
  { to: '/settings', key: 'nav.settings', icon: () => <Settings size={22} />, mobile: true },
]

function Shell() {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <nav className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 px-4 py-6 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3 text-lg font-bold">
          <AppLogo size={32} />
          IronLog
        </div>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition',
            isActive ? 'bg-primary-soft text-on-primary-soft' : 'text-muted hover:bg-field hover:text-text',
          )}>
            {({ isActive }) => <>{n.icon(isActive)}{t(n.key)}</>}
          </NavLink>
        ))}
      </nav>

      <main className="min-w-0 flex-1 pb-24 md:px-8 md:pb-10">
        <Suspense fallback={<div className="p-10 text-center text-muted">{t('loading')}</div>}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/days/:dayId" element={<DayPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter(n => n.mobile).map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx(
            'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
            isActive ? 'text-primary' : 'text-muted',
          )}>
            {({ isActive }) => <>{n.icon(isActive)}{t(n.key)}</>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
