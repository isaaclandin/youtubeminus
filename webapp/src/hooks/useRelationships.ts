import { useState, useEffect, useCallback } from 'react'
import { supabase, getMyRelationships } from '../lib/supabase'
import type { Relationship } from '../types'

interface UseRelationshipsResult {
  ownerRelationships: Relationship[]
  partnerRelationships: Relationship[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useRelationships(): UseRelationshipsResult {
  const [ownerRelationships, setOwnerRelationships] = useState<Relationship[]>([])
  const [partnerRelationships, setPartnerRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRelationships = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id
    if (!userId) {
      setLoading(false)
      return
    }
    const result = await getMyRelationships(userId)
    setOwnerRelationships(result.asOwner)
    setPartnerRelationships(result.asPartner)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRelationships()
  }, [fetchRelationships])

  return {
    ownerRelationships,
    partnerRelationships,
    loading,
    error,
    refetch: fetchRelationships,
  }
}
