import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

export default function VideoRoom({ roomId, onLeave, users, currentUserId }: Props) {
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const channel = supabase.channel(`video-signal-${roomId}`);
        channelRef.current = channel;

        const createPeer = (remoteId: string) => {
          if (peers.current.has(remoteId)) {
            peers.current.get(remoteId)!.close();
          }
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peers.current.set(remoteId, pc);
          localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              channel.send({ type: 'broadcast', event: 'video-ice', payload: { sender: userId, target: remoteId, candidate: e.candidate.toJSON() } });
            }
          };

          pc.ontrack = (e) => {
            if (mounted) {
              setRemoteStreams((prev) => {
                const next = new Map(prev);
                next.set(remoteId, e.streams[0]);
                return next;
              });
            }
          };

          return pc;
        };

        channel
          .on('broadcast', { event: 'video-offer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = createPeer(payload.sender);
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({ type: 'broadcast', event: 'video-answer', payload: { sender: userId, target: payload.sender, sdp: answer } });
          })
          .on('broadcast', { event: 'video-answer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          })
          .on('broadcast', { event: 'video-ice' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc && payload.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch (err) {
                console.warn('ICE candidate error', err);
              }
            }
          })
          .on('broadcast', { event: 'video-join' }, async ({ payload }) => {
            if (payload.userId === userId) return;
            const pc = createPeer(payload.userId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channel.send({ type: 'broadcast', event: 'video-offer', payload: { sender: userId, target: payload.userId, sdp: offer } });
          })
          .on('broadcast', { event: 'video-leave' }, ({ payload }) => {
            const pc = peers.current.get(payload.userId);
            if (pc) { pc.close(); peers.current.delete(payload.userId); }
            setRemoteStreams((prev) => { const n = new Map(prev); n.delete(payload.userId); return n; });
          })
          .subscribe(() => {
            channel.send({ type: 'broadcast', event: 'video-join', payload: { userId, username } });
          });
      } catch (err) {
        console.error('Camera/mic access denied', err);
      }
    };

    start();

    return () => {
      mounted = false;
      channelRef.current?.send({ type: 'broadcast', event: 'video-leave', payload: { userId } });
      channelRef.current?.unsubscribe();
      localStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
      peers.current.forEach((pc) => pc.close());
    };
  }, [roomId, userId, username]);

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleCamera = () => {
    localStream.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    setCameraOff(!cameraOff);
  };

  const toggleScreenShare = async () => {
    if (sharing) {
      screenStream.current?.getTracks().forEach((t) => t.stop());
      setSharing(false);
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        peers.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          sender?.replaceTrack(videoTrack);
        });
      }
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        peers.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          sender?.replaceTrack(screenTrack);
        });
        screenTrack.onended = () => setSharing(false);
        setSharing(true);
      } catch {
        // User cancelled
      }
    }
  };

  // Build a user map that includes remote stream info
  const allUsers = users.map((u) => ({
    ...u,
    stream: u.userId === currentUserId ? localStream.current : remoteStreams.get(u.userId) ?? null,
    isLocal: u.userId === currentUserId,
  }));

  const gridCols =
    allUsers.length <= 1 ? 'grid-cols-1' :
    allUsers.length === 2 ? 'grid-cols-2' :
    allUsers.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3';

  return (
    <div className="flex flex-col h-full bg-background">
      {/* User grid — same style as VoiceRoom */}
      <div className={`grid ${gridCols} gap-4 p-6 flex-1 overflow-auto`}>
        {allUsers.map((u) => (
          <div
            key={u.userId}
            className="bg-card border border-border rounded-xl flex flex-col items-center justify-center relative overflow-hidden min-h-[200px]"
          >
            {u.stream ? (
              <video
                autoPlay
                playsInline
                muted={u.isLocal}
                ref={(el) => {
                  if (el && el.srcObject !== u.stream) el.srcObject = u.stream;
                }}
                className="w-full h-full object-cover absolute inset-0"
              />
            ) : (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 ${u.isLocal ? 'border-online' : 'border-muted-foreground'}`}>
                <span className="text-xl font-mono">{u.username.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <span className="absolute bottom-2 left-2 text-xs font-mono bg-background/80 px-2 py-0.5 rounded text-foreground z-10">
              {u.username}{u.isLocal && ' (You)'}
              {u.isLocal && muted && ' 🔇'}
              {u.isLocal && cameraOff && ' 📷❌'}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="border-t border-border p-4 flex justify-center gap-3">
        <Button onClick={toggleMute} variant="outline" size="sm" className="font-mono gap-1.5">
          {muted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button onClick={toggleCamera} variant="outline" size="sm" className="font-mono gap-1.5">
          {cameraOff ? <VideoOff className="h-4 w-4 text-destructive" /> : <Video className="h-4 w-4" />}
          {cameraOff ? 'Camera On' : 'Camera Off'}
        </Button>
        <Button onClick={toggleScreenShare} variant="outline" size="sm" className={`font-mono gap-1.5 ${sharing ? 'text-accent' : ''}`}>
          <Monitor className="h-4 w-4" />
          {sharing ? 'Stop Share' : 'Share'}
        </Button>
        <Button onClick={onLeave} variant="outline" size="sm" className="font-mono gap-1.5 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}
