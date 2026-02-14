import { useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';

const LANGUAGES = ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'markdown'];

interface Props {
  roomId: string;
}

export default function CodeRoom({ roomId }: Props) {
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('// Start coding collaboratively...\n');
  const editorRef = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userId = useUserStore((s) => s.userId);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    const channel = supabase.channel(`code-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'code-change' }, ({ payload }) => {
        if (payload.userId === userId) return;
        isRemoteUpdate.current = true;
        setCode(payload.code);
        if (editorRef.current) {
          const pos = editorRef.current.getPosition();
          editorRef.current.setValue(payload.code);
          if (pos) editorRef.current.setPosition(pos);
        }
        isRemoteUpdate.current = false;
      })
      .on('broadcast', { event: 'lang-change' }, ({ payload }) => {
        if (payload.userId === userId) return;
        setLanguage(payload.language);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId]);

  const handleCodeChange = (value: string | undefined) => {
    if (isRemoteUpdate.current || !value) return;
    setCode(value);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'code-change',
      payload: { userId, code: value },
    });
  };

  const handleLangChange = (lang: string) => {
    setLanguage(lang);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'lang-change',
      payload: { userId, language: lang },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b border-border bg-muted flex items-center gap-2 px-3 shrink-0">
        <span className="text-xs font-mono text-muted-foreground">Lang:</span>
        {LANGUAGES.map((l) => (
          <button
            key={l}
            onClick={() => handleLangChange(l)}
            className={`px-2 py-1 text-xs font-mono rounded ${
              language === l ? 'bg-room-code/20 text-room-code' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            minimap: { enabled: false },
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
