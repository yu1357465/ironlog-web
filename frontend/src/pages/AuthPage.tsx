import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dumbbell } from 'lucide-react'
import { useState } from 'react'
import { setSignedIn } from '../App'
import { api } from '../api'
import { browserLang, useI18n } from '../i18n'
import { Button, Card, TextField } from '../ui'

export default function AuthPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const submit = useMutation({
    mutationFn: () => mode === 'login' ? api.login(username, password) : api.register(username, password, browserLang()),
    onSuccess: me => setSignedIn(qc, me),
  })

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary">
            <Dumbbell size={28} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">IronLog</h1>
          <p className="mt-2 text-sm text-muted">{t('auth.tagline')}</p>
        </div>
        <Card className="p-6">
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit.mutate() }}>
            <TextField label={t('auth.username')} value={username} autoComplete="username" required
                       onChange={e => setUsername(e.target.value)} />
            <TextField label={t('auth.password')} type="password" value={password} required
                       autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                       onChange={e => setPassword(e.target.value)} />
            {submit.error && <p className="text-sm text-danger" role="alert">{submit.error.message}</p>}
            <Button type="submit" className="w-full" disabled={submit.isPending || !username || !password}>
              {mode === 'login' ? t('auth.login') : t('auth.register')}
            </Button>
          </form>
        </Card>
        <button
          className="mt-4 w-full text-center text-sm font-medium text-primary"
          onClick={() => { setMode(m => (m === 'login' ? 'register' : 'login')); submit.reset() }}
        >
          {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
        </button>
      </div>
    </div>
  )
}
