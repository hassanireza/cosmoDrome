import type { HudSnapshot, Settings } from '../core/types.ts';

interface ScreenProps {
  hud: HudSnapshot;
  onStart: () => void;
  onResume: () => void;
  onMenu: () => void;
  onSettings: () => void;
}

function Scores({ list }: { list: number[] }): React.JSX.Element {
  if (!list.length) return <p className="quiet">no drifts logged yet</p>;
  return (
    <ol className="scores">
      {list.map((s, i) => <li key={i}><span className="rank">{i + 1}</span><span>{s.toLocaleString('en-US')}</span></li>)}
    </ol>
  );
}

export function StartScreen({ hud, onStart, onSettings }: ScreenProps): React.JSX.Element {
  return (
    <section className="screen start" data-ui aria-label="Start">
      <div className="screen-body">
        <h1 className="wordmark">cosmodrome</h1>
        <p className="lede">an endless drift above the dark</p>
        <div className="hint-grid">
          <p><span className="lbl">DRAG</span>steer, anywhere</p>
          <p><span className="lbl">SWIPE UP</span>hop the stone</p>
          <p><span className="lbl">TAP A SIGIL</span>change weapon</p>
        </div>
        <button className="btn" type="button" onClick={onStart}>launch</button>
        <button className="btn-quiet" type="button" onClick={onSettings}>settings</button>
      </div>
      <div className="screen-foot"><p className="lbl">TOP DRIFTS</p><Scores list={hud.scores} /></div>
    </section>
  );
}

export function PauseScreen({ onResume, onMenu, onSettings }: ScreenProps): React.JSX.Element {
  return (
    <section className="screen pause" data-ui aria-label="Paused">
      <div className="screen-body">
        <h2 className="title">held</h2>
        <p className="lede">the void will wait</p>
        <button className="btn" type="button" onClick={onResume}>resume</button>
        <button className="btn-quiet" type="button" onClick={onSettings}>settings</button>
        <button className="btn-quiet" type="button" onClick={onMenu}>leave the drift</button>
      </div>
    </section>
  );
}

export function BossIntro({ hud }: { hud: HudSnapshot }): React.JSX.Element {
  return (
    <section className="screen boss-intro" aria-label="Boss approaching">
      <div className="screen-body">
        <p className="lbl">A SHAPE ON THE HORIZON</p>
        <h2 className="title">{hud.bossName}</h2>
        <p className="lede">{hud.bossTagline}</p>
      </div>
    </section>
  );
}

export function GameOver({ hud, onStart, onMenu }: ScreenProps): React.JSX.Element {
  return (
    <section className="screen over" data-ui aria-label="Run over">
      <div className="screen-body">
        <h2 className="title">hull lost</h2>
        <p className="final">{hud.finalScore.toLocaleString('en-US')}</p>
        {hud.isNewBest && <p className="lbl bright">NEW BEST</p>}
        <p className="lede">{hud.moment}</p>
        <p className="quiet">the tide ended {hud.tide}</p>
        <button className="btn" type="button" onClick={onStart}>relaunch</button>
        <button className="btn-quiet" type="button" onClick={onMenu}>return</button>
      </div>
      <div className="screen-foot"><p className="lbl">TOP DRIFTS</p><Scores list={hud.scores} /></div>
    </section>
  );
}

interface SettingsProps {
  settings: Settings;
  tiltSupported: boolean;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

function Toggle({ label, note, on, onToggle }: { label: string; note: string; on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button className="toggle" type="button" role="switch" aria-checked={on} onClick={onToggle}>
      <span className="toggle-text"><span className="toggle-label">{label}</span><span className="toggle-note">{note}</span></span>
      <span className={`switch${on ? ' on' : ''}`} aria-hidden="true"><span className="knob" /></span>
    </button>
  );
}

export function SettingsSheet({ settings, tiltSupported, onChange, onClose }: SettingsProps): React.JSX.Element {
  const set = (patch: Partial<Settings>): void => onChange({ ...settings, ...patch });
  const quality: Settings['quality'][] = ['auto', 'low', 'high'];
  return (
    <section className="screen settings" data-ui aria-label="Settings">
      <div className="screen-body wide">
        <h2 className="title small">settings</h2>
        <Toggle label="sound" note="a generated score that follows the pressure" on={settings.sound} onToggle={() => set({ sound: !settings.sound })} />
        <Toggle label="haptics" note="short pulses on hits and near misses" on={settings.haptics} onToggle={() => set({ haptics: !settings.haptics })} />
        <Toggle label="adaptive tide" note="difficulty learns from how you fly. turn off for a fixed course" on={settings.adaptive} onToggle={() => set({ adaptive: !settings.adaptive })} />
        {tiltSupported && <Toggle label="tilt steering" note="lean the phone to steer, drag still wins" on={settings.tilt} onToggle={() => set({ tilt: !settings.tilt })} />}
        <Toggle label="reduce motion" note="softer shake, flash and grain" on={settings.reducedMotion} onToggle={() => set({ reducedMotion: !settings.reducedMotion })} />
        <div className="seg" role="radiogroup" aria-label="Graphics quality">
          <span className="toggle-label">graphics</span>
          <div className="seg-row">
            {quality.map((q) => (
              <button key={q} type="button" role="radio" aria-checked={settings.quality === q} className={`seg-btn${settings.quality === q ? ' on' : ''}`} onClick={() => set({ quality: q })}>{q}</button>
            ))}
          </div>
        </div>
        <button className="btn" type="button" onClick={onClose}>done</button>
      </div>
    </section>
  );
}
