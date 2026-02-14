import { supabase } from '@/integrations/supabase/client';

export type RoomType = 'whiteboard' | 'code' | 'voice' | 'video';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  access_key: string;
  is_locked: boolean;
  max_users: number;
  active_users: number;
  created_at: string;
}

export async function fetchRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function createRoom(name: string, type: RoomType, isLocked: boolean): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ name, type, is_locked: isLocked })
    .select()
    .single();
  if (error) throw error;
  return data as Room;
}

export async function validateRoomAccess(roomId: string, key?: string): Promise<{ allowed: boolean; room: Room | null }> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (error || !data) return { allowed: false, room: null };
  const room = data as Room;
  if (room.active_users >= room.max_users) return { allowed: false, room };
  if (room.is_locked && room.access_key !== key) return { allowed: false, room };
  return { allowed: true, room };
}

export async function incrementUsers(roomId: string) {
  const { data } = await supabase.from('rooms').select('active_users').eq('id', roomId).single();
  if (data) {
    await supabase.from('rooms').update({ active_users: Math.min((data.active_users ?? 0) + 1, 10) }).eq('id', roomId);
  }
}

export async function decrementUsers(roomId: string) {
  const { data } = await supabase.from('rooms').select('active_users').eq('id', roomId).single();
  if (data) {
    await supabase.from('rooms').update({ active_users: Math.max((data.active_users ?? 0) - 1, 0) }).eq('id', roomId);
  }
}

export const ROOM_TYPE_CONFIG: Record<RoomType, { label: string; icon: string; colorClass: string }> = {
  whiteboard: { label: 'Whiteboard', icon: '🟢', colorClass: 'text-room-whiteboard' },
  code: { label: 'Live Code', icon: '🟢', colorClass: 'text-room-code' },
  voice: { label: 'Voice Chat', icon: '🟢', colorClass: 'text-room-voice' },
  video: { label: 'Video + Screen', icon: '🟢', colorClass: 'text-room-video' },
};
