import { WEAPON_ORDER, WEAPONS } from '../engine/config';
import type { HudSnapshot, WeaponKey } from '../engine/types';

interface WeaponDockProps {
  hud: HudSnapshot;
  onSelect: (key: WeaponKey) => void;
}

export function WeaponDock({ hud, onSelect }: WeaponDockProps): React.JSX.Element {
  return (
    <div className="weapon-dock">
      <label className="hud-label" htmlFor="weaponSelect" style={{ position: 'absolute', left: '-9999px' }}>
        weapon
      </label>
      <select
        id="weaponSelect"
        className="weapon-select"
        aria-label="Select weapon"
        value={hud.weapon}
        onChange={(e) => onSelect(e.target.value as WeaponKey)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {WEAPON_ORDER.map((key) => (
          <option key={key} value={key}>{WEAPONS[key].label}</option>
        ))}
      </select>
      <div className="weapon-heat" aria-hidden="true">
        <div className="weapon-heat-fill" style={{ width: `${hud.weaponHeatPct * 100}%` }} />
      </div>
    </div>
  );
}
