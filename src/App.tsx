import { useEffect } from 'react';
import { getEngine } from './audio/engine';
import { recordSnapshot } from './state/lyricHistory';
import { getState, useProject } from './state/store';
import LyricPad from './ui/LyricPad';
import RhymePanel from './ui/RhymePanel';
import StepGrid from './ui/StepGrid';
import TransportBar from './ui/TransportBar';
import WordGraphPanel from './ui/WordGraphPanel';
import './rhyme';

const HISTORY_CAPTURE_DELAY_MS = 30_000;

/** Feeds the word graph's "Your style" branch: records a snapshot of the
 * lyrics once they've settled for a while, rather than on every keystroke. */
function useLyricHistoryCapture() {
  const lyrics = useProject((s) => s.lyrics);
  useEffect(() => {
    const handle = setTimeout(() => recordSnapshot(lyrics), HISTORY_CAPTURE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [lyrics]);
}

export default function App() {
  useEffect(() => {
    // The engine pulls the current pattern each time it schedules, so edits made
    // while the transport runs take effect on the next lookahead window.
    getEngine().setSnapshotProvider(() => {
      const state = getState();
      return { pattern: state.pattern, transport: state.transport };
    });
  }, []);

  useLyricHistoryCapture();

  return (
    <div className="app">
      <TransportBar />
      <main className="workspace">
        <div className="left-column">
          <StepGrid />
          <LyricPad />
          <WordGraphPanel />
        </div>
        <RhymePanel />
      </main>
    </div>
  );
}
