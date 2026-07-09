import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../engine/types';
import type { GameEngine } from '../engine/GameEngine';
import { ShipIcon } from './ShipIcon';

interface HudProps {
  hud: HudSnapshot;
  engine: GameEngine | null;
}

export function Hud({ hud, engine }: HudProps): React.JSX.Element {
  return (
    <>
      <div className="hud hud-left" aria-label="Hull integrity remaining">
        {Array.from({ length: hud.lives }).map((_, i) => <ShipIcon key={i} />)}
      </div>

      <div className="hud hud-right">
        <div className="hud-block">
          <span className="hud-label">score</span>
          <span className="hud-value">{hud.score.toLocaleString()}</span>
        </div>
        <div className="hud-block">
          <span className="hud-label">best</span>
          <span className="hud-value">{hud.best.toLocaleString()}</span>
        </div>
      </div>

      <div className="hud hud-sector">
        <span className="hud-label">sector {hud.sector + 1}</span>
        <div className="sector-bar"><div className="sector-fill" style={{ width: `${hud.sectorPct * 100}%` }} /></div>
      </div>

      <div className={`hud hud-boss${hud.bossVisible ? '' : ' hidden'}`}>
        <span className="hud-label">{hud.bossName}</span>
        <div className="boss-bar"><div className="boss-fill" style={{ width: `${hud.bossHpPct * 100}%` }} /></div>
      </div>

      <ComboTag combo={hud.combo} engine={engine} />
      <Toast message={hud.toastMessage} nonce={hud.toastNonce} />
    </>
  );
}

function ComboTag({ combo, engine }: { combo: number; engine: GameEngine | null }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!engine) return;
    return engine.onCombo(() => {
      setVisible(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setVisible(false), 700);
    });
  }, [engine]);

  return (
    <div className={`combo${visible ? ' show' : ' hidden'}`}>x{combo}</div>
  );
}

function Toast({ message, nonce }: { message: string | null; nonce: number }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (message === null || nonce === 0) return;
    setText(message);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [nonce, message]);

  return (
    <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
