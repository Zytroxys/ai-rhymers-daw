import { useEffect } from 'react';
import { getEngine } from './audio/engine';
import { getState } from './state/store';
import LyricPad from './ui/LyricPad';
import RhymePanel from './ui/RhymePanel';
import StepGrid from './ui/StepGrid';
import TransportBar from './ui/TransportBar';
import './rhyme';

export default function App() {
  useEffect(() => {
    // The engine pulls the current pattern each time it schedules, so edits made
    // while the transport runs take effect on the next lookahead window.
    getEngine().setSnapshotProvider(() => {
      const state = getState();
      return { pattern: state.pattern, transport: state.transport };
    });
  }, []);

  return (
    <div className="app">
      <TransportBar />
      <main className="workspace">
        <div className="left-column">
          <StepGrid />
          <LyricPad />
        </div>
        <RhymePanel />
      </main>
    </div>
  );
}
