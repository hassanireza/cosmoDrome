import { useGameEngine } from '../hooks/useGameEngine';
import { TopBar } from './TopBar';
import { Hud } from './Hud';
import { Overlays } from './Overlays';
import { WeaponDock } from './WeaponDock';
import { TouchControls } from './TouchControls';
import type { WeaponKey } from '../engine/types';

export function GameScreen(): React.JSX.Element {
  const { canvasRef, bgCanvasRef, engineRef, hud } = useGameEngine();
  const engine = engineRef.current;

  const start = () => engine?.startGame();
  const resume = () => engine?.togglePause();
  const cycleWeapon = () => engine?.cycleWeapon();
  const selectWeapon = (key: WeaponKey) => engine?.setWeapon(key);
  const toggleMute = () => engine?.toggleMute();

  return (
    <div className="stage">
      <canvas ref={bgCanvasRef} id="bgstars" aria-hidden="true" />

      <main className="cabinet" role="application" aria-label="Cosmodrome, a space racing game">
        <TopBar hud={hud} onCycleWeapon={cycleWeapon} onToggleMute={toggleMute} />

        <div className="viewport">
          <canvas
            ref={canvasRef}
            id="game"
            width={480}
            height={720}
            aria-label="Game viewport, use arrow keys or on screen buttons to steer and fire"
          />

          <Hud hud={hud} engine={engine} />
          <WeaponDock hud={hud} onSelect={selectWeapon} />
          <Overlays hud={hud} onStart={start} onResume={resume} />
        </div>

        <footer className="cabinet-bottom">
          <p className="instructions">
            Dodge asteroids, blast raiders, hop stones, and take down the boss every 5th sector.
          </p>
          <TouchControls engine={engine} onCycleWeapon={cycleWeapon} />
        </footer>
      </main>

      <p className="credit">built with react, typescript, and a from-scratch canvas engine</p>
    </div>
  );
}
