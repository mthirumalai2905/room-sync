import { useRef, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';

interface DrawPoint {
  x: number;
  y: number;
  color: string;
  size: number;
  type: 'start' | 'draw' | 'end';
}

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

const COLORS = ['#fff', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399'];
const SIZES = [2, 4, 8];

interface Props {
  roomId: string;
}

export default function WhiteboardRoom({ roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [tool, setTool] = useState<'draw' | 'sticky' | 'text'>('draw');
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userId = useUserStore((s) => s.userId);

  const drawPoint = useCallback((ctx: CanvasRenderingContext2D, point: DrawPoint) => {
    if (point.type === 'start') {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    } else if (point.type === 'draw') {
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = point.color;
      ctx.lineWidth = point.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const channel = supabase.channel(`whiteboard-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        if (payload.userId === userId) return;
        const ctx = canvas.getContext('2d');
        if (ctx) drawPoint(ctx, payload.point as DrawPoint);
      })
      .on('broadcast', { event: 'sticky' }, ({ payload }) => {
        if (payload.userId === userId) return;
        setStickies((prev) => {
          const exists = prev.find((s) => s.id === payload.sticky.id);
          if (exists) return prev.map((s) => (s.id === payload.sticky.id ? payload.sticky : s));
          return [...prev, payload.sticky as StickyNote];
        });
      })
      .on('broadcast', { event: 'clear' }, () => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setStickies([]);
      })
      .subscribe();

    return () => {
      window.removeEventListener('resize', resize);
      channel.unsubscribe();
    };
  }, [roomId, userId, drawPoint]);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'sticky') {
      const pos = getPos(e);
      const id = crypto.randomUUID();
      const sticky: StickyNote = { id, x: pos.x, y: pos.y, text: '', color: color };
      setStickies((prev) => [...prev, sticky]);
      channelRef.current?.send({ type: 'broadcast', event: 'sticky', payload: { userId, sticky } });
      return;
    }
    setIsDrawing(true);
    const pos = getPos(e);
    const point: DrawPoint = { ...pos, color, size, type: 'start' };
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPoint(ctx, point);
    channelRef.current?.send({ type: 'broadcast', event: 'draw', payload: { userId, point } });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || tool !== 'draw') return;
    const pos = getPos(e);
    const point: DrawPoint = { ...pos, color, size, type: 'draw' };
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawPoint(ctx, point);
    channelRef.current?.send({ type: 'broadcast', event: 'draw', payload: { userId, point } });
  };

  const handleMouseUp = () => setIsDrawing(false);

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setStickies([]);
    channelRef.current?.send({ type: 'broadcast', event: 'clear', payload: { userId } });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-10 border-b border-border bg-muted flex items-center gap-3 px-3 shrink-0">
        <div className="flex gap-1">
          {(['draw', 'sticky'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`px-2 py-1 text-xs font-mono rounded ${
                tool === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`px-2 py-1 text-xs font-mono rounded ${
                size === s ? 'bg-secondary text-foreground' : 'text-muted-foreground'
              }`}
            >
              {s}px
            </button>
          ))}
        </div>
        <button
          onClick={clearCanvas}
          className="ml-auto px-2 py-1 text-xs font-mono text-destructive hover:text-destructive/80"
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-background cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="absolute inset-0"
        />
        {stickies.map((s) => (
          <div
            key={s.id}
            className="absolute w-32 min-h-[80px] p-2 rounded shadow-lg"
            style={{ left: s.x, top: s.y, backgroundColor: s.color + '33', borderColor: s.color, borderWidth: 1 }}
          >
            <textarea
              defaultValue={s.text}
              onChange={(e) => {
                const updated = { ...s, text: e.target.value };
                setStickies((prev) => prev.map((n) => (n.id === s.id ? updated : n)));
                channelRef.current?.send({ type: 'broadcast', event: 'sticky', payload: { userId, sticky: updated } });
              }}
              className="w-full h-full bg-transparent text-xs font-mono text-foreground resize-none outline-none"
              placeholder="note..."
            />
          </div>
        ))}
      </div>
    </div>
  );
}
