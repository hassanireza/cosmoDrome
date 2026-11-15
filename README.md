# Cosmodrome

A touch first endless flyer. Drift a small vessel along a causeway above the abyss, hop
stones, break shapes, and face colossi that learn how you move. WebGL2, no game engine
dependency, React only for the HUD.

## Run

```bash
npm ci
npm run dev        # http://localhost:5173/cosmodrome/
npm test           # engine tests (Node 22+)
npm run lint
npm run build
```

Open on a phone for the intended experience. Add to home screen for fullscreen.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Steer | drag anywhere | arrows or A D |
| Hop | swipe up, or tap with a second finger | space or W |
| Weapon | tap a sigil | 1 to 4, Q cycles |
| Pause | pause button | P or Esc |

## Structure

```
src/core      math, rng, config, shared types
src/ai        player model, difficulty, director, spawner, fairness, boss brain, rewards
src/sim       Game (the simulation), track, entities, particles, boss
src/render    WebGL2 renderer, shaders, meshes, scene builder, frame governor
src/audio     procedural adaptive score
src/input     touch gestures, haptics
src/host      GameHost: frame loop and glue
src/ui        React HUD and screens
tests         engine tests
docs          ENGINES.md, DESIGN.md
```

Read `docs/ENGINES.md` for the algorithms and `docs/DESIGN.md` for brand and mobile notes.

## Upgrading from v1

Unzip the update over the repo, then run `./scripts/apply-update.sh` to delete the v1 files
listed in `REMOVED_FILES.txt`. Existing best score and top drifts carry over.
