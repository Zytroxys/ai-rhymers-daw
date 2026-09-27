import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearApiKey, hasApiKey, setApiKey, suggestInStyle } from '../src/lexis/personalAssist';

/** Minimal in-memory Storage -- same reasoning as tests/lyricHistory.test.ts:
 * vitest's plain 'node' environment has no real `localStorage` global. */
function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('API key storage', () => {
  it('round-trips a saved key', () => {
    const storage = createFakeStorage();
    expect(hasApiKey(storage)).toBe(false);
    setApiKey('sk-test-123', storage);
    expect(hasApiKey(storage)).toBe(true);
    clearApiKey(storage);
    expect(hasApiKey(storage)).toBe(false);
  });

  it('ignores a blank key', () => {
    const storage = createFakeStorage();
    setApiKey('   ', storage);
    expect(hasApiKey(storage)).toBe(false);
  });
});

describe('suggestInStyle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a no-key result without calling fetch when no key is stored', async () => {
    const storage = createFakeStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await suggestInStyle('happy', [], storage);
    expect(result).toEqual({ status: 'no-key', words: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the key and the direct-browser-access header, and parses the reply into words', async () => {
    const storage = createFakeStorage();
    setApiKey('sk-test-abc', storage);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'gleaming\nbeaming\nteeming' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await suggestInStyle('dreaming', ['an old verse of mine'], storage);

    expect(result).toEqual({ status: 'ok', words: ['gleaming', 'beaming', 'teeming'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-test-abc');
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toBe('dreaming');
    expect(body.system).toContain('an old verse of mine');
  });

  it('bounds the history context to a fixed character budget', async () => {
    const storage = createFakeStorage();
    setApiKey('sk-test-abc', storage);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'x' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const hugeSample = 'a'.repeat(10_000);
    await suggestInStyle('query', [hugeSample], storage);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.system.length).toBeLessThan(hugeSample.length);
  });

  it('resolves to an error status when the request fails', async () => {
    const storage = createFakeStorage();
    setApiKey('sk-test-abc', storage);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await suggestInStyle('query', [], storage);
    expect(result).toEqual({ status: 'error', words: [] });
  });

  it('resolves to an error status on a non-2xx response', async () => {
    const storage = createFakeStorage();
    setApiKey('sk-test-abc', storage);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await suggestInStyle('query', [], storage);
    expect(result).toEqual({ status: 'error', words: [] });
  });

  it('returns an ok, empty result for blank queries without calling fetch', async () => {
    const storage = createFakeStorage();
    setApiKey('sk-test-abc', storage);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await suggestInStyle('   ', [], storage);
    expect(result).toEqual({ status: 'ok', words: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
