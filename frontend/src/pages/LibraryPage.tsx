import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../api'
import { groupLabel, useI18n } from '../i18n'
import { Button, Card, Chip, ConfirmDialog, EmptyState, MuscleBadge, PageHeader, Sheet, TextField, useToast } from '../ui'

export default function LibraryPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const toast = useToast()
  const library = useQuery({ queryKey: ['exercises'], queryFn: api.exercises })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MuscleGroup | null>(null)
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [archiving, setArchiving] = useState<Exercise | null>(null)

  const all = library.data ?? []
  const q = query.trim().toLowerCase()
  const shown = all.filter(e => (!filter || e.muscle_group === filter) && (!q || e.name.toLowerCase().includes(q)))

  const done = () => {
    qc.invalidateQueries({ queryKey: ['exercises'] })
    qc.invalidateQueries({ queryKey: ['workout'] })
    qc.invalidateQueries({ queryKey: ['history'] })
  }
  const save = useMutation({
    mutationFn: ({ ex, name, group }: { ex: Exercise | 'new'; name: string; group: MuscleGroup }) =>
      ex === 'new' ? api.createExercise(name, group) : api.updateExercise(ex.id, name, group),
    onSuccess: () => { done(); setEditing(null) },
    onError: e => toast(e.message),
  })
  const archive = useMutation({
    mutationFn: (e: Exercise) => api.archiveExercise(e.id),
    onSuccess: () => { done(); setEditing(null); toast(t('library.deleted')) },
  })

  return (
    <div>
      <PageHeader title={t('library.title')} subtitle={t('library.count', { n: all.length })}
                  actions={<Button onClick={() => setEditing('new')}><Plus size={18} />{t('library.new')}</Button>} />
      <div className="px-4 md:px-0">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-card px-3">
          <Search size={18} className="text-muted" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('library.search')}
                 className="h-full flex-1 bg-transparent outline-none" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 md:mx-0 md:flex-wrap md:px-0">
          <Chip selected={!filter} onClick={() => setFilter(null)}>{t('library.all')}</Chip>
          {MUSCLE_GROUPS.map(g => <Chip key={g} selected={filter === g} onClick={() => setFilter(filter === g ? null : g)}>{groupLabel(t, g)}</Chip>)}
        </div>
        {library.isSuccess && !shown.length && <EmptyState icon={<SearchX />} title={t('library.emptyTitle')} body={t('library.emptySearch')} />}
        {shown.length > 0 && (
          <Card className="divide-y divide-line">
            {shown.map(e => (
              <button key={e.id} onClick={() => setEditing(e)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-field/50">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <MuscleBadge group={e.muscle_group} />
              </button>
            ))}
          </Card>
        )}
      </div>
      <EditSheet exercise={editing} initialName={editing === 'new' ? query.trim() : ''} saving={save.isPending}
                 onSave={(name, group) => editing && save.mutate({ ex: editing, name, group })}
                 onArchive={() => editing && editing !== 'new' && setArchiving(editing)}
                 onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!archiving} destructive confirmLabel={t('delete')}
                     title={t('library.deleteTitle', { name: archiving?.name ?? '' })} body={t('library.deleteBody')}
                     onClose={() => setArchiving(null)} onConfirm={() => archiving && archive.mutate(archiving)} />
    </div>
  )
}

function EditSheet({ exercise, initialName, saving, onSave, onArchive, onClose }: {
  exercise: Exercise | 'new' | null; initialName: string; saving: boolean
  onSave: (name: string, group: MuscleGroup) => void; onArchive: () => void; onClose: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup>('CHEST')
  useEffect(() => {
    if (!exercise) return
    setName(exercise === 'new' ? initialName : exercise.name)
    setGroup(exercise === 'new' ? 'CHEST' : exercise.muscle_group)
  }, [exercise, initialName])
  const isNew = exercise === 'new'
  return (
    <Sheet open={!!exercise} onClose={onClose} title={isNew ? t('library.new') : t('library.edit')} footer={<>
      {!isNew && <Button variant="danger" className="mr-auto" onClick={onArchive}>{t('delete')}</Button>}
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
      <Button disabled={!name.trim() || saving} onClick={() => onSave(name.trim(), group)}>{t('save')}</Button>
    </>}>
      <TextField label={t('name')} value={name} autoFocus maxLength={60} onChange={e => setName(e.target.value)} />
      <p className="mt-4 mb-2 text-sm font-semibold">{t('library.groupHint')}</p>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_GROUPS.map(g => <Chip key={g} selected={g === group} onClick={() => setGroup(g)}>{groupLabel(t, g)}</Chip>)}
      </div>
      {!isNew && <p className="mt-3 text-xs text-muted">{t('library.renameHint')}</p>}
    </Sheet>
  )
}
