import { supabase } from '@/lib/supabase'

export async function startCallRpc(conversationId: string, video: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('start_call', { _conversation: conversationId, _video: video })
  if (error) throw error
  return data as string
}

export type CallStatus = 'accepted' | 'declined' | 'cancelled' | 'missed' | 'ended'

export async function setCallStatus(id: string, status: CallStatus) {
  const { error } = await supabase.rpc('set_call_status', { _id: id, _status: status })
  if (error) throw error
}
