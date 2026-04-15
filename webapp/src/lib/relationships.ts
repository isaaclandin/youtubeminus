import type { DurationType } from '../types'

export function generateInviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`
}

export function getDurationLabel(d: DurationType): string {
  const map: Record<DurationType, string> = {
    '1_day': '1 day',
    '1_week': '1 week',
  }
  return map[d]
}

export function isExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime()
}

export function isExpiringSoon(expiresAt: string): boolean {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return ms > 0 && ms < 15 * 60_000
}

export function isDenialOverrideable(firstDeniedAt: string): boolean {
  return Date.now() - new Date(firstDeniedAt).getTime() < 5 * 60_000
}

export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
