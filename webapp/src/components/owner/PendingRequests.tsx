import type { Request } from '../../types'
import { VideoCard } from '../shared/VideoCard'
import { cancelRequest } from '../../lib/supabase'
import { timeAgo } from '../../lib/relationships'

interface PendingRequestsProps {
  requests: Request[]
  onUpdate: () => void
}

export function PendingRequests({ requests, onUpdate }: PendingRequestsProps) {
  if (!requests.length) return null

  async function handleCancel(requestId: string) {
    await cancelRequest(requestId)
    onUpdate()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Waiting for Response</h3>
      {requests.map((req) => (
        <VideoCard
          key={req.id}
          thumbnail={req.video_thumbnail}
          title={req.video_title}
          videoId={req.video_id}
          meta={
            <>
              <span className="px-2 py-0.5 bg-yellow-900 text-yellow-300 rounded text-xs font-medium">Pending</span>
              <span>{timeAgo(req.created_at)}</span>
              {req.reason && <span className="text-neutral-500 truncate max-w-xs">{req.reason}</span>}
            </>
          }
          actions={
            <button
              onClick={() => handleCancel(req.id)}
              className="px-3 py-1 rounded-lg text-sm text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Cancel
            </button>
          }
        />
      ))}
    </div>
  )
}
