import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Room, validateRoomAccess } from '@/lib/rooms';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Props {
  room: Room | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function JoinRoomDialog({ room, open, onOpenChange }: Props) {
  const [accessKey, setAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (!room) return null;

  const handleJoin = async () => {
    setLoading(true);
    const { allowed } = await validateRoomAccess(room.id, room.is_locked ? accessKey : undefined);
    if (allowed) {
      navigate(`/room/${room.id}`);
    } else {
      toast.error('Access denied. Check the key or room may be full.');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">
            Join: {room.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {room.is_locked && (
            <div>
              <Label className="text-muted-foreground font-mono text-xs">Access Key</Label>
              <Input
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="enter access key"
                className="bg-secondary border-border text-foreground font-mono mt-1"
                autoFocus
              />
            </div>
          )}
          <div className="text-xs text-muted-foreground font-mono space-y-1">
            <p>Type: {room.type} | Users: {room.active_users}/{room.max_users}</p>
            <p>ID: {room.id}</p>
          </div>
          <Button
            onClick={handleJoin}
            disabled={loading || (room.is_locked && !accessKey)}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
          >
            {loading ? 'Joining...' : 'Join Room →'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
