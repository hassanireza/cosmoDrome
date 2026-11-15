# Design

## Brand alignment (Abyssal Liturgy)

- Tokens are copied from `hassanireza.github.io/src/styles/tokens.css` into `styles/tokens.css`.
- Type: Cormorant Garamond italic for display and numbers, Jost for body, JetBrains Mono for
  utility labels. Lowercase editorial copy. No em dashes anywhere.
- Colour: five moods (abyssal, slate, ash, tarnish, eclipse tide), all near monochrome. The
  Tidal Halo (a ring with an eclipse) is the single light source and is drawn in the sky shader.
  Bone is the highlight. No neon, no gradients on chrome, hairline borders, no filled buttons.
- **One deliberate extension:** hostile light uses a muted oxide (`#b2806d`) so threats read
  at speed. It appears only inside the 3D scene, never in UI chrome. Remove it from
  `BRAND.oxide` if you want the strict palette.

## Momentum Valley influence

Quiet impossible architecture: a stepped causeway of slabs with seams, floating monoliths,
gates, far staircases, mist rising from the abyss, backlit silhouettes with a rim of halo
light, slow parallax, long fog. Motion is calm; pressure comes from the director, not noise.

## Mobile first

- Portrait, full bleed, `100dvh`, safe area aware, `touch-action: none`, no zoom, no
  text selection, no callout, `overscroll-behavior: none`, pause on tab hide.
- Steer: drag anywhere, relative (the ship does not jump to your finger), 1 Euro filtered.
- Hop: swipe up or tap a second finger. Weapons: 48px sigils in the thumb zone.
- Haptics through `navigator.vibrate` (Android, not iOS Safari). Optional tilt.
- Adaptive resolution (0.5 to 1.0 of device pixels) keeps frame rate steady.
- Wide screens get a centred portrait column.

## Top bar blur fix

Applied exactly as specified: container `padding-top: calc(env(safe-area-inset-top) + 36px)`,
24px on screens 700px tall or less, row padding `8px 12px 10px`, other screens 28px below the
safe area. SCORE, BEST and ROUND labels use opaque colour, weight 400, tight spacing, and
`font-synthesis: none` is set globally.

Extra measures aimed at the likely cause: the v1 full screen grain overlay used a blend mode
over the text, which can soften type on iOS. Grain now lives inside the WebGL composite pass,
and the HUD has no `backdrop-filter`, `text-shadow`, `filter`, or transforms on glyphs.
I could not test on a physical iPhone. If it persists, send the iOS version.

## Render graph (TouchDesigner style)

```
sky shader ─┐
instanced scene (MRT: colour + glow) ─> particles ─> scene target
glow ─> downsample ─> blur H ─> blur V ─> bloom target
scene + bloom ─> composite (light FXAA, tone, vignette, grain, dither) ─> screen
```

The passes mirror a TOP network (GLSL TOP, Blur TOP, Composite TOP), so the same look can be
rebuilt in TouchDesigner for trailers by pasting `SKY_FS` and `COMPOSITE_FS` from
`render/shaders.ts` into GLSL TOPs and mapping the uniforms to a CHOP. TouchDesigner cannot run
inside a browser, so the shipped game uses WebGL2 directly. No `.tox` is included.
