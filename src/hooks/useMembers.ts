import { useCallback, useEffect, useState } from 'react'
import { fetchMembers } from '@/services/conversations'
import { useChatList } from '@/context/ChatListContext'
import type { Member } from '@/types'

/** Members (with profiles) of a conversation; refetches when membership changes anywhere. */
export function useMembers(conversationId: string) {
  const { memberVersion } = useChatList()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMembers([])
    setLoading(true)
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    fetchMembers(conversationId)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [conversationId, memberVersion])

  const reload = useCallback(async () => {
    try {
      setMembers(await fetchMembers(conversationId))
    } catch {
      /* keep stale list */
    }
  }, [conversationId])

  return { members, loading, reload }
}
