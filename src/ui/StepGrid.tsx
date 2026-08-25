import { getEngine } from '../audio/engine';
import { VOICES } from '../audio/voices';
import { actions, useProject } from '../state/store';
import { usePlayhead } from './usePlayhead';

/** The classic drum-machine grid: one row per voice, one column per 16th. */
export default function StepGrid() {
  const pattern = useProject((s) => s.pattern);
  const playhead = usePlayhead();
  const columns = pattern.bars * pattern.stepsPerBar;

  return (
    <section className="grid-panel">
      <div className="grid-ruler" style={{ gridTemplateColumns: `var(--track-label) repeat(${columns}, 1fr)` }}>
        <div className="track-label" />
        {Array.from({ length: columns }, (_, i) => (
          <div key={i} className={`ruler-cell ${i % pattern.stepsPerBar === 0 ? 'bar' : ''}`}>
            {i % 4 === 0 ? i / 4 + 1 : ''}
          </div>
        ))}
      </div>

      {pattern.tracks.map((track) => {
        const hue = VOICES.find((v) => v.id === track.voice)?.hue ?? 200;
        return (
          <div
            key={track.id}
            className="track-row"
            style={{ gridTemplateColumns: `var(--track-label) repeat(${columns}, 1fr)` }}
          >
            <div className="track-label">
              <button className="name" onClick={() => void getEngine().audition(track.id)}>
                {track.name}
              </button>
              <div className="track-controls">
                <button
                  className={track.muted ? 'mini on' : 'mini'}
                  onClick={() => actions.toggleMute(track.id)}
                  title="Mute"
                >
                  M
                </button>
                <button
                  className={track.soloed ? 'mini on' : 'mini'}
                  onClick={() => actions.toggleSolo(track.id)}
                  title="Solo"
                >
                  S
                </button>
                <button className="mini" onClick={() => actions.clearTrack(track.id)} title="Clear row">
                  ×
                </button>
                <input
                  className="track-gain"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.gain}
                  onChange={(e) => actions.setTrackGain(track.id, Number(e.target.value))}
                  title="Level"
                />
              </div>
            </div>

            {track.steps.slice(0, columns).map((cell, index) => {
              const isBeat = index % 4 === 0;
              const isBar = index % pattern.stepsPerBar === 0;
              return (
                <button
                  key={index}
                  className={[
                    'step',
                    cell.on ? 'on' : '',
                    isBeat ? 'beat' : '',
                    isBar ? 'bar' : '',
                    playhead === index ? 'playing' : '',
                  ].filter(Boolean).join(' ')}
                  style={cell.on ? { background: `hsl(${hue} 70% ${35 + cell.velocity * 25}%)` } : undefined}
                  // Shift-click nudges velocity instead of toggling, so dynamics
                  // stay reachable without a second editor.
                  onClick={(e) => {
                    if (e.shiftKey) {
                      const next = cell.velocity >= 0.95 ? 0.4 : Math.min(1, cell.velocity + 0.2);
                      actions.setStepVelocity(track.id, index, next);
                    } else {
                      actions.toggleStep(track.id, index);
                    }
                  }}
                  aria-label={`${track.name} step ${index + 1}`}
                  aria-pressed={cell.on}
                />
              );
            })}
          </div>
        );
      })}
      <p className="hint">Click a step to toggle · Shift-click to cycle velocity · Click a track name to audition</p>
    </section>
  );
}
