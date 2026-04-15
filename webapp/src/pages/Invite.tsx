import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getInviteToken, acceptInvite, upsertProfile } from '../lib/supabase'
import { notifyBothRelationshipEstablished } from '../lib/telegram'
import type { Profile } from '../types'

type Step = 'loading' | 'login' | 'confirm' | 'error' | 'success'

export function Invite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('loading')
  const [tokenData, setTokenData] = useState<{ owner: Profile; expires_at: string; role: 'primary' | 'co_approver' } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (data.session) setSession(data.session.user ? data.session : null)

      if (!token) {
        setErrorMessage('Invalid invite link.')
        setStep('error')
        return
      }

      const record = await getInviteToken(token)
      if (!record) {
        setErrorMessage('This invite link is invalid or does not exist.')
        setStep('error')
        return
      }
      if (record.used) {
        setErrorMessage('This invite link has already been used.')
        setStep('error')
        return
      }
      if (new Date(record.expires_at) < new Date()) {
        setErrorMessage('This invite link has expired.')
        setStep('error')
        return
      }

      if (!record.owner) {
        setErrorMessage('Invite link is broken — owner profile not found.')
        setStep('error')
        return
      }
      setTokenData({ owner: record.owner as Profile, expires_at: record.expires_at, role: (record.role ?? 'primary') as 'primary' | 'co_approver' })

      if (data.session?.user) {
        setSession(data.session as unknown as { user: { id: string; email?: string } })
        setStep('confirm')
      } else {
        setStep('login')
      }
    }
    init()
  }, [token])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)

    if (authMode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setAuthError(error.message); setAuthLoading(false); return }
      setSession(data.session as unknown as { user: { id: string; email?: string } })
      setStep('confirm')
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setAuthError(error.message); setAuthLoading(false); return }
      if (data.user) {
        await upsertProfile(data.user.id, {
          email,
          display_name: email.split('@')[0],
          subscription_status: 'inactive',
        })
        setSession(data.session as unknown as { user: { id: string; email?: string } })
        setStep('confirm')
      }
    }
    setAuthLoading(false)
  }

  async function handleAccept() {
    if (!session || !token || !tokenData) return
    setAccepting(true)
    if (tokenData.owner.id === session.user.id) {
      setErrorMessage("You can't accept your own invite. Send this link to your accountability partner.")
      setStep('error')
      setAccepting(false)
      return
    }
    const success = await acceptInvite(token, session.user.id)
    if (!success) {
      setErrorMessage('Failed to accept invite. Please try again.')
      setStep('error')
      setAccepting(false)
      return
    }

    await notifyBothRelationshipEstablished(
      tokenData.owner.telegram_chat_id,
      undefined,
      tokenData.owner.display_name,
      session.user.email?.split('@')[0] || 'Partner',
    )

    setStep('success')
    setAccepting(false)
    setTimeout(() => navigate('/dashboard'), 2000)
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-red-600 text-4xl font-bold mb-2">YT−</div>
        </div>

        {step === 'loading' && (
          <div className="text-neutral-400 text-center">Loading invite...</div>
        )}

        {step === 'error' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center flex flex-col gap-4">
            <div className="text-red-400 text-lg font-semibold">Invalid Invite</div>
            <p className="text-neutral-400 text-sm">{errorMessage}</p>
            <a href="/login" className="text-red-400 hover:text-red-300 text-sm transition-colors">
              Go to Login
            </a>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center flex flex-col gap-2">
            <div className="text-green-400 text-lg font-semibold">Partnership Established!</div>
            <p className="text-neutral-400 text-sm">Redirecting to dashboard...</p>
          </div>
        )}

        {step === 'login' && tokenData && (
          <div className="flex flex-col gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
              <p className="text-white font-medium">
                <span className="text-red-400">{tokenData.owner.display_name}</span> invited you to be their{' '}
                {tokenData.role === 'co_approver' ? 'co-approver' : 'accountability partner'}.
              </p>
              <p className="text-neutral-500 text-xs mt-1">Sign in or create an account to continue.</p>
            </div>

            <form onSubmit={handleAuth} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${authMode === 'login' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${authMode === 'signup' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
                >
                  Sign Up
                </button>
              </div>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Email"
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
              />

              {authError && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-sm">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In & Continue' : 'Create Account & Continue'}
              </button>
            </form>
          </div>
        )}

        {step === 'confirm' && tokenData && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-4">
            <div className="text-center">
              <p className="text-white font-medium text-lg">Accept Partnership?</p>
              <p className="text-neutral-400 text-sm mt-1">
                <span className="text-red-400 font-medium">{tokenData.owner.display_name}</span> wants you to be their{' '}
                {tokenData.role === 'co_approver' ? 'co-approver' : 'accountability partner'} on YouTubeMinus.
              </p>
            </div>
            <p className="text-neutral-500 text-xs text-center">
              {tokenData.role === 'co_approver'
                ? "You'll help review their YouTube watch requests. As a co-approver, you'll have a 12-hour cooldown before you can approve requests."
                : "You'll review their YouTube watch requests and approve or deny them."}
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {accepting ? 'Accepting...' : 'Accept Partnership'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-2 text-neutral-400 hover:text-white text-sm transition-colors"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
