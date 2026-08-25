import { useMemo } from 'react';
import { analyzeVerse } from '../lyrics/meter';
import { actions, useProject } from '../state/store';

/**
 * The writing surface. Everything to the right of the text is derived: syllable
 * counts per line, the rhyme scheme, internal rhymes, and how many syllables
 * a line is asking you to fit into a bar at the current tempo.
 */
export default function LyricPad() {
  const lyrics = useProject((s) => s.lyrics);
  const barsPerLine = useProject((s) => s.barsPerLine);
  const bpm = useProject((s) => s.transport.bpm);
  const focusWord = useProject((s) => s.focusWord);

  const lines = useMemo(() => lyrics.split('\n'), [lyrics]);
  const verse = useMemo(() => analyzeVerse(lines, barsPerLine), [lines, barsPerLine]);

  const secondsPerBar = (60 / bpm) * 4;

  return (
    <section className="lyric-panel">
      <div className="panel-head">
        <h2>Verse</h2>
        <label className="field inline">
          <span>Bars per line</span>
          <select
            value={barsPerLine}
            onChange={(e) => actions.setBarsPerLine(Number(e.target.value))}
          >
            <option value={0.5}>½</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <span className="stat">
          {verse.totalSyllables} syllables · avg {verse.averageSyllables.toFixed(1)}/line
        </span>
      </div>

      <textarea
        className="lyric-input"
        value={lyrics}
        spellCheck={false}
        onChange={(e) => actions.setLyrics(e.target.value)}
        placeholder="Write the verse here, one line per bar…"
      />

      <ol className="line-analysis">
        {verse.lines.map((line, index) => {
          const rhymed = new Set(line.internalRhymes.flatMap((pair) => [pair.a, pair.b]));
          const perSecond = line.syllables / (barsPerLine * secondsPerBar);
          return (
            <li key={index} className={verse.outliers.includes(index) ? 'outlier' : ''}>
              <span className="scheme">{verse.scheme[index]}</span>
              <span className="count" title={`${perSecond.toFixed(1)} syllables/sec at ${bpm} BPM`}>
                {line.syllables}
              </span>
              <span className="words">
                {line.words.map((word, wordIndex) => (
                  <button
                    key={`${word.text}-${wordIndex}`}
                    className={[
                      'word',
                      rhymed.has(wordIndex) ? 'internal' : '',
                      focusWord === word.text ? 'focused' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => actions.setFocusWord(word.text)}
                    title={`${word.syllables} syllable${word.syllables === 1 ? '' : 's'}`}
                  >
                    {word.text}
                  </button>
                ))}
                {line.words.length === 0 && <em className="empty">—</em>}
              </span>
            </li>
          );
        })}
      </ol>
      {verse.outliers.length > 0 && (
        <p className="hint">
          Highlighted lines drift furthest from the verse&apos;s average syllable count.
        </p>
      )}
    </section>
  );
}
