import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, createTelegramLinkCode, getProfile } from '../lib/supabase'

interface UseTelegramConnectionResult {
  code: string | null
  isConnected: boolean
  justConnected: boolean   // true for 3s after connection detected — use to show success
  isGenerating: boolean
  codeExpired: boolean
  error: string | null
  regenerate: () => void
}

export function useTelegramConnection(userId: string | null): UseTelegramConnectionResult {
  const [code, setCode]               = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [codeExpired, setCodeExpired] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null)

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const generateCode = useCallback(async () => {
    if (!userId) return
    setIsGenerating(true)
    setError(null)
    setCodeExpired(false)
    const newCode = await createTelegramLinkCode(userId)
    if (newCode) {
      setCode(newCode)
      setCodeExpiresAt(new Date(Date.now() + 15 * 60_000))
    } else {
      setError('Failed to generate link code. Please try again.')
    }
    setIsGenerating(false)
  }, [userId])

  // Check if the profile now has a telegram_chat_id
  const checkConnection = useCallback(async () => {
    if (!userId) return
    const profile = await getProfile(userId)
    if (profile?.telegram_chat_id) {
      stopPolling()
      setIsConnected(true)
      setJustConnected(true)
      // Auto-dismiss the "just connected" success state after 3s
      timerRef.current = setTimeout(() => setJustConnected(false), 3_000)
    }
  }, [userId, stopPolling])

  // Generate code on mount if userId is set
  useEffect(() => {
    if (userId) generateCode()
    return () => {
      stopPolling()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll profile every 3 seconds while code exists and not yet connected
  useEffect(() => {
    if (!code || isConnected) return
    stopPolling()
    pollRef.current = setInterval(checkConnection, 3_000)
    return stopPolling
  }, [code, isConnected, checkConnection, stopPolling])

  // Watch for code expiry
  useEffect(() => {
    if (!codeExpiresAt || isConnected) return
    const msUntilExpiry = codeExpiresAt.getTime() - Date.now()
    if (msUntilExpiry <= 0) { setCodeExpired(true); return }
    const t = setTimeout(() => setCodeExpired(true), msUntilExpiry)
    return () => clearTimeout(t)
  }, [codeExpiresAt, isConnected])

  // Try to use Supabase Realtime on profiles as a faster signal
  useEffect(() => {
    if (!userId || isConnected) return
    const channel = supabase
      .channel(`profile-telegram-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as { telegram_chat_id?: string }
          if (updated.telegram_chat_id) {
            stopPolling()
            setIsConnected(true)
            setJustConnected(true)
            timerRef.current = setTimeout(() => setJustConnected(false), 3_000)
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, isConnected, stopPolling])

  return {
    code,
    isConnected,
    justConnected,
    isGenerating,
    codeExpired,
    error,
    regenerate: generateCode,
  }
}
