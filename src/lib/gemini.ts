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
  'You answer questions for administrators of the Subaidar Hasnain Foundation,',
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

/**
 * Word an answer from figures already established. Returns null on any
 * problem at all, which the caller reads as "use the deterministic sentence".
 */
export async function phrase(question: string, facts: unknown): Promise<string | null> {
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
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Question: ${question}\n\nFigures held by the application:\n${JSON.stringify(
                  facts,
                  null,
                  1
                )}`,
              },
            ],
          },
        ],
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
        },
      }),
    });

    if (!res.ok) {
      // Falling back silently is right for the admin, but leaves nothing to
      // debug a rejected key with. The body names the cause; it holds no secret.
      console.warn(`[assistant] Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    };

    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    // A truncated sentence is worse than the deterministic one it replaces.
    if (!text || json.candidates?.[0]?.finishReason === 'MAX_TOKENS') return null;

    return text.replace(/\*\*/g, '').replace(/\s+\n/g, '\n').trim();
  } catch (e) {
    console.warn(`[assistant] Gemini unreachable: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
