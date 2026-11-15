# Engines and algorithms

Cosmodrome v2 is a set of small engines that each own one decision. The simulation
(`src/sim`) has no DOM or WebGL in it, so everything below runs under Node and is tested
(`npm test`).

| Engine | File | Technique | Decides |
| --- | --- | --- | --- |
| Player model | `ai/PlayerModel.ts` | Elo style rating with uncertainty, EWMA telemetry, decayed lane histogram | how skilled, frustrated or bored the player is |
| Dynamic difficulty | `ai/DynamicDifficulty.ts` | PID loop on success rate toward a flow target, dead band, slew limit, mean reversion, mercy and challenge nudges | how hard, as a scalar `d` and a profile |
| Director | `ai/Director.ts` | Four phase intensity machine (build, peak, fade, relax), L4D style | when pressure arrives and when it lifts |
| Spawner | `ai/Spawner.ts`, `ai/Patterns.ts` | UCB1 bandit over pattern archetypes, no repeat memory, tier filter by phase | which pattern comes next |
| Fairness oracle | `ai/Feasibility.ts` | Forward DP over a lane grid, reachable set carried between patterns, hop cooldown aware | proves every pattern is survivable before it spawns |
| Boss brain | `ai/BossBrain.ts` | Regret matching+ (matching pennies), Exp3 adversarial bandit, Stackelberg telegraph, fairness peel | where and how the boss strikes |
| Rewards | `ai/Rewards.ts` | Near miss pay, soft combo decay, variable ratio drops with pity timer | what feels good |
| Track | `sim/Track.ts` | Seeded fractal value noise, pure function of distance | the road |
| Input | `input/InputController.ts` | 1 Euro filter, relative drag, swipe and second finger gestures | how thumbs map to the ship |
| Frame governor | `render/Governor.ts` | Feedback loop on frame time, resolution scaling | keeps 60 fps on weak phones |
| Audio | `audio/AudioEngine.ts` | Markov melody on a pentatonic scale, intensity driven filter and density, generated reverb | the adaptive score |

## Adaptive difficulty

`d = baseline(round) + offset + 0.25 * (theta - baseline)`

- `baseline` is the authored curve, so the game always progresses.
- `offset` is the PID output. Error is `observed success - 0.78`. Updates happen once per
  resolved pattern, are capped at 0.04, ignored inside a 0.04 dead band, and decay with a
  90 second time constant.
- `theta` is the Elo skill estimate. It is saved between sessions so a returning player
  starts near where they left off.
- Every change is slew limited to 0.03 per second. The player should never feel a lurch.
- Profile outputs: speed scale, gap between patterns, max pattern tier, hostile fire rate,
  hitbox forgiveness, telegraph time, boss hit points, pickup bias.
- Players can turn it off ("adaptive tide" in settings). The end screen shows the tide in
  plain words. Hidden difficulty is a design choice, not a secret.

## Boss game theory

1. **Where to strike** is a repeated matching game. Regret matching+ learns a best response
   to the lanes the player really uses; a 12 percent exploration term keeps it from being a
   pure counter. Tests check it concentrates on a habitual lane and stays near uniform
   against random play.
2. **Which shape to use** (aimed, spread, sweep, pincer) is an Exp3 bandit. Its reward is
   engagement, not damage: a near miss scores highest, a clean dodge lowest.
3. **Telegraph** is a Stackelberg commitment: the boss shows its strike before it lands so
   the player can best respond. A fairness check removes lanes until at least three are free
   and one is reachable in the telegraph time.

## Solvability guarantee

`Feasibility.propagate` takes the set of lanes the player could occupy, dilates it by how far
they can move in the time between rows, removes cells blocked by each row, and fails the
pattern if the set empties. The reachable set is carried into the next pattern, so the whole
stream is solvable, not just each piece. Test: 200 consecutive plans across the full
difficulty range.

## Not used, on purpose

An endless single player flyer has no market, no auction and no coalition, so mechanism
design, VCG, Shapley value and similar topics from the Gambit notes have nothing to act on
here. They were left out rather than bolted on.

## Tuning

All constants live in `core/config.ts` (world, weapons, bosses, moods) and at the top of each
engine file. Debug: open the game with `?debug&seed=123`, then use `window.__cosmodrome`.
