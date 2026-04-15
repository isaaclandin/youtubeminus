import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtime(relationshipIds: string[], onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!relationshipIds.length) return

    const channelName = `requests-${relationshipIds.sort().join('-')}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests',
          filter: `relationship_id=in.(${relationshipIds.join(',')})`,
        },
        () => {
          onUpdateRef.current()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [relationshipIds.join(',')])
}
