import { useOutletContext } from 'react-router-dom'
import { useOwnerRequests } from '../../hooks/useRequests'
import type { DashboardOutletContext } from './Layout'
import type { Request } from '../../types'

export function Home() {
  const { ownerRelationships, pendingCount } = useOutletContext<DashboardOutletContext>()
  const ownerRelIds = ownerRelationships.map(r => r.id)
  const { pending, active, history } = useOwnerRequests(ownerRelIds)

  const recentAll = [...pending, ...active, ...history]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekHistory = history.filter(r => new Date(r.created_at).getTime() > weekAgo)
  const approved = weekHistory.filter(r => r.status === 'approved').length
  const denied   = weekHistory.filter(r => r.status === 'denied').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-white text-2xl font-bold">Home</h1>
        <p className="text-neutral-500 text-sm mt-1">Your YouTube accountability at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={pending.length} color="yellow" />
        <StatCard label="Approved (7d)" value={approved} color="green" />
        <StatCard label="Denied (7d)" value={denied} color="red" />
      </div>

      {/* No partner yet */}
      {ownerRelationships.length === 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center flex flex-col gap-3">
          <p className="text-white font-semibold">No accountability partner yet</p>
          <p className="text-neutral-400 text-sm">Add a partner so they can approve your video requests.</p>
          <a
            href="/dashboard/partners"
            className="mx-auto px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Add Partner
          </a>
        </div>
      )}

      {/* Approvals to action (partner role) */}
      {pendingCount > 0 && (
        <div className="bg-red-600/10 border border-red-600/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-red-400 text-sm font-medium">
            {pendingCount} request{pendingCount !== 1 ? 's' : ''} waiting for your approval
          </p>
          <a href="/dashboard/approvals" className="text-red-400 hover:text-red-300 text-sm font-semibold transition-colors">
            Review →
          </a>
        </div>
      )}

      {/* Recent activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm">Recent activity</h2>
          <a href="/dashboard/activity" className="text-neutral-500 hover:text-white text-xs transition-colors">View all →</a>
        </div>

        {recentAll.length === 0 ? (
          <p className="text-neutral-600 text-sm py-6 text-center">No requests yet — try watching a YouTube video in Chrome.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentAll.map(r => <RecentRow key={r.id} request={r} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'yellow' | 'green' | 'red' }) {
  const colors = {
    yellow: 'text-yellow-400',
    green:  'text-green-400',
    red:    'text-red-400',
  }
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-4">
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      <p className="text-neutral-500 text-xs mt-1">{label}</p>
    </div>
  )
}

function RecentRow({ request }: { request: Request }) {
  const statusStyles: Record<string, string> = {
    approved: 'bg-green-600/15 text-green-400',
    denied:   'bg-red-600/15 text-red-400',
    pending:  'bg-yellow-600/15 text-yellow-400',
    expired:  'bg-neutral-700 text-neutral-400',
    released: 'bg-neutral-700 text-neutral-400',
  }
  const label: Record<string, string> = {
    approved: 'Approved', denied: 'Denied', pending: 'Pending',
    expired: 'Expired', released: 'Released',
  }

  return (
    <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-3">
      {request.video_thumbnail && (
        <img
          src={request.video_thumbnail}
          alt=""
          className="w-14 h-9 object-cover rounded flex-shrink-0 bg-neutral-800"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{request.video_title || 'Unknown video'}</p>
        <p className="text-neutral-500 text-xs">{new Date(request.created_at).toLocaleString()}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${statusStyles[request.status] ?? statusStyles.expired}`}>
        {label[request.status] ?? request.status}
      </span>
    </div>
  )
}
