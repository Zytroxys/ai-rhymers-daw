import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { VerseMeter } from '../lyrics/meter';

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

/** Inline rhyme highlighting for the lyric editor: internal rhymes, the word
 * currently focused in the rhyme panel, and lines drifting from the verse's
 * syllable average -- computed off the same `VerseMeter` the line-analysis
 * list below the editor already renders from. */
export function buildRhymeDecorations(
  verse: VerseMeter,
  focusWord: string | null,
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

  verse.lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const ranges = wordRanges(lineNumber, line.text);

    const rhymed = new Set(line.internalRhymes.flatMap((pair) => [pair.a, pair.b]));
    ranges.forEach((range, wordIndex) => {
      if (rhymed.has(wordIndex)) {
        decorations.push({
          range,
          options: {
            inlineClassName: 'rhyme-decoration rhyme-internal',
            hoverMessage: { value: 'Internal rhyme' },
          },
        });
      }
      if (focusWord && line.words[wordIndex]?.text === focusWord) {
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
