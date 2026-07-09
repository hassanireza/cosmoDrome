import type { HudSnapshot } from '../engine/types';

interface OverlaysProps {
  hud: HudSnapshot;
  onStart: () => void;
  onResume: () => void;
}

export function Overlays({ hud, onStart, onResume }: OverlaysProps): React.JSX.Element {
  return (
    <>
      <section className={`overlay${hud.state === 'start' ? '' : ' hidden'}`}>
        <div className="paper-card">
          <p className="eyebrow">rebel pilot training sim</p>
          <h2 className="card-title">COSMODROME</h2>
          <p className="tagline">an endless drift through the dark</p>

          <div className="leaderboard">
            <p className="hud-label">top pilots</p>
            <ScoreList list={hud.scoreList} />
          </div>

          <button className="btn-primary" type="button" onClick={onStart}>launch</button>

          <p className="howto">
            <span>&larr;/&rarr; A/D steer</span>
            <span>&uarr; thrust</span>
            <span>&darr; brake</span>
            <span>space hops</span>
            <span>Q swaps gun</span>
            <span>P pauses</span>
          </p>
        </div>
      </section>

      <section className={`overlay${hud.state === 'bossintro' ? '' : ' hidden'}`}>
        <div className="paper-card boss-card">
          <p className="eyebrow">warning, capital signature detected</p>
          <h2 className="card-title">{hud.bossIntroName}</h2>
          <p className="tagline">{hud.bossIntroTagline}</p>
        </div>
      </section>

      <section className={`overlay${hud.state === 'paused' ? '' : ' hidden'}`}>
        <div className="paper-card small">
          <h2 className="card-title">paused</h2>
          <p className="tagline">the void will wait</p>
          <button className="btn-primary" type="button" onClick={onResume}>resume</button>
        </div>
      </section>

      <section className={`overlay${hud.state === 'gameover' ? '' : ' hidden'}`}>
        <div className="paper-card">
          <h2 className="card-title">hull lost</h2>
          <p className="finalscore"><span>{hud.finalScore.toLocaleString()}</span> <span className="hud-label">points</span></p>
          <p className={`newbest${hud.isNewBest ? '' : ' hidden'}`}>new best score</p>

          <div className="leaderboard">
            <p className="hud-label">top pilots</p>
            <ScoreList list={hud.scoreList} />
          </div>

          <button className="btn-primary" type="button" onClick={onStart}>relaunch</button>
        </div>
      </section>
    </>
  );
}

function ScoreList({ list }: { list: number[] }): React.JSX.Element {
  if (!list.length) {
    return (
      <ol className="score-list">
        <li className="empty">no flights logged yet</li>
      </ol>
    );
  }
  return (
    <ol className="score-list">
      {list.map((score, i) => (
        <li key={i}>
          <span className="rank">{i + 1}</span>
          <span>{score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
