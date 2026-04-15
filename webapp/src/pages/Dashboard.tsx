import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getProfile, upsertProfile } from '../lib/supabase'
import { TelegramConnect } from '../components/onboarding/TelegramConnect'
import { TelegramBanner } from '../components/onboarding/TelegramBanner'
import { useRelationships } from '../hooks/useRelationships'
import { useOwnerRequests, usePartnerRequests } from '../hooks/useRequests'
import { useRealtime } from '../hooks/useRealtime'
import { PendingRequests } from '../components/owner/PendingRequests'
import { ActiveApprovals } from '../components/owner/ActiveApprovals'
import { RequestHistory } from '../components/owner/RequestHistory'
import { NeedsResponse } from '../components/partner/NeedsResponse'
import { PartnerActiveApprovals } from '../components/partner/ActiveApprovals'
import { OwnerHistory } from '../components/partner/OwnerHistory'
import { AccountSettings } from '../components/settings/AccountSettings'
import { PartnershipManager } from '../components/settings/PartnershipManager'
import type { Profile, Relationship } from '../types'
import { notifyPartnersNewRequest } from '../lib/telegram'
import { getActivePartners } from '../lib/supabase'
import { createRequest } from '../lib/supabase'
import { extractYouTubeVideoId } from '../lib/relationships'

// Owner video request form embedded in dashboard
function OwnerRequestForm({
  relationships,
  currentProfile,
  onUpdate,
}: {
  relationships: Relationship[]
  currentProfile: Profile
  onUpdate: () => void
}) {
  const [url, setUrl] = useState('')
  const [reason, setReason] = useState('')
  const [relationshipId, setRelationshipId] = useState(relationships[0]?.id || '')
  const [videoPreview, setVideoPreview] = useState<{ id: string; title: string; thumbnail: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUrlChange(value: string) {
    setUrl(value)
    setVideoPreview(null)
    const videoId = extractYouTubeVideoId(value)
    if (!videoId) return
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      )
      if (res.ok) {
        const data = await res.json()
        setVideoPreview({ id: videoId, title: data.title, thumbnail: data.thumbnail_url })
      }
    } catch { /* ignore */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!videoPreview) { setError('Enter a valid YouTube URL'); return }
    if (!reason.trim()) { setError('Please provide a reason'); return }
    if (!relationshipId) { setError('No relationship selected'); return }
    setLoading(true)
    setError(null)

    const result = await createRequest({
      video_id: videoPreview.id,
      video_title: videoPreview.title,
      video_thumbnail: videoPreview.thumbnail,
      reason: reason.trim(),
      relationship_id: relationshipId,
      requested_by: 'account_owner',
    })

    if (result) {
      // Notify partners
      const partners = await getActivePartners(currentProfile.id)
      const chatIds = partners.map((p) => p.telegram_chat_id).filter(Boolean) as string[]
      await notifyPartnersNewRequest(chatIds, currentProfile.display_name, videoPreview.title, reason.trim(), result.id)
      setUrl('')
      setReason('')
      setVideoPreview(null)
      onUpdate()
    } else {
      setError('Failed to submit request.')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
      <h3 className="text-white font-medium text-sm">Request to Watch</h3>
      {relationships.length > 1 && (
        <select
          value={relationshipId}
          onChange={(e) => setRelationshipId(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
        >
          {relationships.map((r) => (
            <option key={r.id} value={r.id}>
              {r.partner?.display_name || 'Partner'}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        placeholder="YouTube URL"
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
      />
      {videoPreview && (
        <div className="text-neutral-300 text-sm bg-neutral-800 rounded-lg px-3 py-2 line-clamp-1">
          {videoPreview.title}
        </div>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why do you want to watch this?"
        rows={2}
        className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500 resize-none"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || !videoPreview}
        className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
      >
        {loading ? 'Submitting...' : 'Request Approval'}
      </button>
    </form>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'account' | 'partnerships'>('account')
  const [showTelegramSetup, setShowTelegramSetup] = useState(false)
  const [selectedOwnerRelId, setSelectedOwnerRelId] = useState<string | null>(null)

  const { ownerRelationships, partnerRelationships, loading: relsLoading, refetch: refetchRels } = useRelationships()

  const ownerRelIds = ownerRelationships.map((r) => r.id)
  const partnerRelIds = partnerRelationships.map((r) => r.id)
  const allRelIds = [...ownerRelIds, ...partnerRelIds]

  const { pending, active, history, refetch: refetchOwner } = useOwnerRequests(ownerRelIds)
  const { needsResponse, activeGranted, ownerHistory, refetch: refetchPartner } = usePartnerRequests(partnerRelIds)

  const refetchAll = useCallback(() => {
    refetchOwner()
    refetchPartner()
    refetchRels()
  }, [refetchOwner, refetchPartner, refetchRels])

  useRealtime(allRelIds, refetchAll)

  useEffect(() => {
    if (!selectedOwnerRelId && partnerRelationships.length > 0) {
      const first = partnerRelationships.find((r) => r.status === 'active')
      if (first) setSelectedOwnerRelId(first.id)
    }
  }, [partnerRelationships, selectedOwnerRelId])

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        navigate('/login')
        return
      }
      const { user } = data.session
      let profile = await getProfile(user.id)
      // Create profile if it doesn't exist (e.g. pre-existing auth account)
      if (!profile) {
        profile = await upsertProfile(user.id, {
          email: user.email ?? '',
          display_name: user.email?.split('@')[0] ?? 'User',
          subscription_status: 'inactive',
        })
      }
      setCurrentProfile(profile)
      setSessionLoading(false)
    }
    checkSession()
  }, [navigate])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (sessionLoading || relsLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </div>
    )
  }

  const ownerNames: Record<string, string> = {}
  partnerRelationships.forEach((r) => {
    ownerNames[r.id] = r.owner?.display_name || r.owner?.email || 'Owner'
  })

  const ownerChatIds: Record<string, string | undefined> = {}
  partnerRelationships.forEach((r) => {
    ownerChatIds[r.id] = r.owner?.telegram_chat_id
  })

  const partnerChatIds: Record<string, string | undefined> = {}
  partnerRelationships.forEach((r) => {
    // Partner chat ids from current user — not available per-relationship here
    partnerChatIds[r.id] = currentProfile?.telegram_chat_id
  })

  const hasNoRelationships = ownerRelationships.length === 0 && partnerRelationships.length === 0

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-neutral-950 border-b border-neutral-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-red-600 text-xl font-bold">YT−</div>
          <div className="flex items-center gap-3">
            <span className="text-neutral-400 text-sm hidden sm:block">
              {currentProfile?.display_name || currentProfile?.email}
            </span>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="text-neutral-500 hover:text-white text-sm transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-8">
        {/* Telegram connection */}
        {currentProfile && !currentProfile.telegram_chat_id && (
          <>
            <TelegramBanner onSetup={() => setShowTelegramSetup(true)} />
            {showTelegramSetup && (
              <TelegramConnect
                userId={currentProfile.id}
                onConnected={async () => {
                  const refreshed = await getProfile(currentProfile.id)
                  if (refreshed) setCurrentProfile(refreshed)
                  setShowTelegramSetup(false)
                }}
              />
            )}
          </>
        )}

        {/* Settings panel */}
        {showSettings && currentProfile && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex gap-3 border-b border-neutral-800 pb-3">
              <button
                onClick={() => setSettingsTab('account')}
                className={`text-sm font-medium pb-1 transition-colors ${settingsTab === 'account' ? 'text-white border-b-2 border-red-600' : 'text-neutral-400 hover:text-white'}`}
              >
                Account
              </button>
              <button
                onClick={() => setSettingsTab('partnerships')}
                className={`text-sm font-medium pb-1 transition-colors ${settingsTab === 'partnerships' ? 'text-white border-b-2 border-red-600' : 'text-neutral-400 hover:text-white'}`}
              >
                Partnerships
              </button>
            </div>
            {settingsTab === 'account' && (
              <AccountSettings
                profile={currentProfile}
                onUpdate={(p) => setCurrentProfile(p)}
              />
            )}
            {settingsTab === 'partnerships' && (
              <PartnershipManager
                ownerRelationships={ownerRelationships}
                partnerRelationships={partnerRelationships}
                currentProfile={currentProfile}
                onUpdate={refetchAll}
              />
            )}
          </div>
        )}

        {/* No relationships onboarding */}
        {hasNoRelationships && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center flex flex-col gap-3">
            <div className="text-white font-semibold text-lg">Get Started</div>
            <p className="text-neutral-400 text-sm">
              Invite an accountability partner, or ask someone to invite you via their dashboard.
            </p>
            <button
              onClick={() => { setShowSettings(true); setSettingsTab('partnerships') }}
              className="mx-auto px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Set Up Partnership
            </button>
          </div>
        )}

        {/* Owner Section */}
        {ownerRelationships.length > 0 && currentProfile && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold">My Requests</h2>
              <span className="text-neutral-500 text-xs">(your YouTube accountability)</span>
            </div>
            <OwnerRequestForm
              relationships={ownerRelationships.filter((r) => r.status === 'active')}
              currentProfile={currentProfile}
              onUpdate={refetchAll}
            />
            <PendingRequests requests={pending} onUpdate={refetchAll} />
            <ActiveApprovals approvals={active} onUpdate={refetchAll} />
            <RequestHistory requests={history} />
          </section>
        )}

        {/* Partner Section */}
        {partnerRelationships.length > 0 && currentProfile && (() => {
          const activePartnerRels = partnerRelationships.filter((r) => r.status === 'active')
          const selectedRel = activePartnerRels.find((r) => r.id === selectedOwnerRelId)
          const relNeedsResponse = needsResponse.filter((r) => r.relationship_id === selectedOwnerRelId)
          const relActive = activeGranted.filter((r) => r.relationship_id === selectedOwnerRelId)
          const relHistory = ownerHistory.filter((r) => r.relationship_id === selectedOwnerRelId)
          const isEmpty = relNeedsResponse.length === 0 && relActive.length === 0 && relHistory.length === 0

          return (
            <section className="flex flex-col gap-4">
              <h2 className="text-white font-semibold">Partner Dashboard</h2>

              {/* Owner selector */}
              <div className="flex flex-wrap gap-2">
                {activePartnerRels.map((rel) => {
                  const pendingCount = needsResponse.filter((r) => r.relationship_id === rel.id).length
                  const isSelected = selectedOwnerRelId === rel.id
                  return (
                    <button
                      key={rel.id}
                      onClick={() => setSelectedOwnerRelId(rel.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-neutral-700 text-white'
                          : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600'
                      }`}
                    >
                      {ownerNames[rel.id] || 'Owner'}
                      {pendingCount > 0 && (
                        <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Selected owner's requests */}
              {selectedRel && (
                <div className="flex flex-col gap-4">
                  <NeedsResponse
                    requests={relNeedsResponse}
                    ownerChatIds={ownerChatIds}
                    partnerChatIds={partnerChatIds}
                    ownerNames={ownerNames}
                    partnerName={currentProfile.display_name}
                    onUpdate={refetchAll}
                  />
                  <PartnerActiveApprovals
                    approvals={relActive}
                    ownerNames={ownerNames}
                    onUpdate={refetchAll}
                  />
                  <OwnerHistory
                    requests={relHistory}
                    ownerName={ownerNames[selectedRel.id] || 'Owner'}
                  />
                  {isEmpty && (
                    <p className="text-neutral-500 text-sm text-center py-6">No requests yet from {ownerNames[selectedRel.id] || 'this user'}.</p>
                  )}
                </div>
              )}
            </section>
          )
        })()}
      </div>
    </div>
  )
}
