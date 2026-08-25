import { useMemo, useState } from 'react';
import { analyzeWord } from '../rhyme/g2p';
import { RhymeQuality, findRhymes } from '../rhyme/rhyme';
import { actions, useProject } from '../state/store';

const QUALITY_ORDER: RhymeQuality[] = ['perfect', 'near', 'slant', 'assonance'];

const QUALITY_LABEL: Record<RhymeQuality, string> = {
  identity: 'same',
  perfect: 'perfect',
  near: 'near',
  slant: 'slant',
  assonance: 'assonance',
  weak: 'weak',
};

/** Rhyme lookup for whichever word is in focus, filtered by shape. */
export default function RhymePanel() {
  const focusWord = useProject((s) => s.focusWord);
  const [query, setQuery] = useState('');
  const [syllableFilter, setSyllableFilter] = useState<number | 'any'>('any');
  const [minQuality, setMinQuality] = useState<RhymeQuality>('slant');

  const word = query || focusWord || '';

  const analysis = useMemo(() => (word ? analyzeWord(word) : null), [word]);

  const matches = useMemo(() => {
    if (!word.trim()) return [];
    const allowed = new Set(QUALITY_ORDER.slice(0, QUALITY_ORDER.indexOf(minQuality) + 1));
    return findRhymes(word, {
      limit: 120,
      minScore: 0.5,
      syllables: syllableFilter === 'any' ? undefined : syllableFilter,
    }).filter((match) => allowed.has(match.quality));
  }, [word, syllableFilter, minQuality]);

  return (
    <section className="rhyme-panel">
      <div className="panel-head">
        <h2>Rhymes</h2>
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
          <select value={minQuality} onChange={(e) => setMinQuality(e.target.value as RhymeQuality)}>
            {QUALITY_ORDER.map((q) => (
              <option key={q} value={q}>{QUALITY_LABEL[q]}</option>
            ))}
          </select>
        </label>
      </div>

      {analysis && analysis.phonemes.length > 0 && (
        <p className="phonemes" title="How the engine hears this word">
          /{analysis.phonemes.join(' ')}/ · {analysis.syllableCount} syl
        </p>
      )}

      <ul className="rhyme-list">
        {matches.map((match) => (
          <li key={match.word}>
            <button className="rhyme-word" onClick={() => actions.setFocusWord(match.word)}>
              {match.word}
            </button>
            <span className={`badge ${match.quality}`}>{QUALITY_LABEL[match.quality]}</span>
            {match.matchedSyllables > 1 && <span className="badge multi">{match.matchedSyllables}-syl</span>}
            <span className="score" style={{ width: `${Math.round(match.score * 100)}%` }} />
          </li>
        ))}
        {word && matches.length === 0 && (
          <li className="empty-state">
            Nothing in the bundled lexicon rhymes with “{word}”. Loosen the filters or
            load a bigger word list with <code>setLexicon()</code>.
          </li>
        )}
      </ul>
    </section>
  );
}
