import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  BookOpen, 
  HelpCircle, 
  Flame, 
  Calculator, 
  Check, 
  Copy, 
  Trash2, 
  Key, 
  GraduationCap 
} from 'lucide-react';
import { askGeminiStudyAssistantStream, sanitizeAssistantText } from '../../services/geminiService';
import type { Note, ChatMessage } from '../../types';

interface GeminiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentNote: Note | null;
  currentPage: number;
  totalPages: number;
}

export const GeminiAssistantDrawer: React.FC<GeminiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  currentNote,
  currentPage,
  totalPages,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [cardQuery, setCardQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState<string>(() => {
    return localStorage.getItem('noteshub_gemini_key') || '';
  });
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const cardTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Support closing via Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = async (queryToSend?: string) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const aiMessageId = 'msg_ai_' + (Date.now() + 1);
    const initialAiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInputQuery('');
    setCardQuery('');
    if (cardTextareaRef.current) cardTextareaRef.current.style.height = 'auto';
    if (bottomTextareaRef.current) bottomTextareaRef.current.style.height = 'auto';
    setLoading(true);
    setStreamingId(aiMessageId);

    try {
      await askGeminiStudyAssistantStream({
        userQuery: text,
        history: messages,
        currentNote,
        currentPage,
        totalPages,
        customApiKey: customKey || undefined,
        onChunk: (accumulatedText) => {
          setLoading(false);
          setMessages((prev) => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].id === aiMessageId) {
              next[next.length - 1] = { ...next[next.length - 1], content: accumulatedText };
            } else {
              const idx = next.findIndex((m) => m.id === aiMessageId);
              if (idx !== -1) {
                next[idx] = { ...next[idx], content: accumulatedText };
              }
            }
            return next;
          });
        },
      });
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, content: `Failed to get answer: ${err.message || 'Unknown error'}` }
            : msg
        )
      );
    } finally {
      setLoading(false);
      setStreamingId(null);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    setMessages([]);
  };

  const saveCustomKey = (key: string) => {
    setCustomKey(key);
    localStorage.setItem('noteshub_gemini_key', key.trim());
    setShowKeyInput(false);
  };

  if (!isOpen) return null;

  return (
    <aside 
      aria-label="Study Assistant"
      className="fixed bottom-6 right-6 w-[420px] max-w-[90vw] h-[580px] max-h-[80vh] z-50 flex flex-col rounded-2xl bg-[#0b1120]/95 backdrop-blur-md border border-slate-700/80 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 select-none"
    >
      {/* Header: High-contrast bar with bright white Study Assistant title */}
      <div className="bg-[#0d1527] border-b border-slate-700/80 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 shrink-0">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span>Study Assistant</span>
              <span className="bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-[10px] px-2 py-0.5 rounded font-medium">
                Gemini 3.0 Flash
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 bouncy-btn focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            title="Set Gemini API Key"
            aria-label="Set Gemini API Key"
          >
            <Key className="w-3.5 h-3.5" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 bouncy-btn focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              title="Clear Chat History"
              aria-label="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 bouncy-btn focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            title="Close Assistant"
            aria-label="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* API Key Drawer Input */}
      {showKeyInput && (
        <div className="p-2.5 bg-slate-950/90 border-b border-slate-800 shrink-0 animate-nh-fade">
          <label htmlFor="custom-gemini-key" className="block text-[10px] font-medium text-slate-300 mb-1">
            Google Gemini API Key
          </label>
          <div className="flex gap-1.5">
            <input
              id="custom-gemini-key"
              type="password"
              placeholder="AIzaSy..."
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => saveCustomKey(customKey)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Active Document Context Pill */}
      {currentNote && (
        <div className="px-3.5 py-1.5 bg-indigo-950/40 border-b border-indigo-900/40 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="text-slate-300 truncate">
              {currentNote.subject} • {currentNote.title}
            </span>
          </div>
          <span className="text-[10px] font-mono text-indigo-300 shrink-0 ml-2">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="py-4 sm:py-6 text-center animate-nh-fade">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2.5">
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1">
                Ask anything about this document
              </h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-5 leading-relaxed">
                Explain theoretical concepts, break down code and algorithms, clarify formulas, or generate custom exam practice questions.
              </p>

              {/* Quick Action Suggestion Chips */}
              <div className="grid grid-cols-1 gap-2 text-left max-w-sm mx-auto">
                <button
                  onClick={() =>
                    handleSend('Summarize all the key formulas and equations from this chapter in clean notation.')
                  }
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs text-left transition-all hover:border-indigo-500/50 btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Summarize key formulas and constants</span>
                </button>

                <button
                  onClick={() =>
                    handleSend(
                      `Explain the core scientific concepts and derivations shown around page ${currentPage} in intuitive terms.`
                    )
                  }
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs text-left transition-all hover:border-indigo-500/50 btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <HelpCircle className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Explain current page concepts step-by-step</span>
                </button>

                <button
                  onClick={() =>
                    handleSend(
                      'Quiz me with 3 challenging practice questions based on this note, and give detailed solutions after each.'
                    )
                  }
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs text-left transition-all hover:border-indigo-500/50 btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Generate a 3-question revision quiz</span>
                </button>

                {currentNote?.isLabRecord && (
                  <button
                    onClick={() =>
                      handleSend(
                        'Explain the lab apparatus, experimental methodology, observation calculations, and typical viva questions.'
                      )
                    }
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs text-left transition-all hover:border-indigo-500/50 btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Lab procedure, calculations & viva questions</span>
                  </button>
                )}
              </div>

              {/* Custom Question Input Area Directly Beneath Chips (Task 1) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (cardQuery.trim() && !loading) {
                    handleSend(cardQuery.trim());
                  }
                }}
                className="mt-4 w-full max-w-full overflow-hidden p-3 sm:p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-left min-w-0"
              >
                <div className="flex items-center justify-between mb-2 min-w-0">
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    Type custom question:
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-indigo-400 font-medium shrink-0 whitespace-nowrap">
                    Enter to send • Shift+Enter newline
                  </span>
                </div>
                <div className="w-full max-w-full flex items-end gap-2 min-w-0">
                  <textarea
                    ref={cardTextareaRef}
                    rows={1}
                    value={cardQuery}
                    onChange={(e) => {
                      setCardQuery(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (cardQuery.trim() && !loading) {
                          handleSend(cardQuery.trim());
                        }
                      }
                    }}
                    placeholder="Ask about theory, derivations, or code..."
                    disabled={loading}
                    aria-label="Custom question input"
                    className="flex-1 min-w-0 w-full max-w-full box-border resize-none break-words whitespace-pre-wrap max-h-32 overflow-y-auto placeholder:break-words px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner leading-relaxed"
                  />
                  <button
                    type="submit"
                    disabled={!cardQuery.trim() || loading}
                    aria-label="Send custom question"
                    className="h-10 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 btn-spring shrink-0 whitespace-nowrap focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    title="Send question"
                  >
                    {loading ? (
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-1" />
                        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-2" />
                        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-3" />
                      </div>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col animate-nh-message will-change-transform ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] overflow-x-auto ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/20'
                      : 'bg-slate-800/90 border border-slate-700 text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  {/* Sanitized Clean Text Content with anywhere overflow break and internal scroll for code/tables */}
                  <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full font-sans selection:bg-indigo-500/30 overflow-x-auto">
                    {msg.content ? (
                      <>
                        {sanitizeAssistantText(msg.content, msg.id === streamingId)}
                        {msg.id === streamingId && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse align-middle" />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1" aria-hidden="true">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-1" />
                        <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-2" />
                        <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-3" />
                        <span className="text-xs text-slate-400 ml-1.5">Thinking...</span>
                      </div>
                    )}
                  </div>

                  {/* Assistant Footer with Copy */}
                  {msg.role === 'assistant' && msg.content && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
                      <span className="font-mono text-[10px] text-slate-400">Gemini 3.8 Flash</span>
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1 hover:text-white btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none p-1 rounded"
                        title="Copy response"
                        aria-label="Copy assistant answer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Staggered Three-Dot Typing Indicator */}
          {loading && messages.length === 0 && (
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs w-fit animate-nh-message will-change-transform">
              <div className="flex items-center gap-1.5 px-1 py-0.5" aria-hidden="true">
                <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-1" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-2" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot-3" />
              </div>
              <span className="text-slate-300 font-medium">Gemini is preparing your answer...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pinned Bottom Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-[#080d1a] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="w-full max-w-full min-w-0 flex items-end gap-2"
          >
            <textarea
              ref={bottomTextareaRef}
              rows={1}
              value={inputQuery}
              onChange={(e) => {
                setInputQuery(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputQuery.trim() && !loading) {
                    handleSend();
                  }
                }
              }}
              placeholder="Ask about equations, proofs, or concepts..."
              disabled={loading}
              aria-label="Ask Gemini Study Assistant"
              className="flex-1 min-w-0 w-full max-w-full box-border resize-none break-words whitespace-pre-wrap max-h-28 overflow-y-auto placeholder:break-words px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all leading-relaxed"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || loading}
              aria-label="Send message to assistant"
              className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white shadow-md shadow-indigo-600/30 btn-spring shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              title="Send query"
            >
              {loading ? (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-1" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot-3" />
                </div>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold hidden sm:inline">Send</span>
                </>
              )}
            </button>
          </form>
        </div>
      </aside>
  );
};

