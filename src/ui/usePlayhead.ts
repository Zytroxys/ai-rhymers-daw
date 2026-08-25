import { useEffect, useState } from 'react';
import { getEngine } from '../audio/engine';

/** The step currently sounding, or -1 when the transport is stopped. */
export function usePlayhead(): number {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const engine = getEngine();
    const unsubscribe = engine.onStep((next) => setStep(next));
    return () => {
      unsubscribe();
    };
  }, []);

  return step;
}
