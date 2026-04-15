import type { Request } from '../../types'
import { VideoCard } from '../shared/VideoCard'
import { ExpiryCountdown } from '../shared/ExpiryCountdown'
import { revokeApproval } from '../../lib/supabase'
import { isExpiringSoon, getDurationLabel } from '../../lib/relationships'

interface ActiveApprovalsProps {
  approvals: Request[]
  onUpdate: () => void
}

export function ActiveApprovals({ approvals, onUpdate }: ActiveApprovalsProps) {
  if (!approvals.length) return null

  async function handleRevoke(requestId: string) {
    await revokeApproval(requestId)
    onUpdate()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Active Approvals</h3>
      {approvals.map((req) => {
        const expiringSoon = req.expires_at ? isExpiringSoon(req.expires_at) : false
        return (
          <div key={req.id} className={expiringSoon ? 'ring-1 ring-yellow-500 rounded-xl' : ''}>
            <VideoCard
              thumbnail={req.video_thumbnail}
              title={req.video_title}
              videoId={req.video_id}
              meta={
                <>
                  <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs font-medium">
                    {req.duration_type ? getDurationLabel(req.duration_type) : 'Approved'}
                  </span>
                  {req.expires_at && <ExpiryCountdown expiresAt={req.expires_at} />}
                </>
              }
              actions={
                <button
                  onClick={() => handleRevoke(req.id)}
                  className="px-3 py-1 rounded-lg text-sm text-red-400 border border-red-900 hover:bg-red-900/20 transition-colors"
                >
                  Release Early
                </button>
              }
            />
          </div>
        )
      })}
    </div>
  )
}
