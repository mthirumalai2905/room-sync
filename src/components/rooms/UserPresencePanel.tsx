import { useState } from 'react';
import { Circle, Users, X } from 'lucide-react';

interface Props {
  users: { userId: string; username: string }[];
  currentUserId: string;
}

export default function UserPresencePanel({ users, currentUserId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Always-visible Toggle Button (Bottom Right) */}
      <button
        onClick={() => setOpen(true)}
        className="
          fixed bottom-6 right-6 z-50
          p-3 rounded-full
          bg-primary text-primary-foreground
          shadow-lg hover:scale-105
          transition-all duration-200
        "
      >
        <Users className="h-5 w-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full
          w-72
          border-l border-border
          bg-card
          p-4
          overflow-y-auto
          shadow-xl
          transform transition-transform duration-300
          z-50
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Online ({users.length})
          </h3>

          <button onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.userId} className="flex items-center gap-2">
              <Circle className="h-2 w-2 fill-online text-online animate-pulse-dot" />
              <span className="text-xs font-mono text-foreground truncate">
                {u.username}
                {u.userId === currentUserId && (
                  <span className="text-muted-foreground ml-1">(you)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
