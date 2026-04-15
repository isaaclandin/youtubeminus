import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { usePartnerRequests } from '../../hooks/useRequests'
import { NeedsResponse } from '../../components/partner/NeedsResponse'
import { PartnerActiveApprovals } from '../../components/partner/ActiveApprovals'
import type { DashboardOutletContext } from './Layout'

export function Approvals() {
  const { profile, partnerRelationships, setPendingCount, refetchRels } = useOutletContext<DashboardOutletContext>()

  const partnerRelIds = partnerRelationships.filter(r => r.status === 'active').map(r => r.id)
  const { needsResponse, activeGranted, refetch } = usePartnerRequests(partnerRelIds)

  // Keep sidebar badge in sync
  useEffect(() => {
    setPendingCount(needsResponse.length)
  }, [needsResponse.length, setPendingCount])

  const ownerNames: Record<string, string> = {}
  const ownerChatIds: Record<string, string | undefined> = {}
  const partnerChatIds: Record<string, string | undefined> = {}
  const canApproveByRelId: Record<string, boolean> = {}
  partnerRelationships.forEach(r => {
    ownerNames[r.id]    = r.owner?.display_name || r.owner?.email || 'Owner'
    ownerChatIds[r.id]  = r.owner?.telegram_chat_id
    partnerChatIds[r.id] = profile.telegram_chat_id
    // Co-approvers in cooldown cannot approve
    const inCooldown = r.cooldown_until ? new Date(r.cooldown_until) > new Date() : false
    canApproveByRelId[r.id] = !(r.role === 'co_approver' && inCooldown)
  })

  function handleUpdate() {
    refetch()
    refetchRels()
  }

  if (partnerRelationships.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white text-2xl font-bold mb-2">Approvals</h1>
        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
          <p className="text-neutral-400 text-sm">
            You're not an accountability partner for anyone yet.
          </p>
          <p className="text-neutral-600 text-xs mt-2">
            When someone adds you as their partner, their requests will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Approvals</h1>
        <p className="text-neutral-500 text-sm mt-1">Review requests from the people you're accountable for</p>
      </div>

      {/* Pending requests — highest priority */}
      {needsResponse.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-6 text-center">
          <p className="text-green-400 text-sm font-medium">All caught up</p>
          <p className="text-neutral-600 text-xs mt-1">No pending requests right now.</p>
        </div>
      ) : (
        <NeedsResponse
          requests={needsResponse}
          ownerChatIds={ownerChatIds}
          partnerChatIds={partnerChatIds}
          ownerNames={ownerNames}
          partnerName={profile.display_name}
          canApproveByRelId={canApproveByRelId}
          onUpdate={handleUpdate}
        />
      )}

      {/* Currently active approvals */}
      {activeGranted.length > 0 && (
        <section>
          <h2 className="text-neutral-400 text-xs font-semibold uppercase tracking-wider mb-3">Active approvals</h2>
          <PartnerActiveApprovals
            approvals={activeGranted}
            ownerNames={ownerNames}
            onUpdate={handleUpdate}
          />
        </section>
      )}
    </div>
  )
}
