/** Typed client for the Django REST API (backend/ironlog/urls.py). */

export type MuscleGroup = 'CHEST' | 'BACK' | 'LEGS' | 'SHOULDERS' | 'ARMS' | 'CORE' | 'OTHER'
export const MUSCLE_GROUPS: MuscleGroup[] = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'OTHER']
export const RADAR_GROUPS: MuscleGroup[] = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE']

export interface Profile {
  unit: 'KG' | 'LBS'
  add_to_plan_by_default: boolean
  height_cm: number
  wingspan_cm: number
  body_weight_kg: number
  language: 'en' | 'zh'
  ape_index: number
}
export interface Me {
  user: { username: string } | null
  profile?: Profile
}
export interface Exercise {
  id: number
  name: string
  muscle_group: MuscleGroup
}
export interface PlanSummary {
  id: number
  name: string
  is_active: boolean
  current_day_id: number | null
  days: { id: number; name: string; exercise_count: number }[]
}
export interface DayItem {
  id: number
  exercise: Exercise
  sets: number
  reps: number
  weight_kg: number
}
export interface DayDetail {
  id: number
  name: string
  plan_id: number
  items: DayItem[]
}
export interface ActiveItem {
  id: number
  exercise: Exercise
  weight_kg: number
  sets: number
  reps: number
  completed: boolean
  in_plan: boolean
}
export interface Workout {
  plan: { id: number; name: string } | null
  days: { id: number; name: string }[]
  current_day_id: number | null
  items: ActiveItem[]
}
export interface Entry {
  id: number
  exercise: Exercise
  weight_kg: number
  sets: number
  reps: number
}
export interface Session {
  id: number
  performed_at: string
  plan_name: string | null
  day_name: string | null
  entries: Entry[]
  volume_kg: number
}
export interface HistoryPage {
  total: number
  page: number
  page_size: number
  sessions: Session[]
}
export interface SharedPlan {
  name: string
  days: { name: string; exercises: { name: string; group: MuscleGroup; sets: number; reps: number; weightKg?: number }[] }[]
  exercise_count: number
  includes_weights: boolean
}
export interface ShareInfo {
  plan: SharedPlan
  code: string
  text: string
  file_name: string
}
export interface PlanImportPreview {
  plan: SharedPlan
  final_name: string
  new_exercises: string[]
}
export interface HistoryImportPreview {
  sessions: number
  entries: number
  duplicates: number
  new_exercises: string[]
  issues: { line: number; message: string }[]
  first_date: string | null
  last_date: string | null
}
export type RadarMode = 'OVERALL' | 'STRENGTH' | 'ENDURANCE'
export interface Stats {
  mode: RadarMode
  rep_range: [number, number]
  session_count: number
  sessions_last_30_days: number
  total_volume_kg: number
  report: null | {
    scores: Record<MuscleGroup, number>
    recent_only: boolean
    recent_days: number
    distribution: { strength: number; hypertrophy: number; endurance: number }
    best_lifts: { name: string; group: MuscleGroup; estimated_1rm_kg: number }[]
  }
}
export interface TrendPoint {
  performed_at: string
  weight_kg: number
  sets: number
  reps: number
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? ''
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'X-CSRFToken': csrfToken(),
      'X-Timezone': timeZone,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : firstFieldError(data) ?? res.statusText
    throw new ApiError(res.status, detail, data.code)
  }
  return data as T
}

function firstFieldError(data: Record<string, unknown>): string | undefined {
  for (const [field, value] of Object.entries(data)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return `${field}: ${value[0]}`
  }
  return undefined
}

const get = <T>(p: string) => request<T>('GET', p)
const post = <T>(p: string, b: unknown = {}) => request<T>('POST', p, b)
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b)
const del = <T>(p: string) => request<T>('DELETE', p)

export const api = {
  me: () => get<Me>('auth/me'),
  login: (username: string, password: string) => post<Me>('auth/login', { username, password }),
  register: (username: string, password: string, language: string) =>
    post<Me>('auth/register', { username, password, language }),
  logout: () => post<void>('auth/logout'),
  updateProfile: (p: Partial<Profile>) => patch<Profile>('profile', p),

  exercises: () => get<Exercise[]>('exercises'),
  createExercise: (name: string, muscle_group: MuscleGroup) => post<Exercise>('exercises', { name, muscle_group }),
  updateExercise: (id: number, name: string, muscle_group: MuscleGroup) =>
    patch<Exercise>(`exercises/${id}`, { name, muscle_group }),
  archiveExercise: (id: number) => del<void>(`exercises/${id}`),
  trend: (id: number) => get<TrendPoint[]>(`exercises/${id}/trend`),

  plans: () => get<PlanSummary[]>('plans'),
  createPlan: (name: string) => post<PlanSummary[]>('plans', { name }),
  renamePlan: (id: number, name: string) => patch<PlanSummary[]>(`plans/${id}`, { name }),
  deletePlan: (id: number) => del<PlanSummary[]>(`plans/${id}`),
  activatePlan: (id: number) => post<PlanSummary[]>(`plans/${id}/activate`),
  reorderPlans: (ids: number[]) => post<PlanSummary[]>('plans/reorder', { ids }),
  addDay: (planId: number, name: string) => post<PlanSummary[]>(`plans/${planId}/days`, { name }),
  reorderDays: (planId: number, ids: number[]) => post<PlanSummary[]>(`plans/${planId}/days/reorder`, { ids }),
  day: (id: number) => get<DayDetail>(`days/${id}`),
  renameDay: (id: number, name: string) => patch<DayDetail>(`days/${id}`, { name }),
  deleteDay: (id: number) => del<PlanSummary[]>(`days/${id}`),
  copyDay: (id: number, target_plan_id: number) => post<PlanSummary[]>(`days/${id}/copy`, { target_plan_id }),
  addDayItem: (dayId: number, name: string, muscle_group: MuscleGroup) =>
    post<DayDetail>(`days/${dayId}/items`, { name, muscle_group }),
  reorderDayItems: (dayId: number, ids: number[]) => post<DayDetail>(`days/${dayId}/items/reorder`, { ids }),
  updateDayItem: (id: number, v: Partial<Pick<DayItem, 'sets' | 'reps' | 'weight_kg'>>) =>
    patch<DayDetail>(`day-items/${id}`, v),
  deleteDayItem: (id: number) => del<DayDetail>(`day-items/${id}`),
  share: (planId: number, weights: boolean) => get<ShareInfo>(`plans/${planId}/share?weights=${weights ? 1 : 0}`),
  previewPlanImport: (text: string) => post<PlanImportPreview>('plans/import/preview', { text }),
  importPlan: (text: string) =>
    post<{ plan_id: number; name: string; is_active: boolean; plans: PlanSummary[] }>('plans/import', { text }),

  workout: () => get<Workout>('workout'),
  addActive: (name: string, muscle_group: MuscleGroup, add_to_plan: boolean) =>
    post<Workout>('workout/items', { name, muscle_group, add_to_plan }),
  updateActive: (id: number, v: Partial<Pick<ActiveItem, 'weight_kg' | 'sets' | 'reps' | 'completed'>>) =>
    patch<Workout>(`workout/items/${id}`, v),
  deleteActive: (id: number, removeFromPlan: boolean) =>
    del<Workout & { undo: unknown }>(`workout/items/${id}${removeFromPlan ? '?remove_from_plan=1' : ''}`),
  restoreActive: (undo: unknown) => post<Workout>('workout/items/restore', { undo }),
  setInPlan: (id: number, in_plan: boolean) => post<Workout>(`workout/items/${id}/in-plan`, { in_plan }),
  replaceActive: (id: number, name: string, muscle_group: MuscleGroup) =>
    post<Workout>(`workout/items/${id}/replace`, { name, muscle_group }),
  reorderActive: (ids: number[]) => post<Workout>('workout/reorder', { ids }),
  selectDay: (day_id: number) => post<Workout>('workout/select-day', { day_id }),
  reloadDay: () => post<Workout>('workout/reload'),
  finish: (mark_all: boolean) => post<Workout & { archived: number; next_day: string | null }>('workout/finish', { mark_all }),

  history: (page: number) => get<HistoryPage>(`history?page=${page}`),
  clearHistory: () => del<void>('history'),
  renameSession: (id: number, day_name: string) => patch<Session>(`history/sessions/${id}`, { day_name }),
  deleteSession: (id: number) => del<void>(`history/sessions/${id}`),
  updateEntry: (id: number, v: Partial<Pick<Entry, 'weight_kg' | 'sets' | 'reps'>>) => patch<Entry>(`history/entries/${id}`, v),
  deleteEntry: (id: number) => del<void>(`history/entries/${id}`),
  addManual: (v: {
    performed_at: string; day_name: string; name: string; muscle_group: MuscleGroup
    weight_kg: number; sets: number; reps: number
  }) => post<Session>('history/manual', v),
  aiPrompt: () => get<{ prompt: string }>('history/ai-prompt'),
  previewHistoryImport: (text: string) => post<HistoryImportPreview>('history/import/preview', { text }),
  importHistory: (text: string) => post<HistoryImportPreview>('history/import', { text }),
  stats: (mode: RadarMode) => get<Stats>(`stats?mode=${mode}`),
}

/** Download a server-generated file (CSV) with the session cookie. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await fetch(`/api/${path}`, { credentials: 'same-origin', headers: { 'X-Timezone': timeZone } })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName
  saveBlob(await res.blob(), name)
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
