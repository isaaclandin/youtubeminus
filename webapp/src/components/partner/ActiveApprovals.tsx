import type { Request } from '../../types'
import { VideoCard } from '../shared/VideoCard'
import { ExpiryCountdown } from '../shared/ExpiryCountdown'
import { revokeApproval } from '../../lib/supabase'
import { getDurationLabel } from '../../lib/relationships'

interface PartnerActiveApprovalsProps {
  approvals: Request[]
  ownerNames: Record<string, string>
  onUpdate: () => void
}

export function PartnerActiveApprovals({ approvals, ownerNames, onUpdate }: PartnerActiveApprovalsProps) {
  if (!approvals.length) return null

  async function handleRevoke(requestId: string) {
    await revokeApproval(requestId)
    onUpdate()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Approvals You Granted</h3>
      {approvals.map((req) => (
        <VideoCard
          key={req.id}
          thumbnail={req.video_thumbnail}
          title={req.video_title}
          videoId={req.video_id}
          meta={
            <>
              <span className="text-neutral-400 text-xs">{ownerNames[req.relationship_id] || 'Owner'}</span>
              {req.duration_type && (
                <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs font-medium">
                  {getDurationLabel(req.duration_type)}
                </span>
              )}
              {req.expires_at && <ExpiryCountdown expiresAt={req.expires_at} />}
            </>
          }
          actions={
            <button
              onClick={() => handleRevoke(req.id)}
              className="px-3 py-1 rounded-lg text-sm text-red-400 border border-red-900 hover:bg-red-900/20 transition-colors"
            >
              Revoke
            </button>
          }
        />
      ))}
    </div>
  )
}
