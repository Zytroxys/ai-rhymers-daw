import { useEffect, useMemo, useState } from 'react';
import { fetchAntonyms, fetchRelated, fetchSynonyms } from '../lexis/datamuse';
import { clearApiKey, hasApiKey, setApiKey, suggestInStyle } from '../lexis/personalAssist';
import { meaningOverlap, soundsLike } from '../lexis/wordplay';
import { RhymeQuality, findRhymes, syllablesOf } from '../rhyme/rhyme';
import { getHistory } from '../state/lyricHistory';
import { actions } from '../state/store';
import {
  GraphLayout,
  STYLE_COLOR,
  VIEW_SIZE,
  WordGraphBranch,
  WordGraphCategory,
  WordGraphConnector,
  branchColor,
  layoutCommaBranches,
  layoutPhraseRhymes,
  layoutSingleWord,
} from './wordGraphLayout';

const DEBOUNCE_MS = 400;
const MAX_PHRASE_SYLLABLES = 10;

type Mode = 'empty' | 'single' | 'phrase' | 'comma';

function classify(raw: string): { mode: Mode; parts: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { mode: 'empty', parts: [] };

  const commaParts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return { mode: 'comma', parts: commaParts };

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { mode: 'single', parts: [trimmed] };
  return { mode: 'phrase', parts: [trimmed] };
}

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

interface SingleWordState {
  synonyms: string[];
  antonyms: string[];
  related: string[];
  loading: boolean;
  failed: boolean;
}

const EMPTY_SINGLE_WORD_STATE: SingleWordState = { synonyms: [], antonyms: [], related: [], loading: false, failed: false };

interface CommaState {
  relatedByBranch: string[][];
  loading: boolean;
  failed: boolean;
}

const EMPTY_COMMA_STATE: CommaState = { relatedByBranch: [], loading: false, failed: false };

interface PhraseInfo {
  matches: { word: string; quality: RhymeQuality }[];
  tooLong: boolean;
  syllableCount: number;
}

type StyleStatus = 'idle' | 'loading' | 'ok' | 'no-key' | 'error';

interface StyleState {
  status: StyleStatus;
  words: string[];
}

const EMPTY_STYLE_STATE: StyleState = { status: 'idle', words: [] };

/**
 * Word-association graph: type a word or phrase into the center box and its
 * branches change shape by what's typed -- one word gets Synonyms/Antonyms/
 * Related categories, a comma-separated list gets one branch per item plus
 * wordplay connectors between neighbors, and a plain multi-word phrase gets
 * polysyllabic rhyme matches. A fourth "Your style" branch, present in every
 * mode, asks an AI model (via the user's own API key) for suggestions biased
 * toward this writer's own saved lyric history. See wordGraphLayout.ts for
 * the pure radial-spoke geometry this renders, and lexis/ for the data
 * sources (Datamuse for word data, personalAssist for the AI branch).
 */
export default function WordGraphPanel() {
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, DEBOUNCE_MS);
  const { mode, parts } = classify(debounced);

  const [singleWordState, setSingleWordState] = useState<SingleWordState>(EMPTY_SINGLE_WORD_STATE);
  const [commaState, setCommaState] = useState<CommaState>(EMPTY_COMMA_STATE);
  const [styleState, setStyleState] = useState<StyleState>(EMPTY_STYLE_STATE);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [keyVersion, setKeyVersion] = useState(0);

  const keyPresent = useMemo(() => hasApiKey(), [keyVersion]);

  // Single-word mode: Synonyms/Antonyms/Related from Datamuse.
  useEffect(() => {
    if (mode !== 'single') {
      setSingleWordState(EMPTY_SINGLE_WORD_STATE);
      return;
    }
    let cancelled = false;
    const word = parts[0];
    setSingleWordState((s) => ({ ...s, loading: true }));
    Promise.all([fetchSynonyms(word), fetchAntonyms(word), fetchRelated(word)]).then(([syn, ant, rel]) => {
      if (cancelled) return;
      setSingleWordState({
        synonyms: syn.words,
        antonyms: ant.words,
        related: rel.words,
        loading: false,
        failed: syn.failed && ant.failed && rel.failed,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, debounced]);

  // Comma mode: fetch "means like" per branch, used for the meaning-overlap connector.
  useEffect(() => {
    if (mode !== 'comma') {
      setCommaState(EMPTY_COMMA_STATE);
      return;
    }
    let cancelled = false;
    setCommaState((s) => ({ ...s, loading: true }));
    Promise.all(parts.map((p) => fetchRelated(p))).then((results) => {
      if (cancelled) return;
      setCommaState({
        relatedByBranch: results.map((r) => r.words),
        loading: false,
        failed: results.length > 0 && results.every((r) => r.failed),
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, debounced]);

  // "Your style": independent of the deterministic branches, runs in every mode.
  useEffect(() => {
    if (mode === 'empty') {
      setStyleState(EMPTY_STYLE_STATE);
      return;
    }
    if (!hasApiKey()) {
      setStyleState({ status: 'no-key', words: [] });
      return;
    }
    let cancelled = false;
    setStyleState({ status: 'loading', words: [] });
    const history = getHistory().map((snapshot) => snapshot.text);
    suggestInStyle(debounced, history).then((result) => {
      if (cancelled) return;
      setStyleState({ status: result.status, words: result.words });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, debounced, keyVersion]);

  const phraseInfo = useMemo<PhraseInfo>(() => {
    if (mode !== 'phrase') return { matches: [], tooLong: false, syllableCount: 0 };
    const phrase = parts[0];
    const syllableCount = syllablesOf(phrase).length;
    if (syllableCount > MAX_PHRASE_SYLLABLES) return { matches: [], tooLong: true, syllableCount };
    const found = findRhymes(phrase, { limit: 12, maxSyllables: MAX_PHRASE_SYLLABLES });
    return { matches: found.map((m) => ({ word: m.word, quality: m.quality })), tooLong: false, syllableCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, debounced]);

  const connectors = useMemo<WordGraphConnector[]>(() => {
    if (mode !== 'comma') return [];
    const result: WordGraphConnector[] = [];
    for (let i = 0; i < parts.length - 1; i += 1) {
      const sound = soundsLike(parts[i], parts[i + 1]);
      if (sound.score >= 0.5) {
        result.push({ fromIdx: i, toIdx: i + 1, kind: 'sounds-like', label: 'sounds like' });
      }
      const relA = commaState.relatedByBranch[i] ?? [];
      const relB = commaState.relatedByBranch[i + 1] ?? [];
      const overlap = meaningOverlap(relA, relB);
      if (overlap.length > 0) {
        result.push({ fromIdx: i, toIdx: i + 1, kind: 'means-like', label: `means like: ${overlap[0]}` });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, debounced, commaState.relatedByBranch]);

  const layout: GraphLayout | null = useMemo(() => {
    const styleWords = styleState.status === 'ok' ? styleState.words : [];

    if (mode === 'single') {
      const categories: WordGraphCategory[] = [
        { label: 'Synonyms', words: singleWordState.synonyms, color: 'hsla(190, 70%, 55%, 0.55)' },
        { label: 'Antonyms', words: singleWordState.antonyms, color: 'hsla(0, 70%, 55%, 0.55)' },
        { label: 'Related', words: singleWordState.related, color: 'hsla(90, 60%, 50%, 0.55)' },
        { label: 'Your style', words: styleWords, color: STYLE_COLOR },
      ];
      return layoutSingleWord(parts[0], categories);
    }

    if (mode === 'phrase') {
      if (phraseInfo.tooLong) return null;
      return layoutPhraseRhymes(parts[0], phraseInfo.matches, styleWords);
    }

    if (mode === 'comma') {
      const branches: WordGraphBranch[] = parts.map((label, i) => ({ label, color: branchColor(i) }));
      branches.push({ label: 'Your style', color: STYLE_COLOR });
      return layoutCommaBranches(branches, connectors);
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, parts.join('|'), singleWordState, phraseInfo, connectors, styleState]);

  function recenterOn(label: string) {
    setInput(label);
    actions.setFocusWord(label);
  }

  function saveKey() {
    if (!apiKeyDraft.trim()) return;
    setApiKey(apiKeyDraft.trim());
    setApiKeyDraft('');
    setKeyVersion((v) => v + 1);
  }

  function removeKey() {
    clearApiKey();
    setKeyVersion((v) => v + 1);
  }

  return (
    <section className="word-graph-panel">
      <div className="panel-head">
        <h2>Word Graph</h2>
      </div>

      <input
        className="word-graph-query"
        value={input}
        placeholder="Type a word, a phrase, or comma-separated words…"
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="word-graph-key-row">
        {keyPresent ? (
          <>
            <span className="hint">Your style: enabled</span>
            <button className="link" onClick={removeKey}>Remove key</button>
          </>
        ) : (
          <>
            <input
              type="password"
              className="word-graph-key-input"
              placeholder="Claude API key for Your style suggestions"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
            />
            <button className="link" onClick={saveKey}>Save</button>
          </>
        )}
      </div>
      <p className="hint">
        Your key and lyric snippets go directly from your browser to Anthropic — this app has no
        server of its own to send them through.
      </p>

      {mode === 'empty' && <p className="empty-state">Type a word or phrase above to grow a graph.</p>}

      {mode === 'phrase' && phraseInfo.tooLong && (
        <p className="empty-state">
          Phrase mode supports up to {MAX_PHRASE_SYLLABLES} syllables (this phrase is{' '}
          {phraseInfo.syllableCount}) — try something shorter.
        </p>
      )}

      {layout && (
        <div className="word-graph-canvas">
          <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="word-graph-svg">
            <rect x={0} y={0} width={VIEW_SIZE} height={VIEW_SIZE} className="wg-backdrop" />
            {layout.edges.map((edge, i) => {
              const from = layout.nodes.find((n) => n.id === edge.from);
              const to = layout.nodes.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={edge.dashed ? 'wg-edge wg-edge-dashed' : 'wg-edge'}
                />
              );
            })}
            {layout.nodes.map((node) => {
              const clickable = node.kind === 'leaf' || node.kind === 'branch';
              const width = Math.max(40, node.label.length * 7 + 20);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={clickable ? 'wg-node-clickable' : undefined}
                  onClick={clickable ? () => recenterOn(node.label) : undefined}
                >
                  <rect
                    x={-width / 2}
                    y={-13}
                    width={width}
                    height={26}
                    rx={13}
                    className={`wg-node wg-node-${node.kind}`}
                    style={node.color ? { fill: node.color } : undefined}
                  />
                  <text x={0} y={4} textAnchor="middle" className={`wg-node-text wg-node-text-${node.kind}`}>
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {mode !== 'empty' && (
        <p className="hint">
          {styleState.status === 'no-key' && 'Add your Claude API key above to enable "Your style" suggestions.'}
          {styleState.status === 'loading' && 'Loading style-matched suggestions…'}
          {styleState.status === 'error' && "Couldn't reach the style-suggestion service."}
          {styleState.status === 'ok' && styleState.words.length === 0 && 'No style-matched suggestions yet — try writing a bit more first.'}
        </p>
      )}
      {mode === 'single' && singleWordState.failed && (
        <p className="hint">Couldn't reach the word service — check your connection.</p>
      )}
      {mode === 'comma' && commaState.failed && (
        <p className="hint">Couldn't reach the word service — meaning-overlap connectors need it.</p>
      )}
    </section>
  );
}
