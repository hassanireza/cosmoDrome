import type { PointerEvent } from 'react';
import type { GameEngine } from '../engine/GameEngine';
import type { HudSnapshot } from '../engine/types';

interface TouchControlsProps {
  engine: GameEngine | null;
  hud: HudSnapshot;
  onCycleWeapon: () => void;
  onToggleTilt: () => void;
}

export function TouchControls({ engine, hud, onCycleWeapon, onToggleTilt }: TouchControlsProps): React.JSX.Element {
  const holdHandlers = (setter: (v: boolean) => void) => ({
    onPointerDown: (e: PointerEvent) => { e.preventDefault(); setter(true); },
    onPointerUp: () => setter(false),
    onPointerLeave: () => setter(false),
    onPointerCancel: () => setter(false),
  });

  return (
    <div className="touch-wrap">
      {hud.tiltAvailable && (
        <button
          className="tilt-toggle"
          type="button"
          aria-pressed={hud.tiltEnabled}
          onPointerDown={(e) => { e.preventDefault(); onToggleTilt(); }}
        >
          {hud.tiltEnabled ? 'tilt steering: on' : 'tilt steering: off'}
        </button>
      )}
      <div className="touch-controls">
        <button
          className="touch-btn"
          aria-label="Steer left"
          type="button"
          {...holdHandlers((v) => engine?.input.setLeft(v))}
        >
          <span className="touch-btn-icon">&#9664;</span>
          <span className="touch-btn-label">left</span>
        </button>
        <button
          className="touch-btn weapon"
          aria-label="Switch weapon"
          type="button"
          onPointerDown={(e) => { e.preventDefault(); onCycleWeapon(); }}
        >
          <span className="touch-btn-icon">&#9881;</span>
          <span className="touch-btn-label">gun</span>
        </button>
        <button
          className="touch-btn boost"
          aria-label="Hop over hazard stones"
          type="button"
          onPointerDown={(e) => { e.preventDefault(); engine?.tryHop(); }}
        >
          <span className="touch-btn-icon">&#9650;</span>
          <span className="touch-btn-label">hop</span>
        </button>
        <button
          className="touch-btn"
          aria-label="Steer right"
          type="button"
          {...holdHandlers((v) => engine?.input.setRight(v))}
        >
          <span className="touch-btn-icon">&#9654;</span>
          <span className="touch-btn-label">right</span>
        </button>
      </div>
    </div>
  );
}
