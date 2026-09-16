'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { SUGGESTIONS } from '@/lib/assistant';

interface Figure {
  label: string;
  value: string;
}

interface Answer {
  text: string;
  figures?: Figure[];
  link?: { href: string; label: string };
  suggestions?: string[];
}

interface Turn {
  from: 'you' | 'bot';
  text: string;
  answer?: Answer;
}

const OPENING: Turn = {
  from: 'bot',
  text: '',
  answer: {
    text: "Ask me anything about the foundation — money in and out, what is left, a member by name, a fund, or an application by its reference. Ask it however you like; I read the figures live from the database.",
    suggestions: SUGGESTIONS.slice(0, 4),
  },
};

/**
 * A question box over the foundation's own numbers.
 *
 * The question is read here, the figures are looked up in Postgres, and only
 * then — if a key is configured — is a language model given those figures to
 * word the reply. It never supplies a number, so an answer can be clumsily
 * phrased but not wrong. When nothing matches, it says so and offers what it
 * can answer, which is the one behaviour a guessing model cannot give you.
 */
export default function AdminAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([OPENING]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setTurns((t) => [...t, { from: 'you', text: q }]);
    setDraft('');
    setBusy(true);

    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setTurns((t) => [...t, { from: 'bot', text: '', answer: json.answer }]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { from: 'bot', text: '', answer: { text: (e as Error).message } },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={`bot-fab ${open ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close the assistant' : 'Ask about the figures'}
        aria-expanded={open}
        type="button"
      >
        <Icon name={open ? 'x' : 'chat'} />
      </button>

      {open && (
        <div className="botbox" role="dialog" aria-label="Ask about the figures">
          <div className="bot-head">
            <div>
              <strong>Ask about the figures</strong>
              <span>Read live from your own records</span>
            </div>
            <button
              className="admin-btn ghost"
              onClick={() => setOpen(false)}
              aria-label="Close"
              type="button"
            >
              <Icon name="x" />
            </button>
          </div>

          <div className="bot-log">
            {turns.map((turn, i) => (
              <div className={`bot-turn ${turn.from}`} key={i}>
                {turn.from === 'you' ? (
                  <p className="bot-bubble">{turn.text}</p>
                ) : (
                  <div className="bot-bubble">
                    <p>{turn.answer?.text}</p>

                    {turn.answer?.figures && turn.answer.figures.length > 0 && (
                      <div className="bot-figures">
                        {turn.answer.figures.map((f, j) => (
                          <span className="bot-fig" key={j}>
                            <span className="bf-k">{f.label}</span>
                            <strong className="num">{f.value}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {turn.answer?.link && (
                      <Link
                        className="bot-link"
                        href={turn.answer.link.href}
                        onClick={() => setOpen(false)}
                      >
                        {turn.answer.link.label}
                        <Icon name="chevronRight" />
                      </Link>
                    )}

                    {turn.answer?.suggestions && (
                      <div className="bot-chips">
                        {turn.answer.suggestions.map((s) => (
                          <button key={s} type="button" onClick={() => ask(s)} disabled={busy}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="bot-turn bot">
                <p className="bot-bubble bot-thinking">
                  <span className="spin dark" /> Looking it up…
                </p>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <form
            className="bot-ask"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <input
              ref={inputRef}
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything — a name, a fund, a month…"
              aria-label="Your question"
              disabled={busy}
            />
            <button className="admin-btn" type="submit" disabled={busy || !draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
