import { WEAPONS } from '../engine/config';
import type { HudSnapshot } from '../engine/types';

interface TopBarProps {
  hud: HudSnapshot;
  onCycleWeapon: () => void;
  onToggleMute: () => void;
}

export function TopBar({ hud, onCycleWeapon, onToggleMute }: TopBarProps): React.JSX.Element {
  return (
    <header className="cabinet-top">
      <h1 className="title">COSMODROME</h1>
      <div className="top-actions">
        <button className="chip-btn weapon-chip" type="button" title="Cycle weapon (Q)" onClick={onCycleWeapon}>
          <span className="weapon-chip-label">gun:</span> <span>{WEAPONS[hud.weapon].label}</span>
          <span className="weapon-chip-heat" aria-hidden="true">
            <span className="weapon-chip-heat-fill" style={{ width: `${hud.weaponHeatPct * 100}%` }} />
          </span>
        </button>
        <button className="chip-btn" type="button" aria-pressed={hud.muted} onClick={onToggleMute}>
          {hud.muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
      </div>
    </header>
  );
}
