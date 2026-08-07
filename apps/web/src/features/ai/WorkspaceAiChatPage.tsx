import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../core/api/client';
import {
  ArrowPathIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-ai-chat, 2026-08-07): visual-only restyle — Tremor chrome
 * (Card/Title/Text/Button/TextInput) swapped for the shared design system.
 * The RAG mutation, message state, citation rendering, and every string
 * (incl. Ledger #9 honest 'Text match' / '% Match' rules and the surfaced
 * server error message) are preserved verbatim; there are no test locks on
 * this page.
 *
 * Disclosed visual-only unifications: the purple identity chrome moved
 * onto the single primary accent (header icon, assistant identity,
 * citation panel, match badges, submit button); message avatars are now
 * user=primary / assistant=neutral slate (chat convention — keeps the two
 * roles distinguishable without a second accent hue). lucide → heroicons.
 * A11y: message list is aria-live="polite", the thinking row is
 * role="status", and the composer input has an sr-only label.
 */

export interface RAGCitation {
  documentId?: string;
  snippet: string;
  // Ledger #9: null for lexical-fallback retrieval (previously the API
  // pinned distance 0.2 and this badge rendered a fabricated "80% Match").
  relevanceScore: number | null;
}

export interface RAGResponseData {
  answer: string;
  retrievalMethod?: 'vector' | 'text_fallback';
  citations: RAGCitation[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: RAGCitation[];
}

export const WorkspaceAiChatPage = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your TeamSynch AI RAG Assistant. Ask me anything about your uploaded documents, project specs, or client proposals.',
    },
  ]);

  const ragMutation = useMutation({
    mutationFn: async (queryText: string) => {
      const { data } = await apiClient.post<{ data: RAGResponseData }>('/ai/rag/ask', {
        query: queryText,
      });
      return data.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
        },
      ]);
    },
    onError: (error: any) => {
      // Ledger #9: surface the server's honest message (e.g. the 503
      // "semantic search unavailable" when the embedding provider is down
      // or unconfigured) instead of always claiming a transient hiccup.
      const apiMessage = error?.response?.data?.error?.message;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Sorry, I encountered an error retrieving workspace documents. Please try again.',
        },
      ]);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || ragMutation.isPending) return;

    const userText = query;
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setQuery('');

    ragMutation.mutate(userText);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      {/* Page header — cluster language */}
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Semantic AI Workspace Chat</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Retrieval-Augmented Generation (RAG) over pgvector document embeddings.
        </p>
      </div>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col p-0 overflow-hidden">
        <div aria-live="polite" className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6 dark:bg-slate-900">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
                  msg.role === 'user' ? 'bg-primary-600' : 'bg-slate-500 dark:bg-slate-600'
                }`}
              >
                {msg.role === 'user'
                  ? <UserIcon className="h-4 w-4" aria-hidden="true" />
                  : <SparklesIcon className="h-4 w-4" aria-hidden="true" />}
              </div>

              <div className="max-w-[80%] space-y-3">
                <div
                  className={`p-4 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-tr-none'
                      : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-tl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Cited Sources */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-primary-200/70 bg-primary-50/60 p-3 text-xs dark:border-primary-500/20 dark:bg-primary-500/10">
                    <span className="flex items-center gap-1 font-semibold text-primary-800 dark:text-primary-300">
                      <DocumentTextIcon className="h-3.5 w-3.5" aria-hidden="true" /> Cited Document Sources ({msg.citations.length}):
                    </span>
                    <div className="space-y-1.5">
                      {msg.citations.map((c, cIdx) => (
                        <div key={cIdx} className="flex items-start justify-between gap-2 rounded border border-primary-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                          <p className="text-gray-600 dark:text-gray-300 line-clamp-2">"{c.snippet}"</p>
                          {/* Ledger #9: a percentage is only shown for REAL
                              vector cosine distances; lexical-fallback
                              citations get an honest "Text match" label. */}
                          <span className="shrink-0 rounded bg-primary-100 px-1.5 py-0.5 font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                            {c.relevanceScore === null ? 'Text match' : `${c.relevanceScore}% Match`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {ragMutation.isPending && (
            <div className="flex gap-3 flex-row">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white dark:bg-slate-600">
                <SparklesIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl rounded-tl-none border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400"
              >
                <ArrowPathIcon className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" aria-hidden="true" />
                Searching pgvector embeddings and synthesizing answer...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <form onSubmit={handleSend} className="flex gap-2">
            <label htmlFor="workspace-ai-query" className="sr-only">
              Ask the workspace AI
            </label>
            <input
              id="workspace-ai-query"
              type="text"
              placeholder="Ask a question about your documents or projects..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <Button
              type="submit"
              className="gap-2"
              disabled={!query.trim() || ragMutation.isPending}
            >
              <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
              Ask AI
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};
