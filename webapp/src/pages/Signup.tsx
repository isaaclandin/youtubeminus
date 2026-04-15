import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, upsertProfile } from '../lib/supabase'

export function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await upsertProfile(data.user.id, {
        email,
        display_name: displayName.trim() || email.split('@')[0],
        subscription_status: 'inactive',
      })
    }

    navigate('/dashboard')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-red-600 text-4xl font-bold mb-2">YT−</div>
          <h1 className="text-white text-2xl font-semibold">Create account</h1>
          <p className="text-neutral-400 text-sm mt-1">YouTubeMinus Accountability</p>
        </div>

        <form onSubmit={handleSignup} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
              placeholder="Your name"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-neutral-500 text-sm text-center mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-red-400 hover:text-red-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
