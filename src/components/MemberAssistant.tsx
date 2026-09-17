'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from './Icon';
import { useToast } from './Toast';
import { createClient } from '@/lib/supabase/client';
import { bytes } from '@/lib/format';
import { MEMBER_SUGGESTIONS } from '@/lib/member-assistant';
import type { Profile } from '@/lib/types';

const MAX_FILES = 8;
const MAX_BYTES = 10 * 1024 * 1024;

interface Figure {
  label: string;
  value: string;
}

interface MemberAction {
  kind: 'apply' | 'attach';
  fundId?: string;
  fundName?: string;
  amount?: number;
  purpose?: string | null;
  requestId?: string;
  reference?: string;
  fileCount?: number;
}

interface Answer {
  text: string;
  figures?: Figure[];
  link?: { href: string; label: string };
  suggestions?: string[];
  options?: { value: string; label: string }[];
  wantsFiles?: boolean;
  action?: MemberAction;
}

interface Turn {
  from: 'you' | 'bot';
  text: string;
  answer?: Answer;
  settled?: 'done' | 'cancelled';
}

interface Pending {
  kind: string;
  collected: Record<string, string>;
}

interface ApiReply {
  error?: string;
  answer?: Answer;
  pending?: Pending | null;
}

/**
 * A failed request does not always carry JSON. A crash returns an empty body
 * or an HTML page, and res.json() then throws "Unexpected end of JSON input",
 * which reads as though the chat itself is broken rather than the server.
 */
async function readJson(res: Response): Promise<ApiReply> {
  const text = await res.text();
  if (!text) throw new Error(`No answer came back (${res.status}). Please try again.`);
  try {
    return JSON.parse(text) as ApiReply;
  } catch {
    throw new Error(`Something went wrong at our end (${res.status}). Please try again.`);
  }
}

/**
 * The foundation's assistant, for members.
 *
 * The admin assistant answers questions about the foundation's money. This one
 * belongs to somebody who may never have used an app like this before, so it
 * does more than answer: it walks through an application one question at a
 * time and takes the documents in the conversation itself, because a member
 * who can photograph a bill and send it in a chat will do that long before
 * they will find a file picker on a form.
 *
 * Nothing is submitted by asking for it. Every change is shown in full and
 * waits for a deliberate Confirm.
 */
export default function MemberAssistant({ profile }: { profile: Profile }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  /* Files wait in the browser until the member confirms. Nothing is uploaded
     while they are still deciding. */
  const [files, setFiles] = useState<File[]>([]);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const first = (profile.full_name ?? '').split(' ')[0] || 'there';

  useEffect(() => {
    if (!open || turns.length) return;
    setTurns([
      {
        from: 'bot',
        text: '',
        answer: {
          text: `Hello ${first}. I can explain how anything here works, tell you where your applications have got to, or take you through a new one — I will ask one question at a time, and you can send me a photograph of a bill right here in the chat.`,
          suggestions: MEMBER_SUGGESTIONS.slice(0, 4),
        },
      },
    ]);
  }, [open, turns.length, first]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns, busy]);

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

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_FILES - files.length;
    const good = Array.from(list).filter((f) => {
      if (f.size > MAX_BYTES) {
        toast(`${f.name} is larger than 10 MB.`, 'bad');
        return false;
      }
      return true;
    });
    if (good.length > room) toast(`You can attach up to ${MAX_FILES} files.`, 'bad');
    setFiles((prev) => [...prev, ...good.slice(0, room)]);
  }

  async function ask(question: string) {
    const q = question.trim();
    // An empty box is still a message when files are waiting — the member has
    // answered the question by choosing them.
    if ((!q && !files.length) || busy) return;

    setTurns((t) => [
      ...t,
      {
        from: 'you',
        text: q || `${files.length} file${files.length === 1 ? '' : 's'} attached`,
      },
    ]);
    setDraft('');
    setBusy(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q || 'here they are',
          ...(pending ? { pending } : {}),
          fileCount: files.length,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');

      setPending(json.pending ?? null);
      setTurns((t) => [...t, { from: 'bot', text: '', answer: json.answer }]);
    } catch (e) {
      setTurns((t) => [...t, { from: 'bot', text: '', answer: { text: (e as Error).message } }]);
    } finally {
      setBusy(false);
    }
  }

  /** Put the chosen files into storage and file them against an application. */
  async function fileDocuments(requestId: string, kind: string) {
    if (!files.length) return 0;

    const supabase = createClient();
    const uploaded: { path: string; file_name: string; mime_type: string; size_bytes: number }[] =
      [];

    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${profile.id}/requests/${requestId}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from('documents')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        toast(`${file.name} could not be sent.`, 'bad');
        continue;
      }
      uploaded.push({
        path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
    }

    if (!uploaded.length) return 0;

    await fetch(`/api/requests/${requestId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: uploaded, kind }),
    });
    return uploaded.length;
  }

  /**
   * Carry out what the member has just confirmed.
   *
   * The turn is settled before the work starts, so a second press cannot
   * submit the same application twice — which is the one mistake this whole
   * confirm step exists to prevent.
   */
  async function confirm(index: number, action: MemberAction) {
    if (busy) return;
    setTurns((t) => t.map((turn, i) => (i === index ? { ...turn, settled: 'done' } : turn)));
    setPending(null);
    setBusy(true);

    try {
      if (action.kind === 'apply') {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fund_type_id: action.fundId,
            amount_requested: action.amount,
            purpose: action.purpose ?? null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'The application could not be submitted.');

        const id: string = json.request.id;
        const reference: string = json.request.reference;
        const sent = await fileDocuments(id, action.fundId === 'electricity' ? 'bill' : 'report');
        setFiles([]);

        setTurns((t) => [
          ...t,
          {
            from: 'bot',
            text: '',
            answer: {
              text: `Done. Your application is in, and its reference is ${reference}${
                sent ? `, with ${sent} file${sent === 1 ? '' : 's'} attached` : ''
              }. You will be emailed when there is a decision, and you can ask me where it has got to at any time.`,
              figures: [{ label: 'Reference', value: reference }],
              link: { href: `/requests/${id}`, label: 'Open my application' },
            },
          },
        ]);
      } else {
        const sent = await fileDocuments(action.requestId!, 'report');
        setFiles([]);

        if (!sent) throw new Error('None of the files could be sent. Please try again.');

        setTurns((t) => [
          ...t,
          {
            from: 'bot',
            text: '',
            answer: {
              text: `Added. ${sent} file${sent === 1 ? '' : 's'} ${sent === 1 ? 'is' : 'are'} now filed against ${action.reference}, and the committee will see ${sent === 1 ? 'it' : 'them'} with the rest of the application.`,
              link: { href: `/requests/${action.requestId}`, label: 'Open my application' },
            },
          },
        ]);
      }

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
        className="mbot-fab"
        onClick={() => setOpen(true)}
        aria-label="Ask the assistant"
        type="button"
      >
        <Icon name="chat" />
      </button>

      <div
        className={`backdrop ${open ? 'open' : ''}`}
        onClick={busy ? undefined : () => setOpen(false)}
      />

      <div className={`mbot ${open ? 'open' : ''}`} role="dialog" aria-label="Assistant">
        <div className="mbot-head">
          <span className="mh-ico">
            <Icon name="chat" />
          </span>
          <div className="mh-text">
            <strong>Assistant</strong>
            <span>Ask me anything about your applications</span>
          </div>
          <button
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
            type="button"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="mbot-log">
          {turns.map((turn, i) => (
            <div className={`mbot-turn ${turn.from}`} key={i}>
              {turn.from === 'you' ? (
                <p className="mbot-bubble">{turn.text}</p>
              ) : (
                <div className="mbot-bubble">
                  <p>{turn.answer?.text}</p>

                  {turn.answer?.figures && turn.answer.figures.length > 0 && (
                    <div className="mbot-figures">
                      {turn.answer.figures.map((f, j) => (
                        <span className="mbot-fig" key={j}>
                          <span className="mf-k">{f.label}</span>
                          <strong>{f.value}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {turn.answer?.link && (
                    <Link
                      className="mbot-link"
                      href={turn.answer.link.href}
                      onClick={() => setOpen(false)}
                    >
                      {turn.answer.link.label}
                      <Icon name="chevronRight" />
                    </Link>
                  )}

                  {/* Answers to the question just asked. Only on the last turn:
                      an older question's buttons would send an answer into a
                      conversation that has moved on. */}
                  {turn.answer?.options && i === turns.length - 1 && !turn.settled && (
                    <div className="mbot-chips">
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

                  {turn.answer?.action && (
                    <div className="mbot-confirm">
                      {turn.settled ? (
                        <span className="mc-settled">
                          <Icon name={turn.settled === 'done' ? 'checkCircle' : 'x'} />
                          {turn.settled === 'done' ? 'Confirmed' : 'Cancelled'}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="mc-no"
                            disabled={busy}
                            onClick={() =>
                              setTurns((t) =>
                                t.map((x, j) => (j === i ? { ...x, settled: 'cancelled' } : x))
                              )
                            }
                          >
                            Not yet
                          </button>
                          <button
                            type="button"
                            className="mc-yes"
                            disabled={busy}
                            onClick={() => confirm(i, turn.answer!.action!)}
                          >
                            <Icon name="check" />
                            {turn.answer.action.kind === 'apply' ? 'Submit' : 'Attach'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {turn.answer?.suggestions && i === turns.length - 1 && (
                    <div className="mbot-chips">
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
            <div className="mbot-turn bot">
              <p className="mbot-bubble thinking">
                <span className="spin dark" /> One moment…
              </p>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Chosen files, before they go anywhere. Removable, because a wrong
            photograph attached to a money application is worth being able to
            take back. */}
        {files.length > 0 && (
          <div className="mbot-files">
            {files.map((f, i) => (
              <span className="mbot-file" key={`${f.name}-${i}`}>
                <Icon name={f.type.startsWith('image/') ? 'image' : 'file'} />
                <span className="mf-name">{f.name}</span>
                <span className="mf-size">{bytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  disabled={busy}
                >
                  <Icon name="x" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          className="mbot-ask"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={`mbot-clip ${lastWantsFiles(turns) ? 'wanted' : ''}`}
            onClick={() => fileRef.current?.click()}
            disabled={busy || files.length >= MAX_FILES}
            aria-label="Attach a photo or document"
          >
            <Icon name="camera" />
          </button>
          <input
            ref={inputRef}
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={files.length ? 'Send them…' : 'Ask me anything…'}
            aria-label="Your message"
            disabled={busy}
          />
          <button
            className="mbot-send"
            type="submit"
            disabled={busy || (!draft.trim() && !files.length)}
            aria-label="Send"
          >
            <Icon name="send" />
          </button>
        </form>
      </div>
    </>
  );
}

/** Is the assistant waiting for documents right now? The clip says so if it is. */
function lastWantsFiles(turns: Turn[]): boolean {
  const last = turns[turns.length - 1];
  return Boolean(last?.from === 'bot' && last.answer?.wantsFiles);
}
