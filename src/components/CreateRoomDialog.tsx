import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RoomType, createRoom } from '@/lib/rooms';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const ROOM_TYPES: { value: RoomType; label: string; color: string }[] = [
  { value: 'whiteboard', label: 'Whiteboard', color: 'border-room-whiteboard text-room-whiteboard' },
  { value: 'code', label: 'Live Code', color: 'border-room-code text-room-code' },
  { value: 'voice', label: 'Voice Chat', color: 'border-room-voice text-room-voice' },
  { value: 'video', label: 'Video + Screen', color: 'border-room-video text-room-video' },
];

interface Props {
  onCreated: () => void;
}

export default function CreateRoomDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('whiteboard');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const room = await createRoom(name.trim(), type, locked);
      toast.success(`Room created! Access key: ${room.access_key}`, { duration: 10000 });
      setOpen(false);
      setName('');
      onCreated();
    } catch {
      toast.error('Failed to create room');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono gap-2">
          <Plus className="h-4 w-4" /> New Room
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">Create Room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground font-mono text-xs">Room Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="my-room"
              className="bg-secondary border-border text-foreground font-mono mt-1"
            />
          </div>
          <div>
            <Label className="text-muted-foreground font-mono text-xs">Room Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  onClick={() => setType(rt.value)}
                  className={`px-3 py-2 rounded-md border text-xs font-mono transition-colors ${
                    type === rt.value
                      ? `${rt.color} bg-secondary`
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground font-mono text-xs">Lock Room</Label>
            <Switch checked={locked} onCheckedChange={setLocked} />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
