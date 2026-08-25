// Importing lexicon.ts registers the default word list with findRhymes.
import './lexicon';

export * from './phonemes';
export * from './g2p';
export * from './rhyme';
export { getLexicon, setLexicon, extendLexicon } from './lexicon';
