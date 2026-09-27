/**
 * Bring-your-own-key call to Anthropic's Messages API for the word graph's
 * "Your style" branch. This is the app's only paid, keyed network call --
 * everything else (Datamuse, rhyme/meter/consonance) is free/keyless or fully
 * offline. The key lives only in the user's own browser and is sent directly
 * from there to Anthropic; this app has no backend to relay through, so it
 * relies on Anthropic's `anthropic-dangerous-direct-browser-access` header,
 * documented specifically for client-only apps like this one.
 */

const API_KEY_STORAGE_KEY = 'ai-rhymers-daw:anthropic-key';
const MODEL = 'claude-haiku-4-5-20251001';
const HISTORY_CHAR_BUDGET = 4000;
const MAX_SUGGESTIONS = 8;

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/** Every storage-touching export takes an optional `Storage` so tests can
 * inject a fake one instead of relying on a real (or, in a plain Node test
 * environment, nonexistent) `localStorage` global. */
export function hasApiKey(storage: Storage | null = getStorage()): boolean {
  return Boolean(storage?.getItem(API_KEY_STORAGE_KEY));
}

export function setApiKey(key: string, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  const trimmed = key.trim();
  if (trimmed) storage.setItem(API_KEY_STORAGE_KEY, trimmed);
}

export function clearApiKey(storage: Storage | null = getStorage()): void {
  storage?.removeItem(API_KEY_STORAGE_KEY);
}

/** Most recent history samples, joined up to a fixed character budget so
 * requests stay cheap and fast -- no relevance ranking beyond recency. */
function buildContext(historySamples: string[]): string {
  let budget = HISTORY_CHAR_BUDGET;
  const picked: string[] = [];
  for (let i = historySamples.length - 1; i >= 0 && budget > 0; i -= 1) {
    const sample = historySamples[i].slice(0, budget);
    picked.unshift(sample);
    budget -= sample.length;
  }
  return picked.join('\n---\n');
}

export type PersonalAssistStatus = 'ok' | 'no-key' | 'error';

export interface PersonalAssistResult {
  status: PersonalAssistStatus;
  words: string[];
}

/** Suggests a handful of words/short phrases that continue the wordplay,
 * rhyme, or theme of `query`, biased toward how this specific writer's own
 * past lyrics (`historySamples`) tend to read. Never throws -- a missing key
 * or a failed call resolves to a typed result so callers don't need their own
 * try/catch around this. */
export async function suggestInStyle(
  query: string,
  historySamples: string[],
  storage: Storage | null = getStorage(),
): Promise<PersonalAssistResult> {
  const apiKey = storage?.getItem(API_KEY_STORAGE_KEY) ?? null;
  if (!apiKey) return { status: 'no-key', words: [] };
  if (!query.trim()) return { status: 'ok', words: [] };

  const context = buildContext(historySamples);
  const system = context
    ? `You help a songwriter brainstorm. Here are snippets of their own past lyrics, showing how they tend to phrase things:\n\n${context}\n\nGiven a word or phrase, suggest ${MAX_SUGGESTIONS} short words or phrases that continue its wordplay, rhyme, or theme the way this specific writer tends to write. Reply with ONLY the suggestions, one per line, no numbering or extra commentary.`
    : `You help a songwriter brainstorm. Given a word or phrase, suggest ${MAX_SUGGESTIONS} short words or phrases that continue its wordplay, rhyme, or theme. Reply with ONLY the suggestions, one per line, no numbering or extra commentary.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: query }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic responded ${response.status}`);
    const data: { content?: { type: string; text?: string }[] } = await response.json();
    const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
    const words = text
      .split(/\r?\n|,/)
      .map((line) => line.replace(/^[\s\-*\d.)]+/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_SUGGESTIONS);
    return { status: 'ok', words };
  } catch {
    return { status: 'error', words: [] };
  }
}
