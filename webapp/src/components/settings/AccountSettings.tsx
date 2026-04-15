import { useState } from 'react'
import type { Profile } from '../../types'
import { upsertProfile } from '../../lib/supabase'

interface AccountSettingsProps {
  profile: Profile
  onUpdate: (p: Profile) => void
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  inactive: 'bg-neutral-700 text-neutral-400',
  cancelled: 'bg-red-900 text-red-300',
}

export function AccountSettings({ profile, onUpdate }: AccountSettingsProps) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!displayName.trim()) return
    setSaving(true)
    setError(null)
    const updated = await upsertProfile(profile.id, { display_name: displayName.trim() })
    if (updated) {
      onUpdate(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError('Failed to save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-white font-semibold text-base">Account Settings</h2>

      <div className="flex flex-col gap-1">
        <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Email</label>
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-400 text-sm">
          {profile.email}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-neutral-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-neutral-400 text-xs font-medium uppercase tracking-wider">Subscription</label>
        <div>
          <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${STATUS_BADGE[profile.subscription_status] || 'bg-neutral-700 text-neutral-400'}`}>
            {profile.subscription_status}
          </span>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || displayName.trim() === profile.display_name}
        className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  )
}
