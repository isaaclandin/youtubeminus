import { useState } from 'react'
import type { Request, DurationType } from '../../types'
import { VideoCard } from '../shared/VideoCard'
import { DurationPicker } from '../shared/DurationPicker'
import { approveRequest, denyRequest } from '../../lib/supabase'
import { isDenialOverrideable, getDurationLabel, timeAgo } from '../../lib/relationships'
import {
  notifyOwnerApproved,
  notifyOwnerDenied,
  notifyOwnerDenialOverride,
  notifyPartnerDenied,
} from '../../lib/telegram'

interface NeedsResponseProps {
  requests: Request[]
  ownerChatIds: Record<string, string | undefined>
  partnerChatIds: Record<string, string | undefined>
  ownerNames: Record<string, string>
  partnerName: string
  onUpdate: () => void
  canApproveByRelId?: Record<string, boolean>
}

interface RequestItemProps {
  req: Request
  ownerChatId?: string
  partnerChatId?: string
  ownerName: string
  partnerName: string
  canApprove?: boolean
  onUpdate: () => void
}

function RequestItem({ req, ownerChatId, partnerChatId, ownerName, partnerName, canApprove = true, onUpdate }: RequestItemProps) {
  const [selectedDuration, setSelectedDuration] = useState<DurationType | null>('1_day')
  const [loading, setLoading] = useState(false)

  const isDenied = req.status === 'denied'
  const canOverride = isDenied && req.first_denied_at ? isDenialOverrideable(req.first_denied_at) : false

  async function handleApprove() {
    if (!selectedDuration) return
    setLoading(true)
    const result = await approveRequest(req.id, selectedDuration)
    if (result) {
      if (isDenied && canOverride) {
        // Override
        await notifyOwnerDenialOverride(ownerChatId || '', req.video_title)
        if (partnerChatId) await notifyPartnerDenied(partnerChatId, req.video_title)
      } else {
        await notifyOwnerApproved(
          ownerChatId || '',
          partnerName,
          req.video_title,
          getDurationLabel(selectedDuration),
          result.expires_at || '',
        )
      }
      onUpdate()
    }
    setLoading(false)
  }

  async function handleDeny() {
    setLoading(true)
    const result = await denyRequest(req.id)
    if (result) {
      await notifyOwnerDenied(ownerChatId || '', partnerName, req.video_title)
      onUpdate()
    }
    setLoading(false)
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
      {canOverride && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-2 text-yellow-300 text-sm">
          You can override the denial — another partner already denied but you can still approve within 5 minutes.
        </div>
      )}
      <VideoCard
        thumbnail={req.video_thumbnail}
        title={req.video_title}
        videoId={req.video_id}
        meta={
          <>
            <span className="text-neutral-300">{ownerName}</span>
            <span>{timeAgo(req.created_at)}</span>
          </>
        }
      />
      {req.reason && (
        <p className="text-neutral-300 text-sm bg-neutral-800 rounded-lg px-3 py-2">
          <span className="text-neutral-500">Reason: </span>{req.reason}
        </p>
      )}
      {canApprove ? (
        <>
          <DurationPicker value={selectedDuration} onChange={setSelectedDuration} />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={loading || !selectedDuration}
              className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
                canOverride
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              {loading ? 'Processing...' : canOverride ? 'Override & Approve' : 'Approve'}
            </button>
            {!isDenied && (
              <button
                onClick={handleDeny}
                disabled={loading}
                className="px-4 py-2 rounded-lg font-medium text-sm text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-colors disabled:opacity-50"
              >
                Deny
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-3 py-2 text-yellow-400/70 text-xs text-center">
          You're in a 12-hour cooldown period as a new co-approver — you can view but not approve requests yet.
        </div>
      )}
    </div>
  )
}

export function NeedsResponse({
  requests,
  ownerChatIds,
  partnerChatIds,
  ownerNames,
  partnerName,
  onUpdate,
  canApproveByRelId = {},
}: NeedsResponseProps) {
  const actionable = requests.filter((r) => {
    if (r.status === 'pending') return true
    if (r.status === 'denied' && r.first_denied_at && isDenialOverrideable(r.first_denied_at)) return true
    return false
  })

  if (!actionable.length) return null

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Needs Your Response</h3>
      {actionable.map((req) => (
        <RequestItem
          key={req.id}
          req={req}
          ownerChatId={ownerChatIds[req.relationship_id]}
          partnerChatId={partnerChatIds[req.relationship_id]}
          ownerName={ownerNames[req.relationship_id] || 'Owner'}
          partnerName={partnerName}
          canApprove={canApproveByRelId[req.relationship_id] !== false}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}
