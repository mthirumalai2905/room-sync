import { useState } from 'react';
import { Room, ROOM_TYPE_CONFIG } from '@/lib/rooms';
import { Lock, Unlock, Users, Trash2 } from 'lucide-react';
import { deleteRoom } from '@/lib/rooms';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteRoom(room.id);
      toast.success('Room deleted successfully');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete room');
    }
    setDeleting(false);
  };

  return (
    <button
      onClick={() => !isFull && onJoin(room)}
      disabled={isFull}
      className={`relative w-full text-left p-4 rounded-lg bg-card border transition-colors ${TYPE_BG[room.type]} ${
        isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {/* RIGHT SIDE ICON RAIL */}
      <div
        className="absolute top-4 bottom-4 right-4 flex flex-col justify-between items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {room.is_locked ? (
          <Lock className="h-4 w-4 text-locked" />
        ) : (
          <Unlock className="h-4 w-4 text-unlocked" />
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              disabled={deleting}
              className="text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete "{room.name}"?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The room will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* MAIN CONTENT */}
      <div className="pr-10">
        <span
          className={`text-xs font-mono uppercase tracking-wider ${config.colorClass}`}
        >
          {config.label}
        </span>

        <h3 className="text-sm font-semibold text-foreground truncate mt-2 mb-3 font-mono">
          {room.name}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className={room.active_users > 0 ? 'text-online' : ''}>
            {room.active_users}
          </span>
          <span>/ {room.max_users}</span>
          {isFull && (
            <span className="ml-auto text-destructive font-mono">FULL</span>
          )}
        </div>
      </div>
    </button>
  );
}
