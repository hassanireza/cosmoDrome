import { useEffect, useState } from 'react';
import { WEAPON_ORDER, WEAPONS } from '../core/config.ts';
import type { HudSnapshot, WeaponKey } from '../core/types.ts';
import { HopGlyph, HullGlyph, PauseGlyph, WeaponGlyph } from './Glyphs.tsx';

export function TopBar({ hud }: { hud: HudSnapshot }): React.JSX.Element {
  return (
    <header className="topbar" aria-label="Run status">
      <div className="topbar-row">
        <div className="stat">
          <span className="lbl">SCORE</span>
          <span className="val">{hud.score.toLocaleString('en-US')}</span>
        </div>
        <div className="stat stat-mid">
          <span className="lbl">ROUND</span>
          <span className="val">{hud.round}</span>
        </div>
        <div className="stat stat-end">
          <span className="lbl">BEST</span>
          <span className="val">{hud.best.toLocaleString('en-US')}</span>
        </div>
      </div>
      <div className="roundbar" aria-hidden="true"><div className="roundbar-fill" style={{ width: `${Math.round(hud.roundPct * 100)}%` }} /></div>
      <div className="hulls" aria-label={`${hud.lives} hull remaining`}>
        {Array.from({ length: 5 }, (_, i) => <HullGlyph key={i} lit={i < hud.lives} />)}
        {hud.shield && <span className="veil-tag">veil</span>}
        {hud.combo > 1 && <span className="chain">x{hud.combo}</span>}
      </div>
    </header>
  );
}

export function BossBar({ hud }: { hud: HudSnapshot }): React.JSX.Element | null {
  if (hud.state !== 'boss') return null;
  return (
    <div className="bossbar" aria-label={`${hud.bossName} health`}>
      <span className="lbl">{hud.bossName.toUpperCase()}</span>
      <div className="bossbar-track"><div className="bossbar-fill" style={{ width: `${Math.round(hud.bossPct * 100)}%` }} /></div>
    </div>
  );
}

export function Toast({ message, nonce }: { message: string | null; nonce: number }): React.JSX.Element {
  const [shown, setShown] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!message || nonce === 0) return;
    setText(message);
    setShown(true);
    const id = window.setTimeout(() => setShown(false), 1700);
    return () => window.clearTimeout(id);
  }, [message, nonce]);
  return <div className={`toast${shown ? ' on' : ''}`} role="status" aria-live="polite">{text}</div>;
}

interface DockProps {
  hud: HudSnapshot;
  onWeapon: (k: WeaponKey) => void;
  onPause: () => void;
  onHop: () => void;
}

export function Dock({ hud, onWeapon, onPause, onHop }: DockProps): React.JSX.Element {
  return (
    <nav className="dock" data-ui aria-label="Weapons and actions">
      <button className="dock-btn" type="button" aria-label="Pause" onPointerDown={(e) => { e.preventDefault(); onPause(); }}>
        <PauseGlyph />
      </button>
      <div className="dock-weapons" role="radiogroup" aria-label="Weapon">
        {WEAPON_ORDER.map((k) => {
          const on = hud.weapon === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={WEAPONS[k].label}
              className={`dock-btn weapon${on ? ' on' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); onWeapon(k); }}
            >
              <WeaponGlyph kind={k} />
              {on && <span className="heat" aria-hidden="true"><span className="heat-fill" style={{ width: `${Math.round(hud.heat * 100)}%` }} /></span>}
            </button>
          );
        })}
      </div>
      <button className={`dock-btn hop${hud.hopReady ? ' ready' : ''}`} type="button" aria-label="Hop" onPointerDown={(e) => { e.preventDefault(); onHop(); }}>
        <HopGlyph />
      </button>
    </nav>
  );
}
