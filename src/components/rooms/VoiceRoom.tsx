import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

interface PresenceUser {
  userId: string;
  username: string;
}

interface Props {
  roomId: string;
  onLeave: () => void;
  users: PresenceUser[];
  currentUserId: string;
}

export default function VoiceRoom({
  roomId,
  onLeave,
  users,
  currentUserId,
}: Props) {
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);

  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);

  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        localStream.current = stream;
        if (mounted) setConnected(true);

        const channel = supabase.channel(`voice-signal-${roomId}`);
        channelRef.current = channel;

        channel
          .on('broadcast', { event: 'voice-offer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = createPeer(payload.sender);
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload.sdp)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: 'broadcast',
              event: 'voice-answer',
              payload: {
                sender: userId,
                target: payload.sender,
                sdp: answer,
              },
            });
          })
          .on('broadcast', { event: 'voice-answer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc)
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload.sdp)
              );
          })
          .on('broadcast', { event: 'voice-ice' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc && payload.candidate)
              await pc.addIceCandidate(
                new RTCIceCandidate(payload.candidate)
              );
          })
          .on('broadcast', { event: 'voice-join' }, async ({ payload }) => {
            if (payload.userId === userId) return;
            const pc = createPeer(payload.userId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channel.send({
              type: 'broadcast',
              event: 'voice-offer',
              payload: {
                sender: userId,
                target: payload.userId,
                sdp: offer,
              },
            });
          })
          .subscribe(() => {
            channel.send({
              type: 'broadcast',
              event: 'voice-join',
              payload: { userId, username },
            });
          });
      } catch (err) {
        console.error('Mic error', err);
      }
    };

    const createPeer = (remoteId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.current.set(remoteId, pc);

      if (localStream.current) {
        localStream.current
          .getTracks()
          .forEach((t) => pc.addTrack(t, localStream.current!));
      }

      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {});
      };

      return pc;
    };

    start();

    return () => {
      mounted = false;
      channelRef.current?.unsubscribe();
      localStream.current?.getTracks().forEach((t) => t.stop());
      peers.current.forEach((pc) => pc.close());
    };
  }, [roomId, userId, username]);

  const toggleMute = () => {
    if (!localStream.current) return;

    localStream.current
      .getAudioTracks()
      .forEach((t) => (t.enabled = muted));

    setMuted(!muted);
  };

  // Discord-style dynamic grid
  const gridCols =
    users.length <= 1
      ? 'grid-cols-1'
      : users.length === 2
      ? 'grid-cols-2'
      : users.length <= 4
      ? 'grid-cols-2 md:grid-cols-2'
      : 'grid-cols-2 md:grid-cols-3';

  return (
    <div className="flex flex-col h-full bg-background">

      {/* User Grid */}
      <div className={`grid ${gridCols} gap-4 p-6 flex-1 overflow-auto`}>
        {users.map((u) => (
          <div
            key={u.userId}
            className="
              bg-card border border-border
              rounded-xl
              flex flex-col items-center justify-center
              p-6
              relative
            "
          >
            <div
              className={`
                w-20 h-20 rounded-full
                flex items-center justify-center
                border-2
                ${u.userId === currentUserId ? 'border-online' : 'border-muted-foreground'}
              `}
            >
              <span className="text-xl font-mono">
                {u.username.charAt(0).toUpperCase()}
              </span>
            </div>

            <p className="mt-3 text-sm font-mono truncate">
              {u.username}
              {u.userId === currentUserId && ' (You)'}
            </p>

            {u.userId === currentUserId && muted && (
              <MicOff className="absolute bottom-3 right-3 h-4 w-4 text-destructive" />
            )}
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="border-t border-border p-4 flex justify-center gap-4">
        <Button onClick={toggleMute} variant="outline" className="font-mono gap-2">
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {muted ? 'Unmute' : 'Mute'}
        </Button>

        <Button
          onClick={onLeave}
          variant="outline"
          className="font-mono gap-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}
