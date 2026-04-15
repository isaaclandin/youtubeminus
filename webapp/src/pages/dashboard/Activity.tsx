import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getAllRequestsForOwner } from '../../lib/supabase'
import type { DashboardOutletContext } from './Layout'
import type { Request } from '../../types'

type TimeFilter = 'today' | 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'approved' | 'denied' | 'pending'

export function Activity() {
  const { ownerRelationships } = useOutletContext<DashboardOutletContext>()
  const ownerRelIds = ownerRelationships.map(r => r.id)

  const [all, setAll] = useState<Request[]>([])
  const [loading, setLoading] = useState(false)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const fetch = useCallback(async () => {
    if (!ownerRelIds.length) { setAll([]); return }
    setLoading(true)
    const data = await getAllRequestsForOwner(ownerRelIds)
    setAll(data)
    setLoading(false)
  }, [ownerRelIds.join(',')])

  useEffect(() => { fetch() }, [fetch])

  const cutoff: Record<TimeFilter, number> = {
    today: Date.now() - 24 * 60 * 60 * 1000,
    week:  Date.now() - 7 * 24 * 60 * 60 * 1000,
    month: Date.now() - 30 * 24 * 60 * 60 * 1000,
    all:   0,
  }

  const filtered = all.filter(r => {
    if (new Date(r.created_at).getTime() < cutoff[timeFilter]) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search && !r.video_title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Activity</h1>
        <p className="text-neutral-500 text-sm mt-1">Every video you've requested</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by video title…"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <div className="flex gap-2 flex-wrap">
          <FilterGroup
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week',  label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'all',   label: 'All time' },
            ]}
            value={timeFilter}
            onChange={v => setTimeFilter(v as TimeFilter)}
          />
          <div className="w-px bg-neutral-800" />
          <FilterGroup
            options={[
              { value: 'all',      label: 'All' },
              { value: 'approved', label: 'Approved' },
              { value: 'denied',   label: 'Denied' },
              { value: 'pending',  label: 'Pending' },
            ]}
            value={statusFilter}
            onChange={v => setStatusFilter(v as StatusFilter)}
          />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-600 text-sm text-center py-12">
          {all.length === 0 ? 'No requests yet.' : 'No results for this filter.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => <ActivityRow key={r.id} request={r} />)}
        </div>
      )}
    </div>
  )
}

function FilterGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ActivityRow({ request }: { request: Request }) {
  const [expanded, setExpanded] = useState(false)

  const statusConfig: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Approved', cls: 'bg-green-600/15 text-green-400' },
    denied:   { label: 'Denied',   cls: 'bg-red-600/15 text-red-400' },
    pending:  { label: 'Pending',  cls: 'bg-yellow-500/15 text-yellow-400' },
    expired:  { label: 'Expired',  cls: 'bg-neutral-700 text-neutral-400' },
    released: { label: 'Released', cls: 'bg-neutral-700 text-neutral-400' },
  }
  const s = statusConfig[request.status] ?? statusConfig.expired

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3">
        {request.video_thumbnail && (
          <a
            href={`https://youtube.com/watch?v=${request.video_id}`}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={request.video_thumbnail}
              alt=""
              className="w-16 h-10 object-cover rounded bg-neutral-800 hover:opacity-80 transition-opacity"
            />
          </a>
        )}
        <div className="flex-1 min-w-0">
          <a
            href={`https://youtube.com/watch?v=${request.video_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-white text-sm font-medium hover:underline line-clamp-1"
          >
            {request.video_title || 'Unknown video'}
          </a>
          <p className="text-neutral-500 text-xs mt-0.5">
            {new Date(request.created_at).toLocaleString()}
            {request.duration_type && (
              <span className="ml-2 text-neutral-600">
                · {request.duration_type === '1_day' ? '1 day' : '1 week'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>
          {request.reason && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-neutral-600 hover:text-neutral-400 transition-colors"
              title="Toggle reason"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d={expanded ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
              </svg>
            </button>
          )}
        </div>
      </div>
      {expanded && request.reason && (
        <div className="px-4 pb-3 pt-0 border-t border-neutral-800">
          <p className="text-neutral-400 text-xs leading-relaxed">
            <span className="text-neutral-600">Your reason: </span>{request.reason}
          </p>
        </div>
      )}
    </div>
  )
}
