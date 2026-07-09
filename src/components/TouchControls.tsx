import type { PointerEvent } from 'react';
import type { GameEngine } from '../engine/GameEngine';

interface TouchControlsProps {
  engine: GameEngine | null;
  onCycleWeapon: () => void;
}

export function TouchControls({ engine, onCycleWeapon }: TouchControlsProps): React.JSX.Element {
  const holdHandlers = (setter: (v: boolean) => void) => ({
    onPointerDown: (e: PointerEvent) => { e.preventDefault(); setter(true); },
    onPointerUp: () => setter(false),
    onPointerLeave: () => setter(false),
    onPointerCancel: () => setter(false),
  });

  return (
    <div className="touch-controls">
      <button
        className="touch-btn"
        aria-label="Steer left"
        type="button"
        {...holdHandlers((v) => engine?.input.setLeft(v))}
      >
        &#9664;
      </button>
      <button
        className="touch-btn weapon"
        aria-label="Switch weapon"
        type="button"
        onPointerDown={(e) => { e.preventDefault(); onCycleWeapon(); }}
      >
        &#9881;
      </button>
      <button
        className="touch-btn boost"
        aria-label="Hop stones"
        type="button"
        onPointerDown={(e) => { e.preventDefault(); engine?.tryHop(); }}
      >
        &#9650;
      </button>
      <button
        className="touch-btn"
        aria-label="Steer right"
        type="button"
        {...holdHandlers((v) => engine?.input.setRight(v))}
      >
        &#9654;
      </button>
    </div>
  );
}
