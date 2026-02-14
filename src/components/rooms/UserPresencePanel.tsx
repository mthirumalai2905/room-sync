import { Circle } from 'lucide-react';

interface Props {
  users: { userId: string; username: string }[];
  currentUserId: string;
}

export default function UserPresencePanel({ users, currentUserId }: Props) {
  return (
    <div className="w-48 border-l border-border bg-card p-3 shrink-0 overflow-y-auto">
      <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
        Online ({users.length})
      </h3>
      <div className="space-y-2">
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
  );
}
