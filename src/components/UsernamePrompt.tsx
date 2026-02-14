import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function UsernamePrompt() {
  const [name, setName] = useState('');
  const setUsername = useUserStore((s) => s.setUsername);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) {
      setUsername(name);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
            collab<span className="text-primary">_</span>room
          </h1>
          <p className="text-sm text-muted-foreground">Enter your username to continue</p>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="username"
          maxLength={20}
          autoFocus
          className="bg-secondary border-border text-foreground font-mono text-center"
        />
        <Button
          type="submit"
          disabled={name.trim().length < 2}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
        >
          Enter →
        </Button>
      </form>
    </div>
  );
}
