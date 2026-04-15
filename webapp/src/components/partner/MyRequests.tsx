import { useState } from 'react'
import type { Request, DurationType } from '../../types'
import { createRequest } from '../../lib/supabase'
import { extractYouTubeVideoId, getDurationLabel } from '../../lib/relationships'
import { VideoCard } from '../shared/VideoCard'
import { ExpiryCountdown } from '../shared/ExpiryCountdown'

interface MyRequestsProps {
  requests: Request[]
  relationshipId: string
  onUpdate: () => void
}

export function MyRequests({ requests, relationshipId, onUpdate }: MyRequestsProps) {
  const [url, setUrl] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videoPreview, setVideoPreview] = useState<{ id: string; title: string; thumbnail: string } | null>(null)

  const myPending = requests.filter((r) => r.requested_by === 'accountability_partner' && r.status === 'pending')
  const myActive = requests.filter((r) => r.requested_by === 'accountability_partner' && r.status === 'approved')

  async function handleUrlChange(value: string) {
    setUrl(value)
    setVideoPreview(null)
    setError(null)
    const videoId = extractYouTubeVideoId(value)
    if (!videoId) return

    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      )
      if (!res.ok) return
      const data = await res.json()
      setVideoPreview({
        id: videoId,
        title: data.title,
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      })
    } catch {
      // Ignore fetch errors for preview
    }
  }

  async function handleSubmit() {
    if (!videoPreview) {
      setError('Please enter a valid YouTube URL')
      return
    }
    if (!reason.trim()) {
      setError('Please provide a reason')
      return
    }
    setLoading(true)
    setError(null)
    const result = await createRequest({
      video_id: videoPreview.id,
      video_title: videoPreview.title,
      video_thumbnail: videoPreview.thumbnail,
      reason: reason.trim(),
      relationship_id: relationshipId,
      requested_by: 'accountability_partner',
    })
    if (result) {
      setUrl('')
      setReason('')
      setVideoPreview(null)
      onUpdate()
    } else {
      setError('Failed to submit request. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-white font-medium text-sm">Request a Video</h3>
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="YouTube URL (watch, shorts, or youtu.be)"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>
        {videoPreview && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-2">
            <VideoCard
              thumbnail={videoPreview.thumbnail}
              title={videoPreview.title}
              videoId={videoPreview.id}
            />
          </div>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why do you want to watch this?"
          rows={2}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500 resize-none"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || !videoPreview}
          className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>

      {myPending.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Your Pending Requests</h3>
          {myPending.map((req) => (
            <VideoCard
              key={req.id}
              thumbnail={req.video_thumbnail}
              title={req.video_title}
              videoId={req.video_id}
              meta={
                <span className="px-2 py-0.5 bg-yellow-900 text-yellow-300 rounded text-xs font-medium">Pending</span>
              }
            />
          ))}
        </div>
      )}

      {myActive.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Your Active Approvals</h3>
          {myActive.map((req) => (
            <VideoCard
              key={req.id}
              thumbnail={req.video_thumbnail}
              title={req.video_title}
              videoId={req.video_id}
              meta={
                <>
                  {req.duration_type && (
                    <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-xs font-medium">
                      {getDurationLabel(req.duration_type as DurationType)}
                    </span>
                  )}
                  {req.expires_at && <ExpiryCountdown expiresAt={req.expires_at} />}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
