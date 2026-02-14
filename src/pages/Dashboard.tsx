import { useEffect, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import UsernamePrompt from '@/components/UsernamePrompt';
import CreateRoomDialog from '@/components/CreateRoomDialog';
import JoinRoomDialog from '@/components/JoinRoomDialog';
import RoomCard from '@/components/RoomCard';
import { fetchRooms, Room } from '@/lib/rooms';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const username = useUserStore((s) => s.username);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinRoom, setJoinRoom] = useState<Room | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinById, setJoinById] = useState('');
  const navigate = useNavigate();

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await fetchRooms();
      setRooms(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!username) return;
    loadRooms();

    const channel = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadRooms();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [username]);

  const handleJoinClick = (room: Room) => {
    if (room.is_locked) {
      setJoinRoom(room);
      setJoinDialogOpen(true);
    } else {
      navigate(`/room/${room.id}`);
    }
  };

  const handleJoinById = async () => {
    const id = joinById.trim();
    if (!id) return;
    navigate(`/room/${id}`);
  };

  if (!username) return <UsernamePrompt />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold font-mono text-foreground">
            collab<span className="text-primary">_</span>room
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-muted-foreground">
              {username}
            </span>
            <CreateRoomDialog onCreated={loadRooms} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Join by ID */}
        <div className="flex gap-2 mb-6">
          <Input
            value={joinById}
            onChange={(e) => setJoinById(e.target.value)}
            placeholder="Join by Room ID..."
            className="bg-secondary border-border text-foreground font-mono text-sm max-w-sm"
          />
          <button
            onClick={handleJoinById}
            disabled={!joinById.trim()}
            className="px-4 py-2 text-xs font-mono bg-secondary text-foreground rounded-md border border-border hover:border-primary/50 disabled:opacity-50 transition-colors"
          >
            Join →
          </button>
          <button
            onClick={loadRooms}
            className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Room grid */}
        {loading ? (
          <p className="text-sm font-mono text-muted-foreground">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm font-mono text-muted-foreground mb-2">No rooms yet</p>
            <p className="text-xs font-mono text-muted-foreground">Create one to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onJoin={handleJoinClick} />
            ))}
          </div>
        )}
      </main>

      <JoinRoomDialog
        room={joinRoom}
        open={joinDialogOpen}
        onOpenChange={setJoinDialogOpen}
      />
    </div>
  );
}
