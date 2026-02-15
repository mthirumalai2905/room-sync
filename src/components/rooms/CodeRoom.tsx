import { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { supabase } from '@/integrations/supabase/client';
import { useUserStore } from '@/stores/userStore';
import { ChevronRight, ChevronDown, FileText, FolderOpen, Plus, Trash2, Terminal as TerminalIcon, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LANGUAGES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'html': 'html',
  'css': 'css',
  'json': 'json',
  'md': 'markdown',
};

function getLang(filename: string): string {
  const ext = filename.split('.').pop() || '';
  return LANGUAGES[ext] || 'javascript';
}

interface FileEntry {
  name: string;
  content: string;
}

interface Props {
  roomId: string;
}

export default function CodeRoom({ roomId }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([
    { name: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Preview</title>\n  <script src="index.js" defer></script>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>' },
    { name: 'index.js', content: '// Start coding...\nconsole.log("Hello from CodeRoom!");\n' },
    { name: 'style.css', content: 'body {\n  font-family: sans-serif;\n  background: #1a1a2e;\n  color: #eee;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 100vh;\n  margin: 0;\n}\n' },
  ]);
  const [activeFile, setActiveFile] = useState('index.js');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['$ Ready.']);
  const [terminalInput, setTerminalInput] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const editorRef = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userId = useUserStore((s) => s.userId);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Broadcast setup
  useEffect(() => {
    const channel = supabase.channel(`code-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'code-change' }, ({ payload }) => {
        if (payload.userId === userId) return;
        isRemoteUpdate.current = true;
        setFiles((prev) =>
          prev.map((f) => (f.name === payload.fileName ? { ...f, content: payload.code } : f))
        );
        isRemoteUpdate.current = false;
      })
      .on('broadcast', { event: 'file-added' }, ({ payload }) => {
        if (payload.userId === userId) return;
        setFiles((prev) => {
          if (prev.find((f) => f.name === payload.file.name)) return prev;
          return [...prev, payload.file];
        });
      })
      .on('broadcast', { event: 'file-deleted' }, ({ payload }) => {
        if (payload.userId === userId) return;
        setFiles((prev) => prev.filter((f) => f.name !== payload.fileName));
        setActiveFile((cur) => (cur === payload.fileName ? 'index.js' : cur));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId]);

  const currentFile = files.find((f) => f.name === activeFile);

  const handleCodeChange = (value: string | undefined) => {
    if (isRemoteUpdate.current || !value) return;
    setFiles((prev) =>
      prev.map((f) => (f.name === activeFile ? { ...f, content: value } : f))
    );
    channelRef.current?.send({
      type: 'broadcast',
      event: 'code-change',
      payload: { userId, fileName: activeFile, code: value },
    });
  };

  const addFile = () => {
    const name = newFileName.trim();
    if (!name || files.find((f) => f.name === name)) return;
    const file: FileEntry = { name, content: '' };
    setFiles((prev) => [...prev, file]);
    setActiveFile(name);
    setNewFileName('');
    setShowNewFile(false);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'file-added',
      payload: { userId, file },
    });
  };

  const deleteFile = (name: string) => {
    if (files.length <= 1) return;
    setFiles((prev) => prev.filter((f) => f.name !== name));
    if (activeFile === name) setActiveFile(files[0].name === name ? files[1]?.name : files[0].name);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'file-deleted',
      payload: { userId, fileName: name },
    });
  };

  const handleTerminalSubmit = () => {
    const cmd = terminalInput.trim();
    if (!cmd) return;
    setTerminalOutput((prev) => [...prev, `$ ${cmd}`]);
    if (cmd === 'clear') {
      setTerminalOutput(['$ Ready.']);
    } else if (cmd === 'run') {
      setTerminalOutput((prev) => [...prev, '> Running preview...']);
      updatePreview();
    } else if (cmd === 'ls') {
      setTerminalOutput((prev) => [...prev, files.map((f) => f.name).join('  ')]);
    } else if (cmd.startsWith('cat ')) {
      const fname = cmd.slice(4).trim();
      const f = files.find((x) => x.name === fname);
      setTerminalOutput((prev) => [...prev, f ? f.content : `File not found: ${fname}`]);
    } else {
      setTerminalOutput((prev) => [...prev, `Unknown command: ${cmd}. Try: run, ls, cat <file>, clear`]);
    }
    setTerminalInput('');
  };

  const updatePreview = useCallback(() => {
    const htmlFile = files.find((f) => f.name === 'index.html');
    const jsFile = files.find((f) => f.name === 'index.js');
    const cssFile = files.find((f) => f.name === 'style.css');

    let html = htmlFile?.content || '<html><body></body></html>';
    // Inject CSS inline
    if (cssFile) {
      html = html.replace('</head>', `<style>${cssFile.content}</style></head>`);
    }
    // Inject JS inline
    if (jsFile) {
      html = html.replace('</body>', `<script>${jsFile.content}<\/script></body>`);
    }
    // Remove external references
    html = html.replace(/<script src="index\.js"[^>]*><\/script>/g, '');
    html = html.replace(/<link[^>]*href="style\.css"[^>]*\/?>/g, '');

    if (iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
  }, [files]);

  // Auto-update preview when files change
  useEffect(() => {
    updatePreview();
  }, [files, updatePreview]);

  return (
    <div className="flex h-full">
      {/* Left: File tree */}
      <div className="w-48 border-r border-border bg-card flex flex-col shrink-0">
        <div className="h-10 border-b border-border flex items-center justify-between px-3">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Files</span>
          <button onClick={() => setShowNewFile(!showNewFile)} className="text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {showNewFile && (
          <div className="p-2 border-b border-border">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="filename.js"
              className="h-7 text-xs font-mono bg-secondary border-border"
              onKeyDown={(e) => e.key === 'Enter' && addFile()}
              autoFocus
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-1">
          {files.map((f) => (
            <div
              key={f.name}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs font-mono group ${
                activeFile === f.name ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              onClick={() => setActiveFile(f.name)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              {files.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteFile(f.name); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Center: Editor + Terminal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="h-9 border-b border-border bg-muted flex items-center gap-1 px-2 shrink-0 overflow-x-auto">
          {files.map((f) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(f.name)}
              className={`px-3 py-1 text-xs font-mono rounded-t whitespace-nowrap ${
                activeFile === f.name ? 'bg-card text-foreground border-t border-x border-border' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language={currentFile ? getLang(currentFile.name) : 'javascript'}
            value={currentFile?.content ?? ''}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>

        {/* Terminal */}
        <div className="h-40 border-t border-border bg-card flex flex-col shrink-0">
          <div className="h-8 border-b border-border flex items-center px-3 gap-2">
            <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Terminal</span>
            <button onClick={() => updatePreview()} className="ml-auto text-muted-foreground hover:text-foreground" title="Run preview">
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs text-muted-foreground">
            {terminalOutput.map((line, i) => (
              <div key={i} className={line.startsWith('$') ? 'text-foreground' : ''}>{line}</div>
            ))}
          </div>
          <div className="border-t border-border flex items-center px-3">
            <span className="text-xs font-mono text-muted-foreground mr-1">$</span>
            <input
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTerminalSubmit()}
              className="flex-1 bg-transparent text-xs font-mono text-foreground outline-none py-1.5"
              placeholder="Type a command..."
            />
          </div>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="w-[40%] border-l border-border flex flex-col shrink-0">
        <div className="h-9 border-b border-border bg-muted flex items-center px-3 gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Preview</span>
          <button onClick={() => updatePreview()} className="ml-auto text-muted-foreground hover:text-foreground" title="Refresh">
            <Play className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 bg-white">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title="Preview"
          />
        </div>
      </div>
    </div>
  );
}
