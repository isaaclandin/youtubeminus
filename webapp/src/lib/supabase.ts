import { createClient } from '@supabase/supabase-js'
import type { Profile, Relationship, Request, DurationType } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Profile helpers ----

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('getProfile error:', error)
    return null
  }
  return data as Profile
}

export async function upsertProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single()
  if (error) {
    console.error('upsertProfile error:', error)
    return null
  }
  return data as Profile
}

// ---- Relationship helpers ----

export async function getMyRelationships(userId: string): Promise<{ asOwner: Relationship[]; asPartner: Relationship[] }> {
  const [ownerRes, partnerRes] = await Promise.all([
    supabase
      .from('relationships')
      .select('*, owner:profiles!owner_id(*), partner:profiles!partner_id(*)')
      .eq('owner_id', userId)
      .neq('status', 'dissolved'),
    supabase
      .from('relationships')
      .select('*, owner:profiles!owner_id(*), partner:profiles!partner_id(*)')
      .eq('partner_id', userId)
      .neq('status', 'dissolved'),
  ])
  return {
    asOwner: (ownerRes.data ?? []) as Relationship[],
    asPartner: (partnerRes.data ?? []) as Relationship[],
  }
}

export async function getActivePartners(ownerId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('relationships')
    .select('partner:profiles!partner_id(*)')
    .eq('owner_id', ownerId)
    .eq('status', 'active')
  if (error) {
    console.error('getActivePartners error:', error)
    return []
  }
  return ((data ?? []) as unknown as { partner: Profile }[]).map((r) => r.partner)
}

// ---- Request helpers ----

export async function getPendingRequestsForOwner(relationshipIds: string[]): Promise<Request[]> {
  if (!relationshipIds.length) return []
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .in('relationship_id', relationshipIds)
    .eq('status', 'pending')
    .eq('requested_by', 'account_owner')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getPendingRequestsForOwner error:', error)
    return []
  }
  return (data ?? []) as Request[]
}

export async function getActiveApprovalsForOwner(relationshipIds: string[]): Promise<Request[]> {
  if (!relationshipIds.length) return []
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .in('relationship_id', relationshipIds)
    .eq('status', 'approved')
    .eq('requested_by', 'account_owner')
    .order('approved_at', { ascending: false })
  if (error) {
    console.error('getActiveApprovalsForOwner error:', error)
    return []
  }
  return (data ?? []) as Request[]
}

export async function getRequestHistoryForOwner(relationshipIds: string[], limit = 50): Promise<Request[]> {
  if (!relationshipIds.length) return []
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .in('relationship_id', relationshipIds)
    .eq('requested_by', 'account_owner')
    .in('status', ['approved', 'denied', 'expired', 'released'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('getRequestHistoryForOwner error:', error)
    return []
  }
  return (data ?? []) as Request[]
}

export async function getPendingForPartner(relationshipIds: string[]): Promise<Request[]> {
  if (!relationshipIds.length) return []
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .in('relationship_id', relationshipIds)
    .eq('status', 'pending')
    .eq('requested_by', 'account_owner')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getPendingForPartner error:', error)
    return []
  }
  return (data ?? []) as Request[]
}

export async function getActiveGrantedByPartner(relationshipIds: string[]): Promise<Request[]> {
  if (!relationshipIds.length) return []
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .in('relationship_id', relationshipIds)
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
  if (error) {
    console.error('getActiveGrantedByPartner error:', error)
    return []
  }
  return (data ?? []) as Request[]
}

// ---- Request mutations ----

function calcExpiresAt(durationType: DurationType): string {
  const now = Date.now()
  const map = {
    '1_day':  now + 24 * 3600_000,
    '1_week': now + 7 * 24 * 3600_000,
  }
  return new Date(map[durationType]).toISOString()
}

export async function approveRequest(requestId: string, durationType: DurationType): Promise<Request | null> {
  const { data, error } = await supabase
    .from('requests')
    .update({
      status: 'approved',
      duration_type: durationType,
      approved_at: new Date().toISOString(),
      expires_at: calcExpiresAt(durationType),
    })
    .eq('id', requestId)
    .select()
    .single()
  if (error) {
    console.error('approveRequest error:', error)
    return null
  }
  return data as Request
}

export async function denyRequest(requestId: string): Promise<Request | null> {
  const { data, error } = await supabase
    .from('requests')
    .update({
      status: 'denied',
      first_denied_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single()
  if (error) {
    console.error('denyRequest error:', error)
    return null
  }
  return data as Request
}

export async function revokeApproval(requestId: string): Promise<Request | null> {
  const { data, error } = await supabase
    .from('requests')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single()
  if (error) {
    console.error('revokeApproval error:', error)
    return null
  }
  return data as Request
}

export async function cancelRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase
    .from('requests')
    .update({ status: 'released' })
    .eq('id', requestId)
  if (error) {
    console.error('cancelRequest error:', error)
    return false
  }
  return true
}

export async function createRequest(data: {
  video_id: string
  video_title: string
  video_thumbnail: string
  reason: string
  relationship_id: string
  requested_by: 'account_owner' | 'accountability_partner'
}): Promise<Request | null> {
  const { data: result, error } = await supabase
    .from('requests')
    .insert({ ...data, status: 'pending' })
    .select()
    .single()
  if (error) {
    console.error('createRequest error:', error)
    return null
  }
  return result as Request
}

// ---- Invite tokens ----

export async function createInviteToken(ownerId: string): Promise<string | null> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const { error } = await supabase.from('invite_tokens').insert({
    owner_id: ownerId,
    token,
    used: false,
    expires_at: expiresAt,
  })
  if (error) {
    console.error('createInviteToken error:', error)
    return null
  }
  return token
}

export async function getInviteToken(token: string) {
  const { data, error } = await supabase
    .from('invite_tokens')
    .select('*, owner:profiles!owner_id(*)')
    .eq('token', token)
    .single()
  if (error) return null
  return data
}

export async function acceptInvite(token: string, partnerId: string): Promise<boolean> {
  // Get the token record
  const tokenRecord = await getInviteToken(token)
  if (!tokenRecord) return false
  if (tokenRecord.used) return false
  if (new Date(tokenRecord.expires_at) < new Date()) return false
  if (tokenRecord.owner_id === partnerId) return false  // can't be your own partner

  // Create relationship
  const { error: relError } = await supabase.from('relationships').insert({
    owner_id: tokenRecord.owner_id,
    partner_id: partnerId,
    status: 'active',
  })
  if (relError) {
    console.error('acceptInvite relationship error:', relError)
    return false
  }

  // Mark token as used
  await supabase.from('invite_tokens').update({ used: true }).eq('id', tokenRecord.id)
  return true
}

// ---- Telegram link codes ----

function generateLinkCode(): string {
  // 6-char uppercase alphanumeric, excluding ambiguous characters (0, O, 1, I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => chars[b % chars.length])
    .join('')
}

export async function createTelegramLinkCode(userId: string): Promise<string | null> {
  const code = generateLinkCode()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString() // 15 minutes
  const { error } = await supabase.from('telegram_link_codes').insert({
    user_id: userId,
    code,
    used: false,
    expires_at: expiresAt,
  })
  if (error) {
    console.error('createTelegramLinkCode error:', error)
    return null
  }
  return code
}

export async function sendInvite(
  partnerEmail: string,
): Promise<{ ok: true; method: 'telegram' | 'email' | 'link'; inviteUrl?: string } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Not logged in' }

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-invite`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        partnerEmail,
        appUrl: window.location.origin,
      }),
    },
  )

  const json = await res.json()
  if (!res.ok) return { ok: false, error: json.error ?? 'Failed to send invite' }
  return { ok: true, method: json.method }
}

export async function dissolveRelationship(relationshipId: string): Promise<boolean> {
  const { error } = await supabase
    .from('relationships')
    .update({ status: 'dissolved', dissolved_at: new Date().toISOString() })
    .eq('id', relationshipId)
  if (error) {
    console.error('dissolveRelationship error:', error)
    return false
  }
  return true
}
