import { useEffect, useRef, useState } from 'react';

/**
 * The full-screen chatbox.
 *
 * Message bubbles, streaming, input bar, auto-scroll, empty state.
 */

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly runId?: string;
  readonly streaming?: boolean;
}

export interface ChatboxProps {
  readonly messages: readonly ChatMessage[];
  readonly onSend: (content: string) => void;
  readonly streaming: boolean;
  readonly onShowReport?: (runId: string) => void;
}

export function Chatbox({ messages, onSend, streaming, onShowReport }: ChatboxProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledUp, setScrolledUp] = useState(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!scrolledUp) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, scrolledUp]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setScrolledUp(!atBottom);
  };

  const send = () => {
    const trimmed = input.trim();
    if (trimmed === '' || streaming) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 6 * 24) + 'px';
  };

  return (
    <div className="chatbox">
      <div className="chatbox__messages" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="chatbox__empty">
            <p className="chatbox__empty-title">Start a conversation.</p>
            <p className="chatbox__empty-hint">
              Describe a task and I'll run it in a sealed sandbox, then show you the blast-radius report.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`bubble bubble--${msg.role}`}>
              <div className="bubble__head">
                <span className="bubble__sender">
                  {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'BRZ' : 'Notice'}
                </span>
                <span className="bubble__time">{formatTime(msg.createdAt)}</span>
              </div>
              <div className="bubble__body">
                {msg.content}
                {msg.streaming && (
                  <span className="typing" aria-label="Typing">
                    <span /><span /><span />
                  </span>
                )}
              </div>
              {msg.runId !== undefined && onShowReport !== undefined && (
                <button className="bubble__report" type="button" onClick={() => onShowReport(msg.runId!)}>
                  Show report →
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {scrolledUp && (
        <button
          className="chatbox__scroll-bottom"
          type="button"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            setScrolledUp(false);
          }}
        >
          ↓ New messages
        </button>
      )}

      <div className="chatbox__input">
        <textarea
          ref={textareaRef}
          className="chatbox__textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Describe a task…"
          aria-label="Message"
          rows={1}
        />
        <button
          type="button"
          className="button button--primary chatbox__send"
          onClick={send}
          disabled={input.trim() === '' || streaming}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
