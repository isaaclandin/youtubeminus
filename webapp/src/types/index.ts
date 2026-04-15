export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled'
export type RequestStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'released'
export type DurationType = '1_day' | '1_week'
export type RelationshipStatus = 'pending' | 'active' | 'dissolved'
export type RequestedBy = 'account_owner' | 'accountability_partner'

export interface Profile {
  id: string
  email: string
  display_name: string
  subscription_status: SubscriptionStatus
  created_at: string
  telegram_chat_id?: string
}

export interface Relationship {
  id: string
  owner_id: string
  partner_id: string
  status: RelationshipStatus
  created_at: string
  dissolved_at?: string
  owner?: Profile
  partner?: Profile
}

export interface Request {
  id: string
  video_id: string
  video_title: string
  video_thumbnail: string
  reason: string
  status: RequestStatus
  duration_type?: DurationType
  approved_at?: string
  expires_at?: string
  created_at: string
  requested_by: RequestedBy
  relationship_id: string
  first_denied_at?: string
}

export interface InviteToken {
  id: string
  owner_id: string
  token: string
  used: boolean
  expires_at: string
  created_at: string
}
