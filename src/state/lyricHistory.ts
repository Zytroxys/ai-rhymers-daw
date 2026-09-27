/**
 * Persistent log of past lyric snapshots, kept deliberately separate from
 * `ProjectState` (see store.ts) and its own localStorage key -- this is a
 * corpus for the word graph's "Your style" AI branch to draw on, not part of
 * the one project that gets overwritten/exported/shared. The app has no
 * explicit "start/end session" action (it's a live-typing editor, not a
 * document with save points), so a "session" here just means a snapshot taken
 * after the lyrics settle for a while (see `useLyricHistoryCapture` in App.tsx).
 */

export interface LyricSnapshot {
  id: string;
  timestamp: number;
  text: string;
}

const STORAGE_KEY = 'ai-rhymers-daw:lyric-history:v1';
const MAX_SNAPSHOTS = 50;
/** Below this size difference, a new snapshot is treated as a continuation of
 * the last one (still-typing) rather than a new session worth recording. */
const MIN_DIFF_CHARS = 20;

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function readAll(storage: Storage): LyricSnapshot[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(storage: Storage, snapshots: LyricSnapshot[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Private-mode browsers / storage full -- history just doesn't persist this time.
  }
}

function isContinuation(previous: string, next: string): boolean {
  if (previous === next) return true;
  const shorter = previous.length <= next.length ? previous : next;
  const longer = previous.length <= next.length ? next : previous;
  const delta = longer.length - shorter.length;
  const prefixLen = Math.min(shorter.length, 40);
  return delta < MIN_DIFF_CHARS && longer.includes(shorter.slice(0, prefixLen));
}

/** All recorded snapshots, oldest first. */
export function getHistory(storage: Storage | null = getStorage()): LyricSnapshot[] {
  if (!storage) return [];
  return readAll(storage);
}

/** Records a snapshot unless it's just a small continuation of the most
 * recent one, and caps the log at the most recent `MAX_SNAPSHOTS` entries. */
export function recordSnapshot(text: string, storage: Storage | null = getStorage()): void {
  if (!storage) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  const history = readAll(storage);
  const last = history[history.length - 1];
  if (last && isContinuation(last.text, trimmed)) return;

  const snapshot: LyricSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    text: trimmed,
  };
  writeAll(storage, [...history, snapshot].slice(-MAX_SNAPSHOTS));
}

export function clearHistory(storage: Storage | null = getStorage()): void {
  if (!storage) return;
  writeAll(storage, []);
}
