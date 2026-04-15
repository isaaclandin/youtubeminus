import { useState, useEffect } from 'react'
import { isExpiringSoon } from '../../lib/relationships'

interface ExpiryCountdownProps {
  expiresAt: string
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function ExpiryCountdown({ expiresAt }: ExpiryCountdownProps) {
  const [ms, setMs] = useState(() => new Date(expiresAt).getTime() - Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setMs(new Date(expiresAt).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  const soon = isExpiringSoon(expiresAt)
  const expired = ms <= 0

  return (
    <span className={`flex items-center gap-1 text-sm font-mono ${expired ? 'text-neutral-500' : soon ? 'text-yellow-400' : 'text-neutral-300'}`}>
      {soon && !expired && (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {formatCountdown(ms)}
    </span>
  )
}
