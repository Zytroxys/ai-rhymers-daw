import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getEngine } from '../audio/engine';
import { actions, getState, useProject } from '../state/store';
import type { ProjectState } from '../state/store';

export default function TransportBar() {
  const transport = useProject((s) => s.transport);
  const bars = useProject((s) => s.pattern.bars);
  const name = useProject((s) => s.name);
  const [playing, setPlaying] = useState(false);

  const toggle = useCallback(async () => {
    const engine = getEngine();
    await engine.toggle();
    setPlaying(engine.playing);
  }, []);

  // Space is the one shortcut every DAW has; skip it while typing lyrics.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      event.preventDefault();
      void toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <header className="transport">
      <button className={`play ${playing ? 'on' : ''}`} onClick={() => void toggle()}>
        {playing ? '■ Stop' : '▶ Play'}
      </button>

      <label className="field">
        <span>BPM</span>
        <input
          type="number"
          min={40}
          max={220}
          value={transport.bpm}
          onChange={(e) => actions.setBpm(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>Swing {Math.round(transport.swing * 100)}%</span>
        <input
          type="range"
          min={0}
          max={0.7}
          step={0.01}
          value={transport.swing}
          onChange={(e) => actions.setSwing(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>Bars</span>
        <input
          type="number"
          min={1}
          max={8}
          value={bars}
          onChange={(e) => actions.setBars(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>Master</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={transport.masterGain}
          onChange={(e) => actions.setMasterGain(Number(e.target.value))}
        />
      </label>

      <button className={transport.metronome ? 'toggle on' : 'toggle'} onClick={actions.toggleMetronome}>
        Click
      </button>
      <button className={transport.loop ? 'toggle on' : 'toggle'} onClick={actions.toggleLoop}>
        Loop
      </button>

      <input
        className="project-name"
        value={name}
        onChange={(e) => actions.setName(e.target.value)}
        aria-label="Project name"
      />

      <button className="toggle" onClick={exportProject}>Export</button>
      <label className="toggle file">
        Import
        <input type="file" accept="application/json" onChange={importProject} />
      </label>
    </header>
  );
}

function exportProject() {
  const state = getState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.name || 'project'}.rhymers.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importProject(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      actions.load(JSON.parse(String(reader.result)) as ProjectState);
    } catch {
      window.alert('That file is not a Rhymers project.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
