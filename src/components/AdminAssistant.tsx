'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from './Icon';
import { SUGGESTIONS, WRITE_VOCABULARY } from '@/lib/assistant';


interface Figure {
  label: string;
  value: string;
}

interface Answer {
  text: string;
  figures?: Figure[];
  link?: { href: string; label: string };
  suggestions?: string[];
  /** A change the assistant is offering to make. Nothing happens until confirmed. */
  action?: Record<string, unknown>;
  /** Show the words that make a sentence an instruction. */
  vocabulary?: boolean;
  /** Fixed answers to the question just asked. */
  options?: { value: string; label: string }[];
}

interface Turn {
  from: 'you' | 'bot';
  text: string;
  answer?: Answer;
  /** Set once a proposal has been confirmed or dismissed, so it cannot be run twice. */
  settled?: 'done' | 'cancelled';
}

interface Pending {
  kind: string;
  collected: Record<string, string>;
}

/**
 * Who and what the conversation is currently about.
 *
 * Without this, "approve it", "edit the amount", "add him as a donor" all
 * arrive as if nothing had been said before — and get asked which application
 * or which member, immediately after the assistant itself named one.
 */
interface Context {
  reference?: string | null;
  memberId?: string | null;
  memberName?: string | null;
}

interface ApiReply {
  error?: string;
  answer?: Answer;
  /** A guided instruction still gathering answers. */
  pending?: Pending | null;
  /** Carried into the next question so "it" and "him" mean something. */
  context?: Context;
  /** What was carried out, from the act endpoint. */
  done?: string;
  link?: { href: string; label: string };
}

/**
 * A failed request does not always carry JSON.
 *
 * A crash on the server returns an empty body or an HTML error page, and
 * res.json() then throws "Unexpected end of JSON input" — which says nothing
 * about what happened and reads as though the chat itself is broken. This
 * turns both into a sentence somebody can act on.
 */
async function readJson(res: Response): Promise<ApiReply> {
  const text = await res.text();
  if (!text) throw new Error(`The server did not answer (HTTP ${res.status}). Please try again.`);
  try {
    return JSON.parse(text) as ApiReply;
  } catch {
    throw new Error(`Something went wrong on the server (HTTP ${res.status}).`);
  }
}

const OPENING: Turn = {
  from: 'bot',
  text: '',
  answer: {
    text: "Ask me anything about the foundation — money in and out, what is left, a member by name, a fund, or an application by its reference. I can also change things: say it as an instruction and I will show you exactly what I am about to do before anything is saved.",
    suggestions: SUGGESTIONS.slice(0, 3),
    vocabulary: true,
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([OPENING]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  /* A guided instruction part-way through. Held here rather than on the server
     so nothing is half-written while somebody is still answering. */
  const [pending, setPending] = useState<Pending | null>(null);
  const [context, setContext] = useState<Context>({});
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
        body: JSON.stringify({
          question: q,
          ...(pending ? { pending } : {}),
          context,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setPending(json.pending ?? null);
      // Merge, so naming a member does not erase the application in hand.
      if (json.context) setContext((c) => ({ ...c, ...json.context }));
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

  /**
   * Carry out a proposal the administrator has just confirmed.
   *
   * The turn is settled first, so a second click cannot record the same
   * donation twice — the one mistake this whole flow exists to prevent.
   */
  async function confirm(index: number, action: Record<string, unknown>) {
    if (busy) return;
    setTurns((t) => t.map((turn, i) => (i === index ? { ...turn, settled: 'done' } : turn)));
    setPending(null);
    setBusy(true);

    try {
      const res = await fetch('/api/admin/assistant/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? 'That did not go through.');

      setTurns((t) => [
        ...t,
        { from: 'bot', text: '', answer: { text: json.done ?? 'Done.', link: json.link } },
      ]);
      // The screen behind is now out of date with what was just changed.
      router.refresh();
    } catch (e) {
      setTurns((t) => [
        ...t.map((turn, i) => (i === index ? { ...turn, settled: undefined } : turn)),
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

                    {/* A chat box gives no clue what it understands. Rather
                        than let anyone guess at phrasing until something
                        works, the words that make a sentence an instruction
                        are simply listed. */}
                    {turn.answer?.vocabulary && (
                      <div className="bot-vocab">
                        <p className="bv-head">To change something, start with one of these:</p>
                        {/*
                          The words only. There used to be a worked example
                          under each — "Aiman donated 5000", "Block Zaidi" —
                          and they were not examples: clicking one proposed
                          that exact change against that exact person. An
                          illustration should not be a loaded action.
                        */}
                        {WRITE_VOCABULARY.map((v) => (
                          <div className="bv-row" key={v.does}>
                            <div className="bv-does">{v.does}</div>
                            <div className="bv-words">{v.words}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Answers to the question just asked. Only on the last
                        turn — an older question's buttons would send the
                        answer into a conversation that has moved on. */}
                    {turn.answer?.options && i === turns.length - 1 && (
                      <div className="bot-chips">
                        {turn.answer.options.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => ask(o.label)}
                            disabled={busy}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* A change is never carried out by asking for it — only
                        by confirming it here. */}
                    {turn.answer?.action && (
                      <div className="bot-confirm">
                        {turn.settled ? (
                          <span className="bc-settled">
                            <Icon name={turn.settled === 'done' ? 'checkCircle' : 'x'} />
                            {turn.settled === 'done' ? 'Confirmed' : 'Cancelled'}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="bc-no"
                              disabled={busy}
                              onClick={() =>
                                setTurns((t) =>
                                  t.map((x, j) => (j === i ? { ...x, settled: 'cancelled' } : x))
                                )
                              }
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="bc-yes"
                              disabled={busy}
                              onClick={() => confirm(i, turn.answer!.action!)}
                            >
                              <Icon name="check" />
                              Confirm
                            </button>
                          </>
                        )}
                      </div>
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
