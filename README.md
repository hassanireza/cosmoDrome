# Cosmodrome

A nostalgic Enduro style endless space racer. Steer a starfighter through
asteroid fields, drift around scouts and wrecks, hop over hazard stones,
and take down a sector boss every fifth wave.

Private project, not for redistribution.

## Controls

| Action | Keyboard | Touch | Tilt |
| --- | --- | --- | --- |
| Steer | Left / Right or A / D | left / right buttons | tilt phone left / right |
| Thrust / brake | Up / Down or W / S | keyboard only | -- |
| Hop a stone | space | hop button | -- |
| Cycle weapon | Q | gun button | -- |
| Select weapon directly | 1 through 4 | -- | -- |
| Pause | P or Esc | tap outside canvas | -- |
| Confirm / launch | Enter | on-screen button | -- |

Tilt steering is opt-in via the "tilt steering" toggle above the touch
controls (shown on touch devices only). On iOS it needs to be turned on
with a tap so the browser can show its motion-permission prompt; on other
platforms it turns on immediately. Digital left/right buttons always
override tilt for quick corrections.

## Project structure

```
src/
  engine/
    Physics.ts             pure static math, no DOM access
    config.ts               tunable constants, weapons, palettes, boss defs
    types.ts                shared type definitions
    GameEngine.ts           simulation state, fixed timestep loop, HUD pub/sub
    Renderer.ts              canvas drawing, reads engine state, mutates nothing
    InputController.ts      keyboard, touch, and tilt to InputState
    AudioEngine.ts           synthesized sfx, no audio files
    StorageService.ts       localStorage best score, leaderboard, prefs
    entities/
      Player.ts Obstacle.ts Boss.ts Bolt.ts Particle.ts
  hooks/
    useGameEngine.ts         mounts the engine, exposes a live HudSnapshot
  components/
    GameScreen.tsx TopBar.tsx Hud.tsx
    Overlays.tsx TouchControls.tsx ShipIcon.tsx
  styles/
    game.css                 design tokens, layout, texture
```

## Local development

```bash
npm install
npm run dev
```

```bash
npm run build      # type check with tsc, then production build to dist/
npm run preview    # serve the production build locally
npm run lint       # oxlint across the project
```
