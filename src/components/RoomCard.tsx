import { Room, ROOM_TYPE_CONFIG } from '@/lib/rooms';
import { Lock, Unlock, Users } from 'lucide-react';

interface RoomCardProps {
  room: Room;
  onJoin: (room: Room) => void;
}

const TYPE_BG: Record<string, string> = {
  whiteboard: 'border-room-whiteboard/30 hover:border-room-whiteboard/60',
  code: 'border-room-code/30 hover:border-room-code/60',
  voice: 'border-room-voice/30 hover:border-room-voice/60',
  video: 'border-room-video/30 hover:border-room-video/60',
};

export default function RoomCard({ room, onJoin }: RoomCardProps) {
  const config = ROOM_TYPE_CONFIG[room.type];
  const isFull = room.active_users >= room.max_users;

  return (
    <button
      onClick={() => !isFull && onJoin(room)}
      disabled={isFull}
      className={`w-full text-left p-4 rounded-lg bg-card border transition-colors ${TYPE_BG[room.type]} ${isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-mono uppercase tracking-wider ${config.colorClass}`}>
          {config.label}
        </span>
        {room.is_locked ? (
          <Lock className="h-3.5 w-3.5 text-locked" />
        ) : (
          <Unlock className="h-3.5 w-3.5 text-unlocked" />
        )}
      </div>
      <h3 className="text-sm font-semibold text-foreground truncate mb-3 font-mono">
        {room.name}
      </h3>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span className={room.active_users > 0 ? 'text-online' : ''}>
          {room.active_users}
        </span>
        <span>/ {room.max_users}</span>
        {isFull && <span className="ml-auto text-destructive font-mono">FULL</span>}
      </div>
    </button>
  );
}
