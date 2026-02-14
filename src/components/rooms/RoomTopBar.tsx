import { Room, ROOM_TYPE_CONFIG } from '@/lib/rooms';
import { Lock, Unlock, Users, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  room: Room;
  userCount: number;
  onLeave: () => void;
}

export default function RoomTopBar({ room, userCount, onLeave }: Props) {
  const config = ROOM_TYPE_CONFIG[room.type];

  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className={`text-xs font-mono uppercase tracking-wider ${config.colorClass}`}>
          {config.label}
        </span>
        <span className="text-sm font-mono text-foreground font-semibold truncate max-w-[200px]">
          {room.name}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Users className="h-3 w-3" />
          <span className="text-online">{userCount}</span>
          <span>/ {room.max_users}</span>
        </div>
        {room.is_locked ? (
          <Lock className="h-3.5 w-3.5 text-locked" />
        ) : (
          <Unlock className="h-3.5 w-3.5 text-unlocked" />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLeave}
          className="text-muted-foreground hover:text-destructive font-mono text-xs gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" /> Leave
        </Button>
      </div>
    </div>
  );
}
