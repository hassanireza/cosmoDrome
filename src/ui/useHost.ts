import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot, Settings } from '../core/types.ts';
import { GameHost } from '../host/GameHost.ts';

export interface HostHandle {
  host: GameHost | null;
  hud: HudSnapshot | null;
  settings: Settings | null;
  error: string | null;
  setSettings: (s: Settings) => void;
}

/** Mounts the engine against the given elements and mirrors its snapshot into React state. */
export function useHost(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  stageRef: React.RefObject<HTMLDivElement | null>,
): HostHandle {
  const hostRef = useRef<GameHost | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !stageRef.current) return;
    let host: GameHost;
    try {
      host = new GameHost(canvasRef.current, stageRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unsupported');
      return;
    }
    hostRef.current = host;
    if (new URLSearchParams(location.search).has('debug')) host.expose();
    setSettingsState(host.game.settings);
    host.onSnapshot(setHud);
    host.start();
    return () => {
      host.destroy();
      hostRef.current = null;
    };
  }, [canvasRef, stageRef]);

  const setSettings = (s: Settings): void => {
    setSettingsState(s);
    hostRef.current?.applySettings(s);
  };

  return { host: hostRef.current, hud, settings, error, setSettings };
}
