import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';
import { Room, validateRoomAccess, incrementUsers, decrementUsers } from '@/lib/rooms';
import RoomTopBar from '@/components/rooms/RoomTopBar';
import UserPresencePanel from '@/components/rooms/UserPresencePanel';
import WhiteboardRoom from '@/components/rooms/WhiteboardRoom';
import CodeRoom from '@/components/rooms/CodeRoom';
import VoiceRoom from '@/components/rooms/VoiceRoom';
import VideoRoom from '@/components/rooms/VideoRoom';
import UsernamePrompt from '@/components/UsernamePrompt';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type PresenceUser = { userId: string; username: string };

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<'loading' | 'key-required' | 'denied' | 'joined'>('loading');
  const [accessKey, setAccessKey] = useState('');
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasJoined = useRef(false);

  const joinRoom = async (key?: string) => {
    if (!roomId) return;
    const { allowed, room: r } = await validateRoomAccess(roomId, key);
    if (!allowed && r?.is_locked && !key) {
      setRoom(r);
      setStatus('key-required');
      return;
    }
    if (!allowed) {
      setStatus('denied');
      return;
    }
    setRoom(r);
    setStatus('joined');
    if (!hasJoined.current) {
      hasJoined.current = true;
      await incrementUsers(roomId);
    }

    // Presence
    const channel = supabase.channel(`presence-${roomId}`, { config: { presence: { key: userId } } });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const list: PresenceUser[] = [];
        Object.values(state).forEach((arr: any[]) => {
          arr.forEach((p: any) => list.push({ userId: p.userId, username: p.username }));
        });
        setUsers(list);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId, username });
        }
      });
  };

  useEffect(() => {
    if (!username) return;
    joinRoom();

    return () => {
      if (hasJoined.current && roomId) {
        decrementUsers(roomId);
      }
      channelRef.current?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, username]);

  const handleLeave = () => {
    navigate('/');
  };

  if (!username) return <UsernamePrompt />;

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-sm font-mono text-muted-foreground">Connecting to room...</p>
      </div>
    );
  }

  if (status === 'key-required') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-full max-w-sm space-y-4 px-4">
          <h2 className="text-lg font-mono font-bold text-foreground text-center">🔒 Room Locked</h2>
          <p className="text-xs font-mono text-muted-foreground text-center">Enter access key to join</p>
          <Input
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            placeholder="access key"
            className="bg-secondary border-border text-foreground font-mono text-center"
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={() => navigate('/')} variant="outline" className="flex-1 font-mono border-border text-foreground">
              Back
            </Button>
            <Button
              onClick={() => joinRoom(accessKey)}
              disabled={!accessKey}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
            >
              Unlock →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'denied' || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-3">
          <p className="text-sm font-mono text-destructive">Access denied or room is full</p>
          <Button onClick={() => navigate('/')} variant="outline" className="font-mono border-border text-foreground">
            ← Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const renderRoom = () => {
  switch (room.type) {
    case 'whiteboard':
      return <WhiteboardRoom roomId={room.id} />;

    case 'code':
      return <CodeRoom roomId={room.id} />;

    case 'voice':
      return (
        <VoiceRoom
          roomId={room.id}
          onLeave={handleLeave}
          users={users}
          currentUserId={userId}
        />
      );

    case 'video':
      return <VideoRoom roomId={room.id} onLeave={handleLeave} />;

    default:
      return <p className="text-muted-foreground font-mono p-4">Unknown room type</p>;
  }
};


  return (
    <div className="h-screen flex flex-col bg-background">
      <RoomTopBar room={room} userCount={users.length} onLeave={handleLeave} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">{renderRoom()}</div>
        <UserPresencePanel users={users} currentUserId={userId} />
      </div>
    </div>
  );
}
