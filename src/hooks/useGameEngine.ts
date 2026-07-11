import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../engine/GameEngine';
import type { HudSnapshot } from '../engine/types';

const INITIAL_SNAPSHOT: HudSnapshot = {
  state: 'start',
  score: 0,
  best: 0,
  lives: 3,
  sector: 0,
  sectorPct: 0,
  combo: 1,
  comboVisible: false,
  weapon: 'laser',
  weaponHeatPct: 0,
  bossVisible: false,
  bossName: '',
  bossHpPct: 0,
  bossIntroName: '',
  bossIntroTagline: '',
  finalScore: 0,
  isNewBest: false,
  scoreList: [],
  toastMessage: null,
  toastNonce: 0,
  muted: false,
  tiltEnabled: false,
  tiltAvailable: false,
};

export interface UseGameEngineResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.RefObject<GameEngine | null>;
  hud: HudSnapshot;
}

/** Mounts a GameEngine against the provided canvases and keeps a React-friendly HUD snapshot in sync. */
export function useGameEngine(): UseGameEngineResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, bgCanvasRef.current);
    engineRef.current = engine;
    engine.onHud(setHud);
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, bgCanvasRef, engineRef, hud };
}
