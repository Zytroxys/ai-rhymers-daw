import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { VerseMeter } from '../lyrics/meter';
import { normalizeWord, normalizedIndexMap } from '../rhyme/g2p';
import { ConsonanceKind } from '../rhyme/consonance';

/**
 * Maps each line's word list back onto column ranges in the source text.
 * `analyzeLine` tokenizes with `text.split(/\s+/).filter(Boolean)`, which
 * yields the same words in the same order as matching `/\S+/g`, so the two
 * can be zipped positionally.
 */
function wordRanges(lineNumber: number, text: string): Monaco.IRange[] {
  const ranges: Monaco.IRange[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    ranges.push({
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: match.index + 1,
      endColumn: match.index + 1 + match[0].length,
    });
  }
  return ranges;
}

/** Given a word's normalized-spelling character range (from
 * `groupRhymingSyllables`), find the matching range over the word as it
 * actually appears in the source line -- letters normalization dropped
 * (apostrophes, trailing punctuation caught by `\S+`) sit outside the
 * kept-letter index map, so this widens to their nearest kept neighbors
 * rather than misaligning. */
function toRawRange(word: string, span: { start: number; end: number }): { start: number; end: number } | null {
  const map = normalizedIndexMap(word);
  if (map.length === 0 || span.end <= span.start) return null;
  const start = map[Math.min(span.start, map.length - 1)];
  const end = map[Math.min(span.end - 1, map.length - 1)] + 1;
  return { start, end };
}

/** Inline rhyme highlighting for the lyric editor: every syllable is colored
 * by which verse-wide rhyme family it belongs to, as computed by
 * `groupRhymingSyllables` from actual phonetic scoring -- a syllable only
 * gets a color if it scores as an actual rhyme against some other syllable
 * present in the verse right now (single-syllable words, individual
 * syllables of longer words, and matching syllables across a multi-word
 * phrase all highlight independently). Also handles the word currently
 * focused in the rhyme panel and lines drifting from the verse's syllable
 * average -- computed off the same `VerseMeter` the line-analysis list below
 * the editor already renders from. Recomputed and reapplied asynchronously
 * (see LyricPad's rAF-debounced analysis pass) so the coloring keeps up with
 * typing without sitting in the keystroke's own tick. */
export function buildRhymeDecorations(
  verse: VerseMeter,
  focusWord: string | null,
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

  verse.lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const ranges = wordRanges(lineNumber, line.text);

    ranges.forEach((range, wordIndex) => {
      const word = line.words[wordIndex]?.text;
      const matches = word ? verse.syllableGroups.get(normalizeWord(word)) : undefined;
      matches?.forEach((match) => {
        const raw = toRawRange(word!, match);
        if (!raw) return;
        const classes = ['rhyme-decoration', `rhyme-group-${match.color}`];
        let hoverText = 'Rhymes with other syllables highlighted in this color';
        if (match.stressed) classes.push('rhyme-stressed');
        if (match.isPhraseMember) {
          classes.push('rhyme-phrase-member');
          hoverText = 'Part of a phrase rhyme run with matching syllables across words';
        }
        decorations.push({
          range: {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: range.startColumn + raw.start,
            endColumn: range.startColumn + raw.end,
          },
          options: {
            inlineClassName: classes.join(' '),
            hoverMessage: { value: hoverText },
          },
        });
      });
      if (focusWord && word === focusWord) {
        decorations.push({
          range,
          options: {
            inlineClassName: 'rhyme-decoration rhyme-focused',
            hoverMessage: { value: 'Focused in the rhyme panel' },
          },
        });
      }
    });

    if (verse.outliers.includes(index) && line.text.length > 0) {
      decorations.push({
        range: {
          startLineNumber: lineNumber,
          endLineNumber: lineNumber,
          startColumn: 1,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'rhyme-outlier-line',
        },
      });
    }
  });

  return decorations;
}

const CONSONANCE_HOVER: Record<ConsonanceKind, string> = {
  onset: 'Alliterates with other word-initial consonants',
  trailing: 'Trailing consonants match elsewhere in the verse',
};

/** Inline consonance highlighting: word-initial and stressed-syllable-onward
 * trailing consonant clusters that echo elsewhere in the verse, computed
 * entirely independently of rhyme-family scoring (see rhyme/consonance.ts).
 * Kept as a separate decoration pass -- rather than folded into
 * `buildRhymeDecorations` -- so the two stay independently swappable, and so
 * a syllable that's both rhyme-matched and consonance-matched (its spans can
 * overlap, since a rhyme-family span covers a whole syllable including its
 * onset letters) never has one signal silently override the other: the two
 * use different CSS properties (see `.consonance-decoration` in styles.css)
 * specifically so Monaco merging both decorations' classes onto one span
 * still renders both. */
export function buildConsonanceDecorations(verse: VerseMeter): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

  verse.lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const ranges = wordRanges(lineNumber, line.text);

    ranges.forEach((range, wordIndex) => {
      const word = line.words[wordIndex]?.text;
      const matches = word ? verse.consonanceGroups.get(normalizeWord(word)) : undefined;
      matches?.forEach((match) => {
        const raw = toRawRange(word!, match);
        if (!raw) return;
        decorations.push({
          range: {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: range.startColumn + raw.start,
            endColumn: range.startColumn + raw.end,
          },
          options: {
            inlineClassName: `consonance-decoration consonance-${match.kind}`,
            hoverMessage: { value: CONSONANCE_HOVER[match.kind] },
          },
        });
      });
    });
  });

  return decorations;
}
