import { analyzeWord, countSyllables } from '../rhyme/g2p';
import { rhymeScheme, scoreRhyme } from '../rhyme/rhyme';

/**
 * Turns written lines into something the timeline can draw: syllable counts,
 * the internal rhymes inside a line, and how the syllables sit against the bar.
 */

export interface WordMeter {
  text: string;
  syllables: number;
  stressPattern: boolean[];
}

export interface LineMeter {
  text: string;
  words: WordMeter[];
  syllables: number;
  lastWord: string;
  /** Syllables per bar if this line is spread over `barsPerLine` bars. */
  density: number;
  /** Pairs of word indices inside the line that rhyme with each other. */
  internalRhymes: Array<{ a: number; b: number; score: number }>;
}

export function analyzeLine(text: string, barsPerLine = 1): LineMeter {
  const tokens = text.split(/\s+/).filter(Boolean);
  const words: WordMeter[] = tokens.map((token) => {
    const analysis = analyzeWord(token);
    return {
      text: token,
      syllables: analysis.syllableCount || countSyllables(token),
      stressPattern: analysis.syllables.map((s) => s.stressed),
    };
  });

  const syllables = words.reduce((sum, w) => sum + w.syllables, 0);
  const internalRhymes: LineMeter['internalRhymes'] = [];
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      const result = scoreRhyme(words[i].text, words[j].text);
      if (result.quality === 'identity') continue;
      if (result.score >= 0.72) internalRhymes.push({ a: i, b: j, score: result.score });
    }
  }

  return {
    text,
    words,
    syllables,
    lastWord: tokens.length ? tokens[tokens.length - 1] : '',
    density: barsPerLine > 0 ? syllables / barsPerLine : syllables,
    internalRhymes,
  };
}

export interface VerseMeter {
  lines: LineMeter[];
  scheme: string[];
  totalSyllables: number;
  averageSyllables: number;
  /** Lines whose syllable count strays furthest from the verse average. */
  outliers: number[];
}

export function analyzeVerse(lines: string[], barsPerLine = 1): VerseMeter {
  const analyzed = lines.map((line) => analyzeLine(line, barsPerLine));
  const nonEmpty = analyzed.filter((l) => l.syllables > 0);
  const totalSyllables = analyzed.reduce((sum, l) => sum + l.syllables, 0);
  const averageSyllables = nonEmpty.length ? totalSyllables / nonEmpty.length : 0;

  const outliers = analyzed
    .map((line, index) => ({ index, drift: Math.abs(line.syllables - averageSyllables) }))
    .filter((l) => analyzed[l.index].syllables > 0 && l.drift > Math.max(2, averageSyllables * 0.3))
    .sort((a, b) => b.drift - a.drift)
    .map((l) => l.index);

  return {
    lines: analyzed,
    scheme: rhymeScheme(lines),
    totalSyllables,
    averageSyllables,
    outliers,
  };
}

/**
 * Where each syllable of a line lands in beats, assuming the line is spoken
 * evenly across `bars`. Rough, but enough to line lyrics up with the grid.
 */
export function syllablePositions(line: LineMeter, bars: number, beatsPerBar = 4): number[] {
  if (line.syllables === 0) return [];
  const totalBeats = bars * beatsPerBar;
  const step = totalBeats / line.syllables;
  return Array.from({ length: line.syllables }, (_, i) => i * step);
}
