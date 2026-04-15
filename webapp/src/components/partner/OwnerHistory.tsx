import type { Request } from '../../types'
import { HistoryFeed } from '../shared/HistoryFeed'

interface OwnerHistoryProps {
  requests: Request[]
  ownerName: string
}

export function OwnerHistory({ requests, ownerName }: OwnerHistoryProps) {
  if (!requests.length) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">
        {ownerName}'s History
      </h3>
      <HistoryFeed requests={requests} />
    </div>
  )
}
