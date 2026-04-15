import { useState } from 'react'
import type { Request, RequestStatus } from '../../types'
import { VideoCard } from './VideoCard'
import { timeAgo } from '../../lib/relationships'

interface HistoryFeedProps {
  requests: Request[]
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  approved: 'bg-green-900 text-green-300',
  denied: 'bg-red-900 text-red-300',
  expired: 'bg-neutral-700 text-neutral-400',
  released: 'bg-neutral-700 text-neutral-400',
  pending: 'bg-yellow-900 text-yellow-300',
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  released: 'Released',
  pending: 'Pending',
}

type FilterTab = 'all' | 'approved' | 'denied'

export function HistoryFeed({ requests }: HistoryFeedProps) {
  const [filter, setFilter] = useState<FilterTab>('all')

  const filtered = requests.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'approved') return r.status === 'approved'
    if (filter === 'denied') return r.status === 'denied'
    return true
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(['all', 'approved', 'denied'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === tab
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-6">No history yet</p>
        )}
        {filtered.map((req) => (
          <VideoCard
            key={req.id}
            thumbnail={req.video_thumbnail}
            title={req.video_title}
            videoId={req.video_id}
            meta={
              <>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                  {STATUS_LABELS[req.status]}
                </span>
                <span>{timeAgo(req.created_at)}</span>
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
