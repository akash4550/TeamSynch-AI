import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../core/api/client';
import { Card, Title, Text, Button, TextInput } from '@tremor/react';
import { Sparkles, Send, FileText, Bot, User, Loader2 } from 'lucide-react';

export interface RAGCitation {
  documentId?: string;
  snippet: string;
  relevanceScore: number;
}

export interface RAGResponseData {
  answer: string;
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
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error retrieving workspace documents. Please try again.',
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
      <div className="flex justify-between items-center shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <Title className="text-2xl dark:text-white">Semantic AI Workspace Chat</Title>
          </div>
          <Text className="dark:text-gray-400 mt-1">
            Retrieval-Augmented Generation (RAG) over pgvector document embeddings.
          </Text>
        </div>
      </div>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col p-0 overflow-hidden border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 dark:bg-slate-900">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'
                }`}
              >
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className="space-y-3 max-w-[80%]">
                <div
                  className={`p-4 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-tl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Cited Sources */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/40 rounded-lg p-3 text-xs space-y-2">
                    <span className="font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                      <FileText size={14} /> Cited Document Sources ({msg.citations.length}):
                    </span>
                    <div className="space-y-1.5">
                      {msg.citations.map((c, cIdx) => (
                        <div key={cIdx} className="bg-white dark:bg-slate-800 p-2 rounded border border-purple-100 dark:border-slate-700 flex justify-between items-start gap-2">
                          <p className="text-gray-600 dark:text-gray-300 line-clamp-2">"{c.snippet}"</p>
                          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-semibold rounded shrink-0">
                            {c.relevanceScore}% Match
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
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-xl rounded-tl-none flex items-center gap-2 text-sm text-gray-500 shadow-sm">
                <Loader2 size={16} className="animate-spin text-purple-600" />
                Searching pgvector embeddings and synthesizing answer...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
          <form onSubmit={handleSend} className="flex gap-2">
            <TextInput
              placeholder="Ask a question about your documents or projects..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              icon={Send}
              color="purple"
              disabled={!query.trim() || ragMutation.isPending}
            >
              Ask AI
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};
