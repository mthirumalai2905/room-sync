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

export async function createRoom(
  name: string,
  type: RoomType,
  isLocked: boolean
): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ name, type, is_locked: isLocked })
    .select()
    .single();

  if (error) throw error;
  return data as Room;
}

export async function validateRoomAccess(
  roomId: string,
  key?: string
): Promise<{ allowed: boolean; room: Room | null }> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !data) return { allowed: false, room: null };

  const room = data as Room;

  if (room.active_users >= room.max_users)
    return { allowed: false, room };

  if (room.is_locked && room.access_key !== key)
    return { allowed: false, room };

  return { allowed: true, room };
}

/**
 * Sync active_users column from presence count
 */
export async function syncActiveUsers(roomId: string, count: number) {
  await supabase
    .from('rooms')
    .update({ active_users: count })
    .eq('id', roomId);
}

/**
 * Delete room only if no active users
 */
export async function deleteRoom(roomId: string): Promise<void> {
  const { data, error } = await supabase
    .from('rooms')
    .select('active_users')
    .eq('id', roomId)
    .single();

  if (error) throw error;
  if (!data) throw new Error('Room not found');

  if ((data.active_users ?? 0) > 0) {
    throw new Error('Cannot delete room while users are active');
  }

  const { error: deleteError } = await supabase
    .from('rooms')
    .delete()
    .eq('id', roomId);

  if (deleteError) throw deleteError;
}

export const ROOM_TYPE_CONFIG: Record<
  RoomType,
  { label: string; icon: string; colorClass: string }
> = {
  whiteboard: {
    label: 'Whiteboard',
    icon: '🟢',
    colorClass: 'text-room-whiteboard',
  },
  code: {
    label: 'Live Code',
    icon: '🟢',
    colorClass: 'text-room-code',
  },
  voice: {
    label: 'Voice Chat',
    icon: '🟢',
    colorClass: 'text-room-voice',
  },
  video: {
    label: 'Video + Screen',
    icon: '🟢',
    colorClass: 'text-room-video',
  },
};
