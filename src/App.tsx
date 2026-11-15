import { useRef, useState } from 'react';
import './styles/tokens.css';
import './styles/game.css';
import { BossBar, Dock, Toast, TopBar } from './ui/Hud.tsx';
import { BossIntro, GameOver, PauseScreen, SettingsSheet, StartScreen } from './ui/Screens.tsx';
import { useHost } from './ui/useHost.ts';

export default function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { host, hud, settings, error, setSettings } = useHost(canvasRef, stageRef);
  const [showSettings, setShowSettings] = useState(false);

  const state = hud?.state ?? 'menu';
  const live = state === 'playing' || state === 'boss' || state === 'bossintro';

  const props = hud && {
    hud,
    onStart: () => host?.startRun(),
    onResume: () => host?.game.togglePause(),
    onMenu: () => host?.game.toMenu(),
    onSettings: () => setShowSettings(true),
  };

  return (
    <div className="stage" ref={stageRef}>
      <canvas ref={canvasRef} className="gl" aria-label="Cosmodrome game view" />

      {error && (
        <section className="screen" role="alert">
          <div className="screen-body">
            <h1 className="wordmark">cosmodrome</h1>
            <p className="lede">this drift needs WebGL2. Try a recent Safari, Chrome or Firefox.</p>
          </div>
        </section>
      )}

      {hud && props && (
        <>
          {(live || state === 'paused') && <TopBar hud={hud} />}
          <BossBar hud={hud} />
          <Toast message={hud.toast} nonce={hud.toastNonce} />
          {(state === 'playing' || state === 'boss') && (
            <Dock
              hud={hud}
              onWeapon={(k) => host?.game.setWeapon(k)}
              onPause={() => host?.game.togglePause()}
              onHop={() => { if (host) host.game.input.hopQueued = true; }}
            />
          )}
          {state === 'menu' && <StartScreen {...props} />}
          {state === 'paused' && <PauseScreen {...props} />}
          {state === 'bossintro' && <BossIntro hud={hud} />}
          {state === 'gameover' && <GameOver {...props} />}
          {showSettings && settings && (
            <SettingsSheet
              settings={settings}
              tiltSupported={host?.tiltSupported() ?? false}
              onChange={setSettings}
              onClose={() => setShowSettings(false)}
            />
          )}
        </>
      )}

      <div className="rotate" aria-hidden="true"><p>turn your phone upright</p></div>
    </div>
  );
}
