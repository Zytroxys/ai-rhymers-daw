import { normalizeWord } from './g2p';
import { SyllableColor } from './grouping';

const FUNCTION_WORD_STOPLIST = new Set([
  'a', 'an', 'the', 'i', 'my', 'in', 'on', 'of', 'to', 'and', 'or', 'but',
  'it', 'is', 'am', 'are', 'was', 'be', 'as', 'at', 'so', 'for', 'me', 'we',
  'he', 'she', 'you', 'him', 'her', 'us', 'this', 'that',
]);

interface SyllableInstance {
  color: number;
  lineIdx: number;
  wordIdx: number;
  wordLabel: string;
  entry: SyllableColor;
}

function buildSyllableStream(
  groups: Map<string, SyllableColor[]>,
  lineWords: string[][]
): SyllableInstance[] {
  const stream: SyllableInstance[] = [];

  for (let lineIdx = 0; lineIdx < lineWords.length; lineIdx += 1) {
    for (let wordIdx = 0; wordIdx < lineWords[lineIdx].length; wordIdx += 1) {
      const raw = lineWords[lineIdx][wordIdx];
      const word = normalizeWord(raw);

      if (!word || FUNCTION_WORD_STOPLIST.has(word)) continue;

      const matches = groups.get(word);
      if (!matches) continue;

      for (const entry of matches) {
        stream.push({
          color: entry.color,
          lineIdx,
          wordIdx,
          wordLabel: word,
          entry,
        });
      }
    }
  }

  return stream;
}

function detectPhraseRuns(stream: SyllableInstance[]): Map<number, number> {
  const phraseMap = new Map<number, number>();
  const colorIndices = new Map<number, number[]>();

  for (let i = 0; i < stream.length; i += 1) {
    const color = stream[i].color;
    if (!colorIndices.has(color)) {
      colorIndices.set(color, []);
    }
    colorIndices.get(color)!.push(i);
  }

  for (const [, indices] of colorIndices) {
    let phraseRunId = 0;

    let runStart = 0;
    for (let i = 1; i <= indices.length; i += 1) {
      const isConsecutive = i < indices.length && indices[i] === indices[i - 1] + 1;
      let isLineBreak = false;
      if (i < indices.length && isConsecutive) {
        const current = stream[indices[i]];
        const prev = stream[indices[i - 1]];
        if (current.lineIdx !== prev.lineIdx) {
          isLineBreak = true;
        }
      }

      if (!isConsecutive || isLineBreak) {
        const runLength = i - runStart;
        if (runLength >= 2) {
          const words = new Set<string>();
          for (let j = runStart; j < i; j += 1) {
            words.add(stream[indices[j]].wordLabel);
          }
          const isMultiWord = words.size >= 2;
          const isSingleMultiSyllabicWord = words.size === 1 && runLength >= 2;

          if (isMultiWord || isSingleMultiSyllabicWord) {
            for (let j = runStart; j < i; j += 1) {
              phraseMap.set(indices[j], phraseRunId);
            }
            phraseRunId += 1;
          }
        }
        runStart = i;
      }
    }
  }

  return phraseMap;
}

export function annotatePhrases(
  groups: Map<string, SyllableColor[]>,
  lineWords: string[][]
): Map<string, SyllableColor[]> {
  const stream = buildSyllableStream(groups, lineWords);
  const phraseMap = detectPhraseRuns(stream);

  const result = new Map<string, SyllableColor[]>();

  for (const [word, colors] of groups) {
    const annotated: SyllableColor[] = [];

    for (const color of colors) {
      const entry = { ...color };

      const streamIdx = stream.findIndex(
        (s) => s.wordLabel === word && s.entry.start === color.start && s.entry.end === color.end && s.color === color.color
      );

      if (streamIdx !== -1 && phraseMap.has(streamIdx)) {
        entry.phraseId = phraseMap.get(streamIdx);
        entry.isPhraseMember = true;
      }

      annotated.push(entry);
    }

    result.set(word, annotated);
  }

  return result;
}
