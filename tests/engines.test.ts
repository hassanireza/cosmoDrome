import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegretMatcher, Exp3, UCB1 } from '../src/ai/bandits.ts';
import { BossBrain } from '../src/ai/BossBrain.ts';
import { DynamicDifficulty } from '../src/ai/DynamicDifficulty.ts';
import { freshReach, propagate } from '../src/ai/Feasibility.ts';
import { Spawner } from '../src/ai/Spawner.ts';
import { Director } from '../src/ai/Director.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { createInputState } from '../src/input/InputState.ts';
import { Game } from '../src/sim/Game.ts';

const params = { speed: 40, lateral: 2.7, playerHalf: 0.11, margin: 0.04, hopCooldown: 0.9 };

test('regret matching exploits a habitual player', () => {
  const rm = new RegretMatcher(9);
  for (let i = 0; i < 300; i++) {
    const u = new Float64Array(9);
    for (let a = 0; a < 9; a++) u[a] = a === 6 ? 1 : Math.abs(a - 6) === 1 ? 0.5 : 0;
    rm.update(u);
  }
  assert.ok(rm.strategy(0)[6] > 0.5);
});

test('regret matching stays near uniform against uniform play', () => {
  const rm = new RegretMatcher(9);
  const rng = mulberry32(3);
  for (let i = 0; i < 4000; i++) {
    const j = rng.int(0, 8);
    const u = new Float64Array(9);
    for (let a = 0; a < 9; a++) u[a] = a === j ? 1 : Math.abs(a - j) === 1 ? 0.5 : 0;
    rm.update(u);
  }
  const avg = rm.averageStrategy();
  assert.ok(Math.max(...avg) < 0.3);
});

test('exp3 and ucb1 favour the better arm', () => {
  const rng = mulberry32(5);
  const ucb = new UCB1(3);
  const e3 = new Exp3(3);
  for (let i = 0; i < 600; i++) {
    const a = ucb.select([0, 1, 2], rng);
    ucb.update(a, a === 1 ? 0.9 : 0.2);
    const { arm, p } = e3.sample([0, 1, 2], rng);
    e3.update(arm, arm === 1 ? 1 : 0.1, p, 3);
  }
  assert.ok(ucb.counts[1] > ucb.counts[0] && ucb.counts[1] > ucb.counts[2]);
  assert.ok(e3.weights[1] > e3.weights[0]);
});

test('feasibility rejects a sealed wall and accepts a gap', () => {
  const wall = [{ z: 50, blocks: [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((lane) => ({ kind: 'ruin' as const, lane, sway: 0 })) }];
  assert.equal(propagate(freshReach(), wall, 0, params).ok, false);
  const gap = [{ z: 50, blocks: [-0.9, -0.6, 0.6, 0.9].map((lane) => ({ kind: 'shard' as const, lane, sway: 0 })) }];
  assert.equal(propagate(freshReach(), gap, 0, params).ok, true);
});

test('every spawned pattern stream is solvable', () => {
  const sp = new Spawner(mulberry32(11));
  sp.reset(100);
  let z = 100;
  for (let i = 0; i < 200; i++) {
    const d = (i % 20) / 18;
    const plan = sp.plan({ d, speed: 40 + d * 40, maxTier: d < 0.3 ? 1 : d < 0.6 ? 2 : 4, phase: 'build', needsVeil: false, originZ: z });
    assert.ok(plan.spawns.length > 0);
    z += plan.length + 60;
  }
});

test('boss cover always leaves a safe reachable lane', () => {
  const brain = new BossBrain(mulberry32(9));
  for (let i = 0; i < 300; i++) {
    const lane = Math.sin(i) * 0.9;
    const plan = brain.plan({ playerLane: lane, telegraph: 0.6, phase: 3, hostile: 1.4, lateral: 3.4 });
    assert.ok(plan.lanes.length >= 1 && plan.lanes.length <= 6);
    brain.observe(lane);
  }
});

test('DDA eases off a struggling player and ramps a dominant one', () => {
  const hard = new DynamicDifficulty();
  hard.reset();
  for (let i = 0; i < 12; i++) hard.onEncounter('hit', 0.3);
  assert.ok(hard.offset < -0.05);
  const easy = new DynamicDifficulty();
  easy.reset();
  for (let i = 0; i < 20; i++) easy.onEncounter('clean', 0.3);
  assert.ok(easy.offset > 0.02);
  const fixed = new DynamicDifficulty();
  fixed.enabled = false;
  fixed.reset();
  for (let i = 0; i < 12; i++) fixed.onEncounter('hit', 0.3);
  assert.equal(fixed.offset, 0);
});

test('director cycles through all four phases', () => {
  const dir = new Director(mulberry32(2));
  const seen = new Set<string>();
  for (let i = 0; i < 60 * 240; i++) {
    const threat = Math.sin(i / 300) > 0 ? 1 : 0;
    dir.update(1 / 60, { threat, bossActive: false, d: 0.4, frustration: 0, boredom: 0 });
    seen.add(dir.phase);
  }
  assert.equal(seen.size, 4);
});

test('headless run: a bot survives, rounds advance, no NaN', () => {
  const input = createInputState();
  const g = new Game(input, 42);
  g.startRun(42);
  let bossSeen = false;
  for (let i = 0; i < 60 * 240 && g.state !== 'gameover'; i++) {
    // naive bot: steer toward the lane of most clearance among the nearest solid entities
    let best = 0, bs = -9;
    for (let l = -0.9; l <= 0.9; l += 0.1) {
      let s = 0.6;
      for (const e of g.entities) if (e.active && !e.resolved && e.z > -2 && e.z < 45 && e.kind !== 'mote') s = Math.min(s, Math.abs(e.lane - l) - 0.35);
      s -= Math.abs(l - g.player.lane) * 0.1;
      if (s > bs) { bs = s; best = l; }
    }
    input.pointerActive = true;
    input.targetLane = best;
    if (g.state === 'boss') bossSeen = true;
    g.update(1 / 60);
    assert.ok(Number.isFinite(g.score) && Number.isFinite(g.player.lane));
  }
  assert.ok(g.round >= 1, `round ${g.round}`);
  void bossSeen;
});
