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
  const [remoteScreenSharing, setRemoteScreenSharing] = useState<Set<string>>(new Set());

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

          // Add all local tracks (audio + video)
          localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));

          // If screen sharing is active, replace the video track with the screen track
          if (screenStream.current) {
            const screenTrack = screenStream.current.getVideoTracks()[0];
            if (screenTrack) {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              sender?.replaceTrack(screenTrack);
            }
          }

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

          pc.onnegotiationneeded = async () => {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              channel.send({ type: 'broadcast', event: 'video-offer', payload: { sender: userId, target: remoteId, sdp: offer } });
            } catch (err) {
              console.warn('Negotiation error', err);
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
            channel.send({ type: 'broadcast', event: 'video-offer', payload: { sender: userId, target: payload.userId, sdp: offer, sharing: !!screenStream.current } });
          })
          .on('broadcast', { event: 'video-leave' }, ({ payload }) => {
            const pc = peers.current.get(payload.userId);
            if (pc) { pc.close(); peers.current.delete(payload.userId); }
            setRemoteStreams((prev) => { const n = new Map(prev); n.delete(payload.userId); return n; });
          })
          .on('broadcast', { event: 'video-screen-status' }, ({ payload }) => {
            if (payload.userId === userId) return;
            // Track which remote users are sharing - used for UI
            setRemoteScreenSharing((prev) => {
              const next = new Set(prev);
              if (payload.sharing) next.add(payload.userId);
              else next.delete(payload.userId);
              return next;
            });
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
      screenStream.current = null;
      setSharing(false);
      // Broadcast screen share stopped
      channelRef.current?.send({ type: 'broadcast', event: 'video-screen-status', payload: { userId, sharing: false } });
      // Restore camera track to peers
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
        // Broadcast screen share started
        channelRef.current?.send({ type: 'broadcast', event: 'video-screen-status', payload: { userId, sharing: true } });
        screenTrack.onended = () => {
          screenStream.current = null;
          setSharing(false);
          channelRef.current?.send({ type: 'broadcast', event: 'video-screen-status', payload: { userId, sharing: false } });
          const camTrack = localStream.current?.getVideoTracks()[0];
          if (camTrack) {
            peers.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              sender?.replaceTrack(camTrack);
            });
          }
        };
        setSharing(true);
      } catch {
        // User cancelled
      }
    }
  };

  // Build user entries with streams
  const allUsers = users.map((u) => ({
    ...u,
    stream: u.userId === currentUserId ? localStream.current : remoteStreams.get(u.userId) ?? null,
    isLocal: u.userId === currentUserId,
  }));

  const hasScreenShare = sharing && screenStream.current;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Main content area */}
      <div className="flex-1 overflow-auto p-4">
        {hasScreenShare ? (
          /* Screen share layout: big screen + small user tiles */
          <div className="flex flex-col h-full gap-3">
            {/* Screen share — takes most space */}
            <div className="flex-1 min-h-0 bg-card border border-primary/40 rounded-xl overflow-hidden relative">
              <video
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && screenStream.current && el.srcObject !== screenStream.current) {
                    el.srcObject = screenStream.current;
                  }
                }}
                className="w-full h-full object-contain absolute inset-0"
              />
              <span className="absolute top-2 left-2 text-xs font-mono bg-primary/80 text-primary-foreground px-2 py-0.5 rounded z-10">
                Screen Share
              </span>
            </div>

            {/* User tiles — small row at bottom */}
            <div className="flex gap-3 overflow-x-auto pb-1 flex-shrink-0">
              {allUsers.map((u) => (
                <div
                  key={u.userId}
                  className="w-28 h-28 flex-shrink-0 bg-card border border-border rounded-lg flex flex-col items-center justify-center relative overflow-hidden"
                >
                  {u.stream && !u.isLocal ? (
                    <video
                      autoPlay
                      playsInline
                      muted={u.isLocal}
                      ref={(el) => {
                        if (el && el.srcObject !== u.stream) el.srcObject = u.stream;
                      }}
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  ) : u.isLocal && localStream.current ? (
                    <video
                      autoPlay
                      playsInline
                      muted
                      ref={(el) => {
                        if (el && el.srcObject !== localStream.current) el.srcObject = localStream.current;
                      }}
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${u.isLocal ? 'border-online' : 'border-muted-foreground'}`}>
                      <span className="text-sm font-mono">{u.username.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] font-mono bg-background/80 px-1 py-0.5 rounded text-foreground z-10 truncate max-w-full">
                    {u.username}{u.isLocal && ' (You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Normal layout: equal grid */
          <div className={`grid gap-4 h-full ${
            allUsers.length <= 1 ? 'grid-cols-1' :
            allUsers.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'
          }`}>
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
        )}
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
