import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

interface Props {
  roomId: string;
  onLeave: () => void;
}

export default function VoiceRoom({ roomId, onLeave }: Props) {
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream;
        if (mounted) setConnected(true);

        const channel = supabase.channel(`voice-signal-${roomId}`);
        channelRef.current = channel;

        channel
          .on('broadcast', { event: 'voice-offer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = createPeer(payload.sender);
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({ type: 'broadcast', event: 'voice-answer', payload: { sender: userId, target: payload.sender, sdp: answer } });
          })
          .on('broadcast', { event: 'voice-answer' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          })
          .on('broadcast', { event: 'voice-ice' }, async ({ payload }) => {
            if (payload.target !== userId) return;
            const pc = peers.current.get(payload.sender);
            if (pc && payload.candidate) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          })
          .on('broadcast', { event: 'voice-join' }, async ({ payload }) => {
            if (payload.userId === userId) return;
            const pc = createPeer(payload.userId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            channel.send({ type: 'broadcast', event: 'voice-offer', payload: { sender: userId, target: payload.userId, sdp: offer } });
          })
          .on('broadcast', { event: 'voice-leave' }, ({ payload }) => {
            const pc = peers.current.get(payload.userId);
            if (pc) { pc.close(); peers.current.delete(payload.userId); }
          })
          .subscribe(() => {
            channel.send({ type: 'broadcast', event: 'voice-join', payload: { userId, username } });
          });
      } catch (err) {
        console.error('Microphone access denied', err);
      }
    };

    const createPeer = (remoteId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peers.current.set(remoteId, pc);

      if (localStream.current) {
        localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channelRef.current?.send({ type: 'broadcast', event: 'voice-ice', payload: { sender: userId, target: remoteId, candidate: e.candidate } });
        }
      };

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
      channelRef.current?.send({ type: 'broadcast', event: 'voice-leave', payload: { userId } });
      channelRef.current?.unsubscribe();
      localStream.current?.getTracks().forEach((t) => t.stop());
      peers.current.forEach((pc) => pc.close());
    };
  }, [roomId, userId, username]);

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((t) => (t.enabled = muted));
      setMuted(!muted);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center ${connected ? 'border-online' : 'border-muted-foreground'}`}>
        {muted ? <MicOff className="h-10 w-10 text-destructive" /> : <Mic className="h-10 w-10 text-online" />}
      </div>
      <p className="text-sm font-mono text-muted-foreground">
        {connected ? 'Connected to voice' : 'Connecting...'}
      </p>
      <div className="flex gap-3">
        <Button
          onClick={toggleMute}
          variant="outline"
          className="font-mono gap-2 border-border text-foreground"
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button
          onClick={onLeave}
          variant="outline"
          className="font-mono gap-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <PhoneOff className="h-4 w-4" /> Leave
        </Button>
      </div>
    </div>
  );
}
