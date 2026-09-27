import { describe, expect, it } from 'vitest';
import { clearHistory, getHistory, recordSnapshot } from '../src/state/lyricHistory';

/** Minimal in-memory Storage so this runs under vitest's plain 'node'
 * environment, which has no real `localStorage` global to fall back on. */
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

describe('lyricHistory', () => {
  it('records and retrieves a snapshot', () => {
    const storage = createFakeStorage();
    recordSnapshot('first verse here', storage);
    const history = getHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].text).toBe('first verse here');
  });

  it('ignores blank text', () => {
    const storage = createFakeStorage();
    recordSnapshot('   ', storage);
    expect(getHistory(storage)).toHaveLength(0);
  });

  it('treats a small edit as a continuation of the last snapshot, not a new one', () => {
    const storage = createFakeStorage();
    recordSnapshot('pen on the paper', storage);
    recordSnapshot('pen on the paper writing', storage);
    expect(getHistory(storage)).toHaveLength(1);
  });

  it('records a new snapshot once the text has changed substantially', () => {
    const storage = createFakeStorage();
    recordSnapshot('pen on the paper', storage);
    recordSnapshot('a completely different verse about something else entirely', storage);
    expect(getHistory(storage)).toHaveLength(2);
  });

  it('caps the log at the most recent 50 snapshots', () => {
    const storage = createFakeStorage();
    for (let i = 0; i < 55; i += 1) {
      recordSnapshot(`${i}-unique-marker-followed-by-fixed-padding-to-keep-each-entry-long`, storage);
    }
    const history = getHistory(storage);
    expect(history).toHaveLength(50);
    expect(history[0].text.startsWith('5-')).toBe(true);
    expect(history[history.length - 1].text.startsWith('54-')).toBe(true);
  });

  it('clears all history', () => {
    const storage = createFakeStorage();
    recordSnapshot('something to clear', storage);
    clearHistory(storage);
    expect(getHistory(storage)).toHaveLength(0);
  });

  it('returns an empty array when no storage is available', () => {
    expect(getHistory(null)).toEqual([]);
  });
});
