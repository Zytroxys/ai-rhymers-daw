import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { buildConsonanceDecorations, buildRhymeDecorations } from './lyricDecorations';
import { VerseMeter, analyzeVerse } from '../lyrics/meter';
import { ConsonanceMode, actions, useProject } from '../state/store';

/** Monaco is ~600kB -- loaded on demand rather than in the app's main chunk. */
async function loadMonaco(): Promise<typeof Monaco> {
  const [monaco] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.api'),
    import('./monacoEnvironment'),
  ]);
  return monaco;
}

let themeDefined = false;
function ensureTheme(monaco: typeof Monaco): void {
  if (themeDefined) return;
  monaco.editor.defineTheme('rhymers-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e222b',
      'editor.foreground': '#e6e9ef',
      'editorCursor.foreground': '#ff7a4d',
      'editor.lineHighlightBackground': '#00000000',
      'editorLineNumber.foreground': '#2a2f3a',
      'editor.selectionBackground': '#4dd0e133',
    },
  });
  themeDefined = true;
}

/**
 * The writing surface. Everything to the right of the text is derived: syllable
 * counts per line, the rhyme scheme, internal rhymes, and how many syllables
 * a line is asking you to fit into a bar at the current tempo.
 *
 * The verse analysis that drives both the line-analysis list and the editor's
 * inline rhyme highlighting is recomputed off the animation frame rather than
 * inside the keystroke handler, so a long verse doesn't add scoring latency to
 * typing -- the highlighting catches up a frame later instead.
 */
export default function LyricPad() {
  const lyrics = useProject((s) => s.lyrics);
  const barsPerLine = useProject((s) => s.barsPerLine);
  const bpm = useProject((s) => s.transport.bpm);
  const focusWord = useProject((s) => s.focusWord);
  const consonanceMode = useProject((s) => s.consonanceMode);
  const consonanceSelection = useProject((s) => s.consonanceSelection);

  const [verse, setVerse] = useState<VerseMeter>(() =>
    analyzeVerse(lyrics.split('\n'), barsPerLine, { mode: consonanceMode, selection: consonanceSelection }),
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const analyzeFrame = useRef<number | null>(null);

  // Mount the editor once, after Monaco loads. React state stays the source of
  // truth for the text; the editor is a view onto it, synced in the effects below.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const subscriptions: Monaco.IDisposable[] = [];

    void loadMonaco().then((monaco) => {
      if (cancelled || !containerRef.current) return;
      ensureTheme(monaco);

      editor = monaco.editor.create(containerRef.current, {
        value: lyrics,
        language: 'plaintext',
        theme: 'rhymers-dark',
        automaticLayout: false,
        minimap: { enabled: false },
        wordWrap: 'on',
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        renderLineHighlight: 'none',
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { vertical: 'auto', horizontal: 'hidden' },
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        fontSize: 13,
        lineHeight: 26,
        padding: { top: 10, bottom: 10 },
      });
      editorRef.current = editor;
      decorationsRef.current = editor.createDecorationsCollection();
      decorationsRef.current.set([
        ...buildRhymeDecorations(verse, focusWord),
        ...buildConsonanceDecorations(verse),
      ]);

      subscriptions.push(
        editor.onDidChangeModelContent(() => {
          actions.setLyrics(editor!.getValue());
        }),
      );

      // Clicking a word in the verse focuses it in the rhyme panel, same as
      // clicking its button in the line-analysis list below.
      subscriptions.push(
        editor.onMouseDown((event) => {
          const position = event.target.position;
          if (!position) return;
          const word = editor!.getModel()?.getWordAtPosition(position);
          if (word) actions.setFocusWord(word.word);
        }),
      );

      resizeObserver = new ResizeObserver(() => editor!.layout());
      resizeObserver.observe(containerRef.current);
    });

    return () => {
      cancelled = true;
      subscriptions.forEach((sub) => sub.dispose());
      resizeObserver?.disconnect();
      decorationsRef.current = null;
      editor?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the editor's text in sync when lyrics change from outside it
  // (project import, undo elsewhere) without fighting the cursor while typing.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== lyrics) {
      editor.setValue(lyrics);
    }
  }, [lyrics]);

  // Recompute rhyme/syllable analysis a frame after the text settles, so
  // scoring never sits in the same tick as a keystroke.
  useEffect(() => {
    if (analyzeFrame.current !== null) cancelAnimationFrame(analyzeFrame.current);
    analyzeFrame.current = requestAnimationFrame(() => {
      analyzeFrame.current = null;
      setVerse(analyzeVerse(lyrics.split('\n'), barsPerLine, { mode: consonanceMode, selection: consonanceSelection }));
    });
    return () => {
      if (analyzeFrame.current !== null) cancelAnimationFrame(analyzeFrame.current);
    };
  }, [lyrics, barsPerLine, consonanceMode, consonanceSelection]);

  // Paint the editor's inline decorations from whatever analysis is current.
  useEffect(() => {
    decorationsRef.current?.set([
      ...buildRhymeDecorations(verse, focusWord),
      ...buildConsonanceDecorations(verse),
    ]);
  }, [verse, focusWord]);

  const secondsPerBar = (60 / bpm) * 4;

  const selectedSet = useMemo(
    () => new Set(consonanceSelection.map((p) => `${p.lineIdx}:${p.wordIdx}`)),
    [consonanceSelection],
  );

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
        <label className="field inline">
          <span>Consonance</span>
          <select
            value={consonanceMode}
            onChange={(e) => actions.setConsonanceMode(e.target.value as ConsonanceMode)}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
            <option value="semi-auto">Semi-auto</option>
          </select>
        </label>
        <span className="stat">
          {verse.totalSyllables} syllables · avg {verse.averageSyllables.toFixed(1)}/line
        </span>
      </div>

      <div className="lyric-input monaco-host" ref={containerRef} />

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
                      consonanceMode === 'semi-auto' && selectedSet.has(`${index}:${wordIndex}`) ? 'selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      actions.setFocusWord(word.text);
                      if (consonanceMode === 'semi-auto') {
                        actions.toggleConsonanceWord({ lineIdx: index, wordIdx: wordIndex });
                      }
                    }}
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
      {consonanceMode === 'semi-auto' && (
        <p className="hint">
          {consonanceSelection.length} word{consonanceSelection.length === 1 ? '' : 's'} selected for consonance
          {consonanceSelection.length > 0 && (
            <>
              {' · '}
              <button className="link" onClick={() => actions.clearConsonanceSelection()}>
                Clear
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
