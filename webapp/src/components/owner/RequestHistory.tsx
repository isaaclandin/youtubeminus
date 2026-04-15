import type { Request } from '../../types'
import { HistoryFeed } from '../shared/HistoryFeed'

interface RequestHistoryProps {
  requests: Request[]
}

export function RequestHistory({ requests }: RequestHistoryProps) {
  if (!requests.length) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">History</h3>
      <HistoryFeed requests={requests} />
    </div>
  )
}
