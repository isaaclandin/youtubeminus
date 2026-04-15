import { useState, useEffect, useCallback } from 'react'
import {
  getPendingRequestsForOwner,
  getActiveApprovalsForOwner,
  getRequestHistoryForOwner,
  getPendingForPartner,
  getActiveGrantedByPartner,
} from '../lib/supabase'
import type { Request } from '../types'

interface UseOwnerRequestsResult {
  pending: Request[]
  active: Request[]
  history: Request[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useOwnerRequests(relationshipIds: string[]): UseOwnerRequestsResult {
  const [pending, setPending] = useState<Request[]>([])
  const [active, setActive] = useState<Request[]>([])
  const [history, setHistory] = useState<Request[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    if (!relationshipIds.length) {
      setPending([])
      setActive([])
      setHistory([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [p, a, h] = await Promise.all([
        getPendingRequestsForOwner(relationshipIds),
        getActiveApprovalsForOwner(relationshipIds),
        getRequestHistoryForOwner(relationshipIds),
      ])
      setPending(p)
      setActive(a)
      setHistory(h)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [relationshipIds.join(',')])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  return { pending, active, history, loading, error, refetch: fetchRequests }
}

interface UsePartnerRequestsResult {
  needsResponse: Request[]
  activeGranted: Request[]
  ownerHistory: Request[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function usePartnerRequests(relationshipIds: string[]): UsePartnerRequestsResult {
  const [needsResponse, setNeedsResponse] = useState<Request[]>([])
  const [activeGranted, setActiveGranted] = useState<Request[]>([])
  const [ownerHistory, setOwnerHistory] = useState<Request[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    if (!relationshipIds.length) {
      setNeedsResponse([])
      setActiveGranted([])
      setOwnerHistory([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nr, ag, oh] = await Promise.all([
        getPendingForPartner(relationshipIds),
        getActiveGrantedByPartner(relationshipIds),
        getRequestHistoryForOwner(relationshipIds),
      ])
      setNeedsResponse(nr)
      setActiveGranted(ag)
      setOwnerHistory(oh)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [relationshipIds.join(',')])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  return { needsResponse, activeGranted, ownerHistory, loading, error, refetch: fetchRequests }
}
