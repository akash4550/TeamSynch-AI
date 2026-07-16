import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Users, Wifi, WifiOff } from 'lucide-react';

interface ActiveCollaborator {
  name: string;
  color: string;
}

interface CollaborativeEditorProps {
  documentId: string;
  documentTitle: string;
  token: string;
  userName?: string;
  userColor?: string;
}

export const CollaborativeEditor = ({
  documentId,
  documentTitle,
  token,
  userName = 'Collaborator',
  userColor = '#3B82F6',
}: CollaborativeEditorProps) => {
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc] = useState(() => new Y.Doc());
  const [isConnected, setIsConnected] = useState(false);
  const [activeCollaborators, setActiveCollaborators] = useState<ActiveCollaborator[]>([]);

  useEffect(() => {
    if (!token || !documentId) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_HOST || window.location.host;
    const wsServerUrl = `${wsProtocol}//${wsHost}/api/v1/realtime/documents/crdt`;

    // Instantiate Yjs WebsocketProvider connecting to authenticated endpoint
    const wsProvider = new WebsocketProvider(wsServerUrl, `doc_${documentId}`, ydoc, {
      params: { token, documentId },
    });

    wsProvider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });

    // Awareness awareness state sync for live cursors
    wsProvider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });

    wsProvider.awareness.on('change', () => {
      const states = Array.from(wsProvider.awareness.getStates().values());
      const collaborators = states
        .map((state: any) => state.user)
        .filter(Boolean) as ActiveCollaborator[];
      setActiveCollaborators(collaborators);
    });

    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
      ydoc.destroy();
    };
  }, [documentId, token, ydoc, userName, userColor]);

  // Bind TipTap Editor to Y.Doc and Collaboration Extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // History extension handled by Yjs Collaboration
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      ...(provider
        ? [
            CollaborationCursor.configure({
              provider,
              user: {
                name: userName,
                color: userColor,
              },
            }),
          ]
        : []),
    ],
  });

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col h-[650px]">
      {/* Editor Header Bar */}
      <div className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white text-base">{documentTitle}</h2>
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-medium">
            ProseMirror CRDT
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Real-time Connection Indicator */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {isConnected ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Wifi className="w-4 h-4" /> Live Sync Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-500">
                <WifiOff className="w-4 h-4" /> Reconnecting...
              </span>
            )}
          </div>

          {/* Active Collaborator Awareness Cursors */}
          <div className="flex items-center gap-1.5 border-l border-gray-200 dark:border-slate-700 pl-4">
            <Users className="w-4 h-4 text-gray-400" />
            <div className="flex -space-x-1 overflow-hidden">
              {activeCollaborators.map((u, idx) => (
                <div
                  key={idx}
                  className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-800 text-[10px] font-bold text-white flex items-center justify-center uppercase"
                  style={{ backgroundColor: u.color }}
                  title={u.name}
                >
                  {u.name.slice(0, 2)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TipTap ProseMirror Rich Text Editor Content Area */}
      <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-slate-900 prose dark:prose-invert max-w-none">
        <EditorContent editor={editor} className="h-full min-h-[450px] outline-none" />
      </div>
    </div>
  );
};
