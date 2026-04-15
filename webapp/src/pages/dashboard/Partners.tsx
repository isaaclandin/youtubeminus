import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getChangeRequestsForOwner,
  getPendingChangeRequestsForPrimary,
  proposeAddCoApprover,
  proposeRemoveCoApprover,
  requestPrimaryRemoval,
  approveChangeRequest,
  denyChangeRequest,
  cancelChangeRequest,
  confirmPrimaryRemoval,
  createCoApproverInviteToken,
  dissolveRelationship,
  sendInvite,
} from '../../lib/supabase'
import type { DashboardOutletContext } from './Layout'
import type { ApproverChangeRequest, Relationship } from '../../types'

export function Partners() {
  const { profile, ownerRelationships, partnerRelationships, refetchRels } =
    useOutletContext<DashboardOutletContext>()

  const activeOwnerRels = ownerRelationships.filter((r) => r.status === 'active')
  const primary = activeOwnerRels.find((r) => r.role === 'primary')
  const coApprovers = activeOwnerRels.filter((r) => r.role === 'co_approver')
  const activePartnerRels = partnerRelationships.filter((r) => r.status === 'active')

  const [changeRequests, setChangeRequests] = useState<ApproverChangeRequest[]>([])
  const [primaryPending, setPrimaryPending] = useState<ApproverChangeRequest[]>([])
  const [loadingCRs, setLoadingCRs] = useState(false)

  const fetchCRs = useCallback(async () => {
    setLoadingCRs(true)
    const [mine, forMe] = await Promise.all([
      getChangeRequestsForOwner(profile.id),
      getPendingChangeRequestsForPrimary(activePartnerRels.map((r) => r.id)),
    ])
    setChangeRequests(mine)
    setPrimaryPending(forMe)
    setLoadingCRs(false)
  }, [profile.id, activePartnerRels.map((r) => r.id).join(',')])  // eslint-disable-line

  useEffect(() => { fetchCRs() }, [fetchCRs])

  async function refresh() {
    await refetchRels()
    await fetchCRs()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-white text-2xl font-bold">Partners</h1>
        <p className="text-neutral-500 text-sm mt-1">Manage your accountability relationships</p>
      </div>

      {/* ── Owner section ── */}
      <OwnerSection
        primary={primary}
        coApprovers={coApprovers}
        changeRequests={changeRequests}
        profileId={profile.id}
        onRefresh={refresh}
        loadingCRs={loadingCRs}
      />

      {/* ── Partner section: accounts I partner for ── */}
      {activePartnerRels.length > 0 && (
        <PartnerSection
          partnerRels={activePartnerRels}
          primaryPending={primaryPending}
          currentProfileId={profile.id}
          onRefresh={refresh}
        />
      )}

      {/* ── Accounts you partner for (waiting for invite) ── */}
      {activePartnerRels.length === 0 && activeOwnerRels.length === 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center flex flex-col gap-2">
          <p className="text-white font-semibold">No accountability relationships yet</p>
          <p className="text-neutral-400 text-sm">Invite a partner to get started.</p>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Owner section
// ────────────────────────────────────────────────────────────────────────────

function OwnerSection({
  primary,
  coApprovers,
  changeRequests,
  profileId,
  onRefresh,
  loadingCRs,
}: {
  primary: Relationship | undefined
  coApprovers: Relationship[]
  changeRequests: ApproverChangeRequest[]
  profileId: string
  onRefresh: () => void
  loadingCRs: boolean
}) {
  const [addEmail, setAddEmail] = useState('')
  const [proposing, setProposing] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  const openCRs = changeRequests.filter(
    (cr) => !['completed', 'cancelled', 'denied'].includes(cr.status),
  )

  async function handleProposeAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addEmail.trim() || !primary) return
    setProposing(true)
    setProposeError(null)
    const result = await proposeAddCoApprover(profileId, addEmail.trim(), primary.id)
    if (!result) setProposeError('Failed to submit proposal. Please try again.')
    else { setAddEmail(''); onRefresh() }
    setProposing(false)
  }

  async function handleProposeRemove(rel: Relationship) {
    if (!primary) return
    await proposeRemoveCoApprover(profileId, rel.id, primary.id)
    onRefresh()
  }

  async function handleRequestPrimaryRemoval() {
    if (!primary) return
    await requestPrimaryRemoval(profileId, primary.id)
    onRefresh()
  }

  async function handleCancel(crId: string) {
    await cancelChangeRequest(crId)
    onRefresh()
  }

  async function handleGetInviteLink(cr: ApproverChangeRequest) {
    const token = await createCoApproverInviteToken(profileId, cr.id)
    if (token) {
      const url = `${window.location.origin}/invite/${token}`
      await navigator.clipboard.writeText(url)
      alert(`Invite link copied!\n\n${url}\n\nShare this with ${cr.target_email}`)
      onRefresh()
    }
  }

  async function handleConfirmPrimaryRemoval(cr: ApproverChangeRequest, newRelId: string) {
    await confirmPrimaryRemoval(cr.id, newRelId)
    onRefresh()
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-white font-semibold text-sm">Your Accountability Partners</h2>

      {/* Primary */}
      {primary ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-sm">
                  {primary.partner?.display_name || primary.partner?.email || 'Partner'}
                </span>
                <span className="bg-red-600/20 text-red-400 text-xs font-medium px-2 py-0.5 rounded-full">
                  Primary
                </span>
              </div>
              <p className="text-neutral-500 text-xs mt-0.5">
                Must approve changes to your partner setup
              </p>
            </div>
            {!openCRs.some((cr) => cr.type === 'remove_primary') && (
              <button
                onClick={handleRequestPrimaryRemoval}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
              >
                Replace…
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-neutral-500 text-sm">No primary partner — YouTube is blocked until you add one.</p>
          <InviteForm profileId={profileId} onRefresh={onRefresh} isPrimary />
        </div>
      )}

      {/* Co-approvers */}
      {coApprovers.length > 0 && (
        <div className="flex flex-col gap-2">
          {coApprovers.map((rel) => (
            <CoApproverRow
              key={rel.id}
              rel={rel}
              primary={primary}
              openCRs={openCRs}
              onProposeRemove={() => handleProposeRemove(rel)}
            />
          ))}
        </div>
      )}

      {/* Propose adding co-approver */}
      {primary && (
        <form onSubmit={handleProposeAdd} className="flex flex-col gap-2">
          <p className="text-neutral-600 text-xs">
            Propose a co-approver — your primary partner must approve the addition.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => { setAddEmail(e.target.value); setProposeError(null) }}
              placeholder="Co-approver's email"
              required
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={proposing || !addEmail.trim()}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex-shrink-0"
            >
              {proposing ? 'Sending…' : 'Propose'}
            </button>
          </div>
          {proposeError && (
            <p className="text-red-400 text-xs">{proposeError}</p>
          )}
        </form>
      )}

      {/* Pending change requests */}
      {loadingCRs ? null : openCRs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-neutral-600 text-xs font-medium uppercase tracking-wide">
            Pending changes
          </p>
          {openCRs.map((cr) => (
            <ChangeRequestRow
              key={cr.id}
              cr={cr}
              coApprovers={coApprovers}
              onCancel={() => handleCancel(cr.id)}
              onGetInviteLink={() => handleGetInviteLink(cr)}
              onConfirmPrimaryRemoval={(newRelId) => handleConfirmPrimaryRemoval(cr, newRelId)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CoApproverRow({
  rel, primary, openCRs, onProposeRemove,
}: {
  rel: Relationship
  primary: Relationship | undefined
  openCRs: ApproverChangeRequest[]
  onProposeRemove: () => void
}) {
  const cooldownUntil = rel.cooldown_until ? new Date(rel.cooldown_until) : null
  const inCooldown = cooldownUntil && cooldownUntil > new Date()
  const alreadyPendingRemoval = openCRs.some(
    (cr) => cr.type === 'remove_co_approver' && cr.target_relationship_id === rel.id,
  )

  function cooldownLabel() {
    if (!cooldownUntil) return ''
    const ms = cooldownUntil.getTime() - Date.now()
    const h = Math.floor(ms / 3600_000)
    const m = Math.ceil((ms % 3600_000) / 60_000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">
            {rel.partner?.display_name || rel.partner?.email || 'Partner'}
          </span>
          <span className="bg-neutral-700 text-neutral-400 text-xs font-medium px-2 py-0.5 rounded-full">
            Co-approver
          </span>
        </div>
        {inCooldown && (
          <p className="text-yellow-500/70 text-xs mt-0.5">
            Cooldown — can approve in {cooldownLabel()}
          </p>
        )}
      </div>
      {primary && !alreadyPendingRemoval && (
        <button
          onClick={onProposeRemove}
          className="text-xs text-neutral-500 hover:text-red-400 transition-colors flex-shrink-0"
        >
          Remove…
        </button>
      )}
      {alreadyPendingRemoval && (
        <span className="text-xs text-yellow-500/70 flex-shrink-0">Removal pending</span>
      )}
    </div>
  )
}

function ChangeRequestRow({
  cr, coApprovers, onCancel, onGetInviteLink, onConfirmPrimaryRemoval,
}: {
  cr: ApproverChangeRequest
  coApprovers: Relationship[]
  onCancel: () => void
  onGetInviteLink: () => void
  onConfirmPrimaryRemoval: (newRelId: string) => void
}) {
  const [selectedNewPrimary, setSelectedNewPrimary] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const isUnlocked =
    cr.type === 'remove_primary' &&
    cr.unlock_at &&
    new Date(cr.unlock_at) <= new Date()

  function unlockLabel() {
    if (!cr.unlock_at) return ''
    const ms = new Date(cr.unlock_at).getTime() - Date.now()
    if (ms <= 0) return 'Unlocked'
    const h = Math.floor(ms / 3600_000)
    const m = Math.ceil((ms % 3600_000) / 60_000)
    return `Unlocks in ${h}h ${m}m`
  }

  function typeLabel() {
    if (cr.type === 'add_co_approver') return `Add co-approver (${cr.target_email ?? ''})`
    if (cr.type === 'remove_co_approver') {
      const name = cr.target_relationship?.partner?.display_name ?? cr.target_relationship?.partner?.email ?? 'partner'
      return `Remove co-approver (${name})`
    }
    return 'Replace primary'
  }

  const statusLabel: Record<string, string> = {
    pending_primary_approval: 'Waiting for primary approval',
    primary_approved: 'Primary approved',
    pending_invite: 'Invite sent',
    unlocked: 'Ready to confirm',
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white text-sm">{typeLabel()}</p>
          <p className="text-neutral-500 text-xs mt-0.5">
            {cr.type === 'remove_primary' && !isUnlocked
              ? unlockLabel()
              : statusLabel[cr.status] ?? cr.status}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {cr.type === 'add_co_approver' && cr.status === 'primary_approved' && (
            <button
              onClick={onGetInviteLink}
              className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
            >
              Copy invite link
            </button>
          )}
          {cr.type === 'add_co_approver' && cr.status === 'pending_invite' && cr.invite_token && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/invite/${cr.invite_token}`
                navigator.clipboard.writeText(url)
              }}
              className="text-xs px-2 py-1 border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-white rounded transition-colors"
            >
              Copy link again
            </button>
          )}
          {confirmingCancel ? (
            <>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="text-xs text-neutral-400 hover:text-white transition-colors"
              >
                No
              </button>
              <button
                onClick={onCancel}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Yes, cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Confirm primary removal: pick new primary from co-approvers */}
      {cr.type === 'remove_primary' && isUnlocked && coApprovers.length > 0 && (
        <div className="flex gap-2 pt-1 border-t border-neutral-800">
          <select
            value={selectedNewPrimary}
            onChange={(e) => setSelectedNewPrimary(e.target.value)}
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-neutral-500"
          >
            <option value="">Select new primary…</option>
            {coApprovers.map((rel) => (
              <option key={rel.id} value={rel.id}>
                {rel.partner?.display_name || rel.partner?.email}
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedNewPrimary && onConfirmPrimaryRemoval(selectedNewPrimary)}
            disabled={!selectedNewPrimary}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
      {cr.type === 'remove_primary' && isUnlocked && coApprovers.length === 0 && (
        <p className="text-yellow-500/70 text-xs pt-1 border-t border-neutral-800">
          You need at least one co-approver to promote to primary before removing your current primary.
        </p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Invite form (for when no primary exists)
// ────────────────────────────────────────────────────────────────────────────

function InviteForm({ profileId, onRefresh, isPrimary }: { profileId: string; onRefresh: () => void; isPrimary?: boolean }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; link?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await sendInvite(email.trim())
      if (res.ok) {
        if (res.method === 'link') {
          setResult({ ok: true, message: 'They already have an account. Send them this link:', link: res.inviteUrl })
        } else {
          setResult({ ok: true, message: res.method === 'telegram' ? 'Invite sent via Telegram' : 'Invite email sent' })
          setEmail('')
          setTimeout(() => setResult(null), 5000)
          onRefresh()
        }
      } else {
        setResult({ ok: false, message: res.error })
      }
    } catch {
      setResult({ ok: false, message: 'Something went wrong.' })
    }
    setSending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-3">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setResult(null) }}
          placeholder={isPrimary ? "Primary partner's email" : "Partner's email"}
          required
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors flex-shrink-0"
        >
          {sending ? 'Sending…' : 'Invite'}
        </button>
      </div>
      {result && (
        <div className={`rounded-lg px-3 py-2 ${result.ok ? 'bg-green-950 border border-green-800' : 'bg-red-950 border border-red-800'}`}>
          <p className={`text-sm ${result.ok ? 'text-green-300' : 'text-red-300'}`}>{result.message}</p>
          {result.link && (
            <div className="flex gap-2 items-center mt-1">
              <span className="text-neutral-400 text-xs truncate flex-1">{result.link}</span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(result.link!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="text-xs px-2 py-1 border border-neutral-600 hover:border-neutral-400 text-neutral-300 hover:text-white rounded transition-colors flex-shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Partner section
// ────────────────────────────────────────────────────────────────────────────

function PartnerSection({
  partnerRels, primaryPending, currentProfileId, onRefresh,
}: {
  partnerRels: Relationship[]
  primaryPending: ApproverChangeRequest[]
  currentProfileId: string
  onRefresh: () => void
}) {
  const [dissolveConfirm, setDissolveConfirm] = useState<string | null>(null)
  const [dissolving, setDissolving] = useState<string | null>(null)

  async function handleDissolve(relId: string) {
    if (dissolveConfirm !== relId) { setDissolveConfirm(relId); return }
    setDissolving(relId)
    await dissolveRelationship(relId)
    setDissolving(null)
    setDissolveConfirm(null)
    onRefresh()
  }

  async function handleApproveCR(cr: ApproverChangeRequest) {
    await approveChangeRequest(cr.id)
    onRefresh()
  }

  async function handleDenyCR(cr: ApproverChangeRequest) {
    await denyChangeRequest(cr.id)
    onRefresh()
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-white font-semibold text-sm">Accounts You Partner For</h2>

      {partnerRels.map((rel) => {
        const pendingForThis = primaryPending.filter(
          (cr) => cr.primary_relationship_id === rel.id,
        )

        return (
          <div key={rel.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">
                    {rel.owner?.display_name || rel.owner?.email || 'Owner'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    rel.role === 'primary'
                      ? 'bg-red-600/20 text-red-400'
                      : 'bg-neutral-700 text-neutral-400'
                  }`}>
                    {rel.role === 'primary' ? 'Primary' : 'Co-approver'}
                  </span>
                </div>
                <p className="text-neutral-500 text-xs mt-0.5">{rel.owner?.email}</p>
              </div>
              {dissolveConfirm === rel.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setDissolveConfirm(null)}
                    className="text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDissolve(rel.id)}
                    disabled={dissolving === rel.id}
                    className="text-xs text-red-400 border border-red-900 rounded px-2 py-1 hover:bg-red-900/20 transition-colors"
                  >
                    {dissolving === rel.id ? 'Leaving…' : 'Confirm'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleDissolve(rel.id)}
                  className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
                >
                  Leave
                </button>
              )}
            </div>

            {/* Pending change requests for this primary relationship */}
            {pendingForThis.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-neutral-800">
                <p className="text-neutral-500 text-xs font-medium">Needs your approval</p>
                {pendingForThis.map((cr) => (
                  <div key={cr.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white text-sm">
                        {cr.type === 'add_co_approver'
                          ? `Add co-approver (${cr.target_email})`
                          : cr.type === 'remove_co_approver'
                          ? `Remove co-approver (${cr.target_relationship?.partner?.display_name ?? cr.target_relationship?.partner?.email})`
                          : 'Replace primary (48h cooldown initiated)'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDenyCR(cr)}
                        className="text-xs px-2 py-1 text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white rounded transition-colors"
                      >
                        Deny
                      </button>
                      <button
                        onClick={() => handleApproveCR(cr)}
                        className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
