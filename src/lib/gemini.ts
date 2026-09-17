/**
 * Optional language-model wording for the admin assistant.
 *
 * The division of labour matters and is deliberate: this application looks up
 * every figure itself, in Postgres, and passes the model only the question and
 * the figures it already holds. The model reads the phrasing and writes the
 * sentence. It is never the source of a number, so a hallucinated balance is
 * not a failure mode that exists here — the worst it can do is word an answer
 * awkwardly, and if it is slow or down the deterministic sentence is used.
 *
 * Off unless GEMINI_API_KEY is set, because turning it on means the question
 * and the supporting figures — which can include a member's name — leave the
 * foundation's own infrastructure for Google's.
 */

/*
 * Pinned, not tracking an alias. gemini-2.0-flash was retired under us and
 * gemini-flash-latest was answering 503 while this was written, so a moving
 * target is the less reliable of the two. Override with GEMINI_MODEL when this
 * one is retired in turn; the log line below will say when that day comes.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Long enough for a slow call, short enough that nobody waits on it. */
const TIMEOUT_MS = 10_000;

export const geminiReady = () => Boolean(process.env.GEMINI_API_KEY);

const SYSTEM = [
  'You answer questions for administrators of the Mohammad Husnain Foundation,',
  'a welfare foundation in Pakistan that collects donations and transfers grants to members.',
  '',
  'You are given the administrator question and a JSON object of figures that the',
  'application has already read from its own database. Rules, in order of importance:',
  '',
  '1. Every number, name, date and status in your reply must come from the JSON.',
  '   Never estimate, never extrapolate, never carry a figure over from general knowledge.',
  '2. Arithmetic is allowed only when the JSON contains every input for it, and say what you did.',
  '3. If the JSON does not answer the question, say plainly that you do not hold that,',
  '   and name what you do hold. Do not apologise more than once and do not speculate.',
  '4. Amounts are Pakistani rupees unless labelled otherwise. Write them as "PKR 12,500".',
  '5. Refer to a member as "they" unless the JSON states their gender. A name is not',
  '   evidence of it, and these records belong to real people.',
  '6. Two or three sentences at most. Plain English, no headings, no bullet points,',
  '   no markdown. Address the administrator directly. Do not repeat the question back.',
].join('\n');

interface Part {
  text?: string;
}

/** One request, one place. Returns null on any problem at all. */
async function ask(system: string, user: string, json = false): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          // Low, not zero: the wording may vary, the figures cannot.
          temperature: 0.2,
          maxOutputTokens: 400,
          candidateCount: 1,
          /*
           * No reasoning budget. The thinking is already done — the figures
           * arrived settled and the job is to word one sentence about them.
           * Paying a model to deliberate over that cost four seconds a
           * question; without it the same answer comes back in one.
           */
          thinkingConfig: { thinkingBudget: 0 },
          // Routing must parse, so the model is told to emit JSON and nothing else.
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    if (!res.ok) {
      // Falling back silently is right for the admin, but leaves nothing to
      // debug a rejected key with. The body names the cause; it holds no secret.
      console.warn(`[assistant] Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }

    const reply = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    };

    const text = (reply.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    // A truncated sentence is worse than the deterministic one it replaces.
    if (!text || reply.candidates?.[0]?.finishReason === 'MAX_TOKENS') return null;

    return text.replace(/\*\*/g, '').replace(/\s+\n/g, '\n').trim();
  } catch (e) {
    console.warn(`[assistant] Gemini unreachable: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Word an answer from figures already established. Returns null on any
 * problem at all, which the caller reads as "use the deterministic sentence".
 */
export async function phrase(question: string, facts: unknown): Promise<string | null> {
  return ask(
    SYSTEM,
    `Question: ${question}\n\nFigures held by the application:\n${JSON.stringify(facts, null, 1)}`
  );
}

const explainSystem = (audience: 'admin' | 'member') =>
  [
    audience === 'admin'
      ? 'You answer questions from administrators of a welfare foundation about how their own'
      : 'You answer questions from members of a welfare foundation about how the portal they use',
    'works. You are given a description of that software. Rules:',
    '',
    '1. Answer only from the description. If it does not cover the question, say so plainly',
    '   and name the closest thing it does cover. Never describe a feature that is not there —',
    '   a confident answer about a button that does not exist is worse than no answer at all.',
    audience === 'admin'
      ? '2. Never state a figure, balance, name or date. You hold the rules, not the data. If they'
      : '2. Never state a figure, amount, reference or date. You hold the rules, not their record. If they',
    audience === 'admin'
      ? '   are asking for a number, tell them to ask for it directly, such as "what is left".'
      : '   are asking about their own application, tell them to ask for it directly, such as "my status".',
    '3. Two or three sentences. Plain English, no headings, no bullet points, no markdown.',
    audience === 'admin'
      ? '   Address the administrator directly.'
      : '   Address the member directly, warmly and simply. Many are applying for help with money',
    audience === 'admin' ? '' : '   and may be anxious; never be curt, and never promise a decision or a date.',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Answer a question about how the system works, from a written description.
 *
 * Kept apart from phrase() because the risk is different. There, the model is
 * handed figures and cannot invent one. Here it is describing software — and a
 * model asked about software will cheerfully describe a plausible version of
 * it — so it gets the real description and is told to refuse anything outside
 * it.
 */
export async function explain(
  question: string,
  guide: string,
  audience: 'admin' | 'member' = 'admin'
): Promise<string | null> {
  return ask(explainSystem(audience), `Question: ${question}\n\nThe software:\n${guide}`);
}

/* ------------------------------------------------------------------------ *
 * Understanding the question — which is a different job from answering it.  *
 * ------------------------------------------------------------------------ */

export interface Routed {
  /** One of the topics offered, when the question clearly asks for it. */
  topic?: string;
  /** A question to ask back, when it genuinely is not clear. */
  clarify?: string;
  /** Friendly noise: thanks, how are you, goodbye. */
  smalltalk?: string;
}

const ROUTE_SYSTEM = [
  'You read a question from an administrator of a welfare foundation and decide which',
  'of the listed topics it is asking about. You do not answer it.',
  '',
  'The people asking are not technical and will not use the right words. Read what they',
  'meant, not what they typed: "paisa kitna bacha" is the remaining balance, "who gave',
  'money" is the donors, "kitne log" is the member count. Spelling, grammar and language',
  'do not matter.',
  '',
  'Reply with JSON only, one of these shapes:',
  '  {"topic": "<exact id from the list>"}      when it clearly asks for one of them',
  '  {"smalltalk": "<a short friendly reply>"}  for thanks, greetings, how are you',
  '  {"clarify": "<one short question>"}        when you genuinely cannot tell which',
  '',
  'Prefer a topic over clarify — asking a question they have to answer costs them time.',
  'Only clarify when two topics are equally likely, or when the question names nothing.',
  'Never invent a topic id. Never answer the question yourself. Never state a figure.',
].join('\n');

/**
 * Pick which question is being asked, from a fixed list.
 *
 * The deterministic matcher handles the phrasings it knows and shrugs at the
 * rest, which is the wrong behaviour for people who will not know the right
 * words. This is the model doing the one thing it is genuinely better at than
 * a rule — reading intent out of loose language — while every figure still
 * comes from the database afterwards. The model chooses the question; it never
 * supplies the answer.
 */
export async function route(
  question: string,
  topics: { id: string; describes: string }[]
): Promise<Routed | null> {
  const list = topics.map((t) => `  ${t.id}: ${t.describes}`).join('\n');
  const raw = await ask(ROUTE_SYSTEM, `Question: ${question}\n\nTopics:\n${list}`, true);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Routed;
    // A topic the model made up is worse than no topic at all.
    if (parsed.topic && !topics.some((t) => t.id === parsed.topic)) return null;
    return parsed;
  } catch {
    return null;
  }
}
