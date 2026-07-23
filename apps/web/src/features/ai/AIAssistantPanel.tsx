import { useState, type FC, type FormEvent } from 'react';
import { Card, TextInput, Button } from '@tremor/react';
import { Bot, Send, X, Loader2 } from 'lucide-react';
import { useAssistant } from './hooks/useAI';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AIAssistantPanel: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your TeamSynch AI Assistant. How can I help you today?' }
  ]);

  const { mutate: askAssistant, isPending } = useAssistant();

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isPending) return;

    const userMessage: Message = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');

    askAssistant(
      { query: userMessage.content, contextType: 'GLOBAL' },
      {
        onSuccess: (data) => {
          setMessages(prev => [...prev, { role: 'assistant', content: data }]);
        },
        onError: () => {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        }
      }
    );
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 shadow-2xl z-50 flex flex-col h-[500px]">
      <Card className="flex flex-col h-full p-0 overflow-hidden border border-blue-200 dark:border-blue-900 rounded-xl">
        
        {/* Header */}
        <div className="bg-blue-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Bot size={20} />
            <span className="font-semibold">AI Assistant</span>
          </div>
          <button onClick={onClose} className="hover:bg-blue-700 p-1 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] p-3 rounded-lg text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none shadow-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isPending && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg rounded-tl-none flex items-center gap-2 text-gray-500 text-sm shadow-sm">
                <Loader2 size={14} className="animate-spin" /> Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <TextInput 
              placeholder="Ask me anything..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button 
              type="submit" 
              icon={Send} 
              disabled={!query.trim() || isPending}
            >
              Send
            </Button>
          </form>
        </div>

      </Card>
    </div>
  );
};
