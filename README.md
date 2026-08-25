# AI Rhymers DAW

A browser DAW for writing rhymes to a beat. Two halves that talk to each other:

- **A step sequencer** — a 7-voice drum machine with a lookahead scheduler, swing,
  per-step velocity, and synthesized voices (no samples to load).
- **A rhyme engine** — grapheme-to-phoneme, syllabification, and a rhyme scorer
  that understands perfect, near, slant, and multisyllabic rhymes, plus verse
  analysis (syllable counts, rhyme scheme, internal rhymes).

Everything runs client-side. No API keys, no network calls, no audio assets.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 38 tests over the rhyme and pattern engines
npm run build    # typecheck + production bundle
```

## Using it

| Action | How |
| --- | --- |
| Play / stop | `Space`, or the transport button |
| Toggle a step | Click a cell in the grid |
| Change a step's velocity | Shift-click the cell |
| Audition a voice | Click the track name |
| Look up rhymes | Click any word in the verse, or type in the rhyme panel |

Projects autosave to `localStorage`, and Export/Import round-trips a project as
JSON.

## How the rhyme engine works

`src/rhyme/` is independent of the UI and of the audio engine — it is plain
TypeScript with no dependencies, so it can be lifted out and used anywhere.

**Pronunciation** (`g2p.ts`) is rule-based rather than dictionary-based.
CMUdict would be ~3MB for a job that only ever needs the tail of a word, so
instead there are longest-match spelling rules plus an exception table for the
irregulars English is full of. The rules capture the patterns that actually
change a rhyme: magic-e (`hoping` vs `hopping`), `-ow` closing a word long but
sitting inside one as a diphthong (`know` vs `crown`), `-tion` as a single
`SH AH N` chunk, and voicing assimilation on `-s`/`-ed`.

It is approximate on purpose. `addPronunciations({ vibe: 'V AY B' })` corrects
or extends it, and a slightly wrong vowel degrades to a slant rhyme rather than
a hard miss.

**Scoring** (`rhyme.ts`) compares trailing syllables rather than cutting at the
last stressed vowel. Stress detection is heuristic, and comparing the last N
syllables gets multisyllabic rhymes — the ones rap actually runs on — without
needing stress to be right:

```ts
scoreRhyme('tragic wagon', 'magic dragon');
// { score: 0.90, quality: 'perfect', comparedSyllables: 3, matchedSyllables: 2 }
```

Three things make the scores behave:

1. **Vowels and consonants are compared by articulatory features**, not equality.
   `bad`/`bat` differ only in voicing and score far above `bad`/`ball`.
2. **A syllable's consonants include the onset of the syllable after it.**
   `money` and `heavy` differ only there (N vs V) — ignore it and they look like
   a perfect two-syllable rhyme, which they are not.
3. **Stress alignment demotes a mismatch.** `money` and `degree` both end in
   `IY`, but one ends unstressed; without this, every `-y` word rhymes with
   `free`.

Scores are scaled by how much of the rhyme lands, so a one-syllable perfect
rhyme tops out below a genuine multi.

**Verse analysis** (`src/lyrics/meter.ts`) builds on that: per-line syllable
counts, syllables-per-bar at the current tempo, internal rhymes within a line,
`rhymeScheme()` labelling, and flagging lines that drift from the verse average.

## How the sequencer works

`setTimeout` and `requestAnimationFrame` are far too jittery to place drum hits
with. `src/audio/engine.ts` runs a coarse 25ms timer that schedules every hit
falling inside the next 120ms directly onto the `AudioContext` clock, which is
sample-accurate. The UI playhead is derived from that clock rather than driving
it, so the visuals stay honest even when the main thread stalls.

React state is the source of truth for the pattern; the engine *pulls* a
snapshot each time it schedules. Edits made while the transport is running take
effect on the next lookahead window, with no state duplicated between the two.

Voices in `src/audio/voices.ts` are oscillators and filtered noise — a kick with
a pitch envelope and a noise transient, a four-burst clap, a saturated 808.
Swapping in a sampler means replacing `triggerVoice` and nothing else.

## Layout

```
src/
  audio/     engine.ts (scheduler) · voices.ts (synthesis) · types.ts (pattern model)
  rhyme/     phonemes.ts (features) · g2p.ts · rhyme.ts (scoring) · lexicon.ts
  lyrics/    meter.ts (verse analysis)
  state/     store.ts (useSyncExternalStore + localStorage)
  ui/        TransportBar · StepGrid · LyricPad · RhymePanel
tests/       g2p · rhyme · meter · pattern
scripts/     smoke.mjs (optional browser end-to-end check)
```

## Known limits

- **Stress is guessed, not known.** Suffix and prefix rules cover the common
  cases; the scorer treats stress as a hint rather than a hard gate.
- **The bundled lexicon is ~1,300 words.** It is small enough to read in a diff.
  `setLexicon(words)` swaps in a full dictionary.
- **The G2P will mispronounce things.** Every rule-based English G2P does.
  `addPronunciations()` is the fix, and additions to the exception table in
  `g2p.ts` are welcome.
- **No recording or export to audio yet.** Export writes project JSON, not a
  bounce.

## Where the AI goes

There is no model call anywhere in this repo yet — the rhyme engine is
deterministic and offline, which makes it testable and fast. The natural
integration points, when they come:

- **Line completion**, given the beat's tempo, the syllable budget for the bar,
  and the rhyme sounds already in play.
- **Reranking** `findRhymes()` output by meaning rather than by sound alone.
- **Pattern generation** from a text prompt, writing directly into the step grid.

Each of those wants the engine here as its constraint layer: it knows what
scans and what rhymes, which is exactly what a language model is worst at.
