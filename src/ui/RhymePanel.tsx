import { useEffect, useMemo, useState } from 'react';
import { analyzeWord } from '../rhyme/g2p';
import { DatamuseQuality, RhymeEntry, fetchRhymes, mergeRhymes } from '../rhyme/datamuse';
import { OfflineIndex, loadOfflineIndex, offlineRhymes } from '../rhyme/offlineIndex';
import { actions, useProject } from '../state/store';

const QUALITY_LABEL: Record<DatamuseQuality, string> = {
  perfect: 'perfect',
  near: 'near',
};

type Status = 'idle' | 'loading' | 'ready';
type Online = 'pending' | 'on' | 'off';

/**
 * Rhyme lookup for whichever word is in focus. The cached CMUdict index answers
 * instantly and offline; when the network is up, Datamuse results are layered on top.
 */
export default function RhymePanel() {
  const focusWord = useProject((s) => s.focusWord);
  const [query, setQuery] = useState('');
  const [syllableFilter, setSyllableFilter] = useState<number | 'any'>('any');
  const [minQuality, setMinQuality] = useState<DatamuseQuality>('near');
  const [results, setResults] = useState<RhymeEntry[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [online, setOnline] = useState<Online>('pending');
  const [index, setIndex] = useState<OfflineIndex | null>(null);
  const [indexTried, setIndexTried] = useState(false);

  useEffect(() => {
    let live = true;
    loadOfflineIndex().then((loaded) => {
      if (!live) return;
      setIndex(loaded);
      setIndexTried(true);
    });
    return () => { live = false; };
  }, []);

  const word = query || focusWord || '';
  const analysis = useMemo(() => (word ? analyzeWord(word) : null), [word]);

  useEffect(() => {
    if (!word.trim()) {
      setResults([]);
      setStatus('idle');
      return undefined;
    }
    if (!indexTried) {
      setStatus('loading');
      return undefined;
    }
    const local = index ? offlineRhymes(index, word) : [];
    setResults(local);
    setStatus('ready');

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOnline('off');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchRhymes(word, controller.signal)
        .then((remote) => {
          setResults(mergeRhymes(remote, local));
          setOnline('on');
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== 'AbortError') setOnline('off');
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [word, index, indexTried]);

  const matches = useMemo(
    () =>
      results.filter(
        (r) =>
          (minQuality === 'near' || r.quality === 'perfect') &&
          (syllableFilter === 'any' || r.syllables === syllableFilter),
      ),
    [results, syllableFilter, minQuality],
  );

  return (
    <section className="rhyme-panel">
      <div className="panel-head">
        <h2>Rhymes</h2>
        {status === 'ready' && <span className="stat">{matches.length} results</span>}
        <span className="stat" title="Offline dictionary is always used; Datamuse is added when reachable">
          {index ? 'offline dictionary' : 'no offline dictionary'} · {online === 'on' ? '+ Datamuse' : online === 'off' ? 'Datamuse unavailable' : 'Datamuse…'}
        </span>
      </div>

      <input
        className="rhyme-query"
        value={query}
        placeholder={focusWord ? `${focusWord} (from the verse)` : 'Type a word or phrase…'}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="rhyme-filters">
        <label className="field inline">
          <span>Syllables</span>
          <select
            value={String(syllableFilter)}
            onChange={(e) => setSyllableFilter(e.target.value === 'any' ? 'any' : Number(e.target.value))}
          >
            <option value="any">any</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Down to</span>
          <select value={minQuality} onChange={(e) => setMinQuality(e.target.value as DatamuseQuality)}>
            <option value="perfect">perfect</option>
            <option value="near">near</option>
          </select>
        </label>
      </div>

      {analysis && analysis.phonemes.length > 0 && (
        <p className="phonemes" title="How the engine hears this word">
          /{analysis.phonemes.join(' ')}/ · {analysis.syllableCount} syl
        </p>
      )}

      <div className="rhyme-results" role="region" aria-label="Rhyme results">
        {status === 'loading' && <p className="empty-state">Loading the rhyme dictionary…</p>}
        {status === 'idle' && <p className="empty-state">Type a word, or click one in your verse.</p>}
        {status === 'ready' && matches.length === 0 && (
          <p className="empty-state">No rhymes for “{word}” with these filters.</p>
        )}
        {status === 'ready' && matches.length > 0 && (
          <ul className="rhyme-list">
            {matches.map((match) => (
              <li key={match.word}>
                <button className="rhyme-word" onClick={() => actions.setFocusWord(match.word)}>
                  {match.word}
                </button>
                <span className={`badge ${match.quality}`}>{QUALITY_LABEL[match.quality]}</span>
                {match.syllables > 0 && <span className="badge multi">{match.syllables}-syl</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
