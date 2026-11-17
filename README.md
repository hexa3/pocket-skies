# Pocket Skies

**A tiny island floats in your lap. You are its weather.**

Pocket Skies is a hands-first, seated puzzle garden for Meta Quest, playable in VR or in mixed reality on your real desk. You pinch the sun to swing it across the sky and pinch clouds to drift them over the island. Every plant wants something different:

| Plant | Needs | Ring shows |
|---|---|---|
| Sunbloom | sunlight + moist soil | growth (outer) / moisture with target band (inner) |
| Shade fern | shadow + moist soil | |
| Sun cactus | sunlight + dry soil | |

Rocks and clouds cast **real shadows**, and rain falls **straight down**. A cloud that waters a flower also shades it, unless you tilt the sun low enough that the shadow lands somewhere else. That one physical rule produces all the puzzles.

- 10 handcrafted islands that each teach one idea in under a minute
- **Daily Island**: one procedurally grown island per day, the same for everyone, with a streak counter
- Stars for beating par time, no fail states, and no time pressure
- **Mixed reality:** set the island on your real desk (hit-test + plane detection). A persistent anchor brings it back to the same spot next time, and the island and clouds cast shadows onto your real table
- **Show-don't-tell onboarding:** an animated hand icon demonstrates each gesture on the real object
- **Sky Spirit:** a planning agent (`src/agent.js`) that diagnoses unhappy plants, searches sun and cloud positions with the real light model, explains the next move, shows it, and can perform it (**Do it**). It solves every level by itself (`test/agent.test.js`)
- **Home garden:** one permanent flower per star, a streak tree for Daily Islands, and unlockable sun colors
- **Accessibility:** one-handed play, far pinch, eye gaze + pinch, a fully hands-free head-gaze dwell mode, high contrast and a Bigger island
- **FoV-aware:** reads the headset's per-eye field of view and fits the whole play space inside it (Quest 3 and Meta VR Glasses)
- 100% procedural: no downloaded art or audio, so it cold-starts in a couple of seconds

## Controls

| Action | Hands (primary) | Controllers | Browser |
|---|---|---|---|
| Move the sun / a cloud | Pinch it (thumb + index) and move | Grip near it or point + trigger | Drag |
| Far reach | Point your hand ray at it and pinch | Point + trigger | – |
| Buttons | Poke with a fingertip, or point + pinch | Point + trigger | Click |

The console under the island has: Islands, Retry, Next, Bigger/Smaller, Recenter and Sound.

## Run

```bash
npm install
npm run dev        # https is required on Quest; use `npx vite --host` + a tunnel, or deploy
npm test           # solvability check of every level + 365 daily islands
npm run build      # static site in dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

URL flags: `?fps` shows a frame counter, `?debug` exposes `window.__ps` for automated tests, and `?fov=glasses` forces the narrow VR Glasses layout.

`test/xr.html?debug` (add `&device=glasses` for VR Glasses) boots the game inside **IWER** (Meta's Immersive Web Emulation Runtime) with an emulated Quest 3 and tracked hands. It is useful for automated hand-interaction tests on a desktop.

## Tech

Three.js + WebXR (`immersive-vr` and `immersive-ar`, `hand-tracking`, `local-floor`). Logic runs in `src/sim.js`, a pure module with no DOM or three.js, so it is unit-testable. Light is a segment-vs-sphere test from each plant to the sun against rocks and clouds, and the shadow map renders the same occluders, so what you see is what the plant gets.
