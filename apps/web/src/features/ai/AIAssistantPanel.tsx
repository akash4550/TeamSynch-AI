import { useEffect, useRef, useState, type FC, type FormEvent } from 'react';
import { ArrowPathIcon, PaperAirplaneIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAssistant } from './hooks/useAI';
import { useSocket } from '../../providers/SocketProvider';
import { Button } from '../../components/ui/Button';

/*
 * UI PASS (#UI-ai-panel, 2026-08-07): visual-only restyle of the floating
 * assistant — Tremor chrome (Card/TextInput/Button) swapped for the shared
 * design system. The async job-ticket flow (202 → socket completion → 60s
 * safety net) and every message string are preserved verbatim; there are
 * no test locks on this component.
 *
 * Disclosed visual/a11y-only changes: blue chrome moved onto the shared
 * primary accent (same hue family); panel is now role="dialog" with an
 * aria-label and the close button has an aria-label; the message list is
 * aria-live="polite" so replies are announced; lucide → heroicons (single
 * icon system); the fixed panel caps its height/width on small viewports
 * (w-96 previously overflowed <384px phones) — desktop geometry unchanged.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AiCompletionEvent {
  jobId?: string;
  userId?: string;
  result?: unknown;
}

export const AIAssistantPanel: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your TeamSynch AI Assistant. How can I help you today?' }
  ]);

  const { mutate: askAssistant, isPending } = useAssistant();
  const { socket } = useSocket();

  /*
   * BUG FIX (panel crashed on every AI reply): `/ai/assistant/ask` is
   * asynchronous — it responds 202 with a job ticket while the answer is
   * generated in a BullMQ worker and broadcast over the
   * `ai.completion.finished` socket event. The panel previously treated the
   * 202 response body as the answer string, rendering the raw job object
   * ("Objects are not valid as a React child") and never awaited the real
   * result. We now keep the queued job id, show the thinking state until the
   * matching completion event arrives (with a 60s timeout so a failed worker
   * can never strand the UI), and only ever append string content.
   */
  const [isAwaitingResult, setIsAwaitingResult] = useState(false);
  const pendingJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleCompletion = (payload: AiCompletionEvent) => {
      if (!payload || payload.jobId !== pendingJobIdRef.current) return;
      pendingJobIdRef.current = null;
      setIsAwaitingResult(false);
      const answer =
        typeof payload.result === 'string' && payload.result.trim()
          ? payload.result
          : 'Sorry, I could not generate an answer this time. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    };

    socket.on('ai.completion.finished', handleCompletion);
    return () => {
      socket.off('ai.completion.finished', handleCompletion);
    };
  }, [socket]);

  // Safety net: never leave the thinking indicator spinning if the worker fails.
  useEffect(() => {
    if (!isAwaitingResult) return;
    const timeout = setTimeout(() => {
      pendingJobIdRef.current = null;
      setIsAwaitingResult(false);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, this is taking longer than expected. Please try again.' },
      ]);
    }, 60_000);
    return () => clearTimeout(timeout);
  }, [isAwaitingResult]);

  if (!isOpen) return null;

  const isBusy = isPending || isAwaitingResult;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isBusy) return;

    const userMessage: Message = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');

    askAssistant(
      { query: userMessage.content, contextType: 'GLOBAL' },
      {
        onSuccess: (ticket) => {
          // Job accepted: hold the ticket id and wait for the completion event.
          pendingJobIdRef.current = ticket.jobId;
          setIsAwaitingResult(true);
        },
        onError: () => {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        }
      }
    );
  };

  return (
    <div
      role="dialog"
      aria-label="AI Assistant"
      className="fixed bottom-4 right-4 z-50 flex h-[500px] max-h-[calc(100vh-2rem)] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-primary-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-xl bg-primary-600 p-4 text-white">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5" aria-hidden="true" />
          <span className="font-semibold">AI Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistant"
          className="rounded p-1 transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Chat Area — announced politely as replies arrive */}
      <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4 dark:bg-slate-900">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] p-3 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-tr-none'
                  : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-gray-200 rounded-tl-none shadow-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isBusy && (
          <div className="flex justify-start">
            <div
              role="status"
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-lg rounded-tl-none flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm shadow-sm"
            >
              <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="rounded-b-xl border-t border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="ai-assistant-query" className="sr-only">
            Ask the AI assistant
          </label>
          <input
            id="ai-assistant-query"
            type="text"
            placeholder="Ask me anything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <Button
            type="submit"
            className="gap-2"
            disabled={!query.trim() || isBusy}
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
            Send
          </Button>
        </form>
      </div>
    </div>
  );
};
