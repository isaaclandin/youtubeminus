import { useState } from 'react'
import type { Relationship, Profile } from '../../types'
import { sendInvite, dissolveRelationship } from '../../lib/supabase'
import { notifyBothRelationshipDissolved } from '../../lib/telegram'

interface PartnershipManagerProps {
  ownerRelationships: Relationship[]
  partnerRelationships: Relationship[]
  currentProfile: Profile
  onUpdate: () => void
}

export function PartnershipManager({
  ownerRelationships,
  partnerRelationships,
  currentProfile,
  onUpdate,
}: PartnershipManagerProps) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string; link?: string } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [dissolveConfirm, setDissolveConfirm] = useState<string | null>(null)
  const [dissolvingId, setDissolvingId] = useState<string | null>(null)

  const activeOwnerRels = ownerRelationships.filter((r) => r.status === 'active')
  const canInvite = activeOwnerRels.length < 3

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteSending(true)
    setInviteResult(null)
    try {
      const result = await sendInvite(inviteEmail.trim())
      if (result.ok) {
        if (result.method === 'telegram') {
          setInviteResult({ ok: true, message: '✓ Invite sent via Telegram' })
          setInviteEmail('')
          setTimeout(() => setInviteResult(null), 5000)
        } else if (result.method === 'email') {
          setInviteResult({ ok: true, message: '✓ Invite email sent' })
          setInviteEmail('')
          setTimeout(() => setInviteResult(null), 5000)
        } else {
          // Existing user, no Telegram — show link to copy
          setInviteResult({ ok: true, message: 'They already have an account. Send them this link:', link: result.inviteUrl })
        }
        onUpdate()
      } else {
        setInviteResult({ ok: false, message: result.error })
      }
    } catch {
      setInviteResult({ ok: false, message: 'Something went wrong. Please try again.' })
    }
    setInviteSending(false)
  }

  async function handleDissolve(rel: Relationship) {
    if (dissolveConfirm !== rel.id) {
      setDissolveConfirm(rel.id)
      return
    }
    setDissolvingId(rel.id)
    const success = await dissolveRelationship(rel.id)
    if (success) {
      await notifyBothRelationshipDissolved(
        rel.owner?.telegram_chat_id,
        currentProfile.telegram_chat_id,
        rel.owner?.display_name || 'Owner',
        currentProfile.display_name,
      )
      onUpdate()
    }
    setDissolvingId(null)
    setDissolveConfirm(null)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Owner section */}
      {ownerRelationships.length > 0 || true ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-white font-semibold text-sm">Your Accountability Partners</h3>
          {activeOwnerRels.length === 0 && (
            <p className="text-neutral-500 text-sm">No active partners yet.</p>
          )}
          {activeOwnerRels.map((rel) => (
            <div key={rel.id} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-white text-sm">{rel.partner?.display_name || rel.partner?.email || 'Partner'}</span>
              <span className="text-neutral-500 text-xs">Partner (they can remove)</span>
            </div>
          ))}

          {canInvite ? (
            <form onSubmit={handleSendInvite} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteResult(null) }}
                  placeholder="Partner's email address"
                  required
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
                />
                <button
                  type="submit"
                  disabled={inviteSending || !inviteEmail.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex-shrink-0"
                >
                  {inviteSending ? 'Sending…' : 'Invite'}
                </button>
              </div>
              {inviteResult && (
                <div className={`flex flex-col gap-1 rounded-lg px-3 py-2 ${inviteResult.ok ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
                  <p className={`text-sm font-medium ${inviteResult.ok ? 'text-green-300' : 'text-red-300'}`}>
                    {inviteResult.message}
                  </p>
                  {inviteResult.link && (
                    <div className="flex gap-2 items-center">
                      <span className="text-neutral-400 text-xs truncate flex-1">{inviteResult.link}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(inviteResult.link!)
                          setCopiedLink(true)
                          setTimeout(() => setCopiedLink(false), 2000)
                        }}
                        className="text-xs px-2 py-1 border border-neutral-600 hover:border-neutral-400 text-neutral-300 hover:text-white rounded transition-colors flex-shrink-0"
                      >
                        {copiedLink ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          ) : (
            <p className="text-neutral-500 text-sm">Max 3 partners reached.</p>
          )}
        </div>
      ) : null}

      {/* Partner section */}
      {partnerRelationships.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-white font-semibold text-sm">Accounts You Partner For</h3>
          {partnerRelationships.filter((r) => r.status === 'active').map((rel) => (
            <div key={rel.id} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-white text-sm">{rel.owner?.display_name || rel.owner?.email || 'Owner'}</span>
              {dissolveConfirm === rel.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setDissolveConfirm(null)}
                    className="px-2 py-1 text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDissolve(rel)}
                    disabled={dissolvingId === rel.id}
                    className="px-2 py-1 text-xs text-red-400 border border-red-800 rounded hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    {dissolvingId === rel.id ? 'Dissolving...' : 'Confirm'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDissolve(rel)}
                  className="px-2 py-1 text-xs text-red-400 border border-red-900 rounded hover:bg-red-900/20 transition-colors"
                >
                  Dissolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
