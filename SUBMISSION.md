# Devpost submission: Pocket Skies

**Track:** Gaming · **Division:** New Experience
**Also eligible / pitched for:** Best First Five Minutes · Best Accessibility Forward Experience · Best Reason to Come Back · Boldest Original Concept

## Tagline (≤140)
A tiny island floats in your lap and you are its weather. Pinch the sun, drag the clouds and bloom a garden with nothing but your hands.

## Description (~450 words)

**Inspiration.** The most magical moment in hand tracking is picking up something that "shouldn't" be pickable. We asked what the most impossible thing you could hold is. The answer was the sun. Pocket Skies puts a palm-sized floating island on your lap (or on your real desk in mixed reality) and makes you its weather. You pinch the sun and swing it across the sky, and you pinch a cloud and drift it over a thirsty sprout. Rain patters, shadows slide across the grass, and a flower pops open with a chime.

**The one rule.** Everything comes from one physical idea: *rocks and clouds cast real shadows, and rain falls straight down.* Sunblooms want light and moist soil. Shade ferns want shadow and moisture. Cacti want sun and dry soil. A cloud that waters a flower also shades it, unless you lower the sun so the shadow lands somewhere else. Ferns hide in the long shadows of a low evening sun. A cloud becomes a parasol if its rain falls beside the plant instead of on it. There are no menus of verbs and no tutorial screens. Your hands do it the way you'd expect, and the island answers.

**Designed for the airplane seat.** Every interaction happens inside a 40 cm island within arm's reach, fully seated. Each island takes about a minute, which passes the one-bus-stop test. A new **Daily Island** grows every day, the same for every player, with a streak to keep. Stars reward beating par, but nothing ever fails: plants that bloom stay bloomed.

**Accessibility first.** It is playable with one hand end to end. Far pinch with a hand ray means you never have to reach. Every button works by poke, pinch or controller. **Bigger** mode scales the whole island ×1.45. Plant needs are shown with shapes and icons (sun, moon, droplet, crossed droplet) as well as color, and the moisture ring shows the target band. Sound is optional, there are no timers that punish, and there is no locomotion. Controllers and mouse also work.

**How we built it.** Three.js and WebXR (`immersive-vr` + `immersive-ar` passthrough, `hand-tracking`), deployed as a static site so judges launch it from a link. The garden logic is a pure, unit-tested module. Light is a segment-vs-sphere test from each plant to the sun through rocks and clouds, and the shadow map renders exactly the same occluders, so what you see is what the plant feels. All art and audio are procedural (rain is filtered noise, blooms are pentatonic chimes), so cold start takes seconds. An automated test proves that every handcrafted level and 365 days of daily islands are solvable. We ran hand-interaction tests (pinch-grab, drag, poke) in Meta's IWER emulator with an emulated Quest 3.

**What's next.** Wind and snow as new verbs. A shared co-op island where one player is the sun and the other is the rain. A garden journal that keeps every flower you've bloomed. A level editor so players can share islands.

## How hand interactions are implemented
- **Direct pinch-grab**: the midpoint of the thumb tip and index tip grabs the nearest sun or cloud within a few centimeters. Clouds follow 1:1. The sun moves with amplified relative motion, projected onto its sky dome, so a small wrist movement sweeps sunrise to sunset.
- **Far pinch**: when nothing is in reach, the system hand ray targets objects and buttons, and pinching grabs or presses at a distance.
- **Poke buttons**: the fingertip enters a button volume, with edge-triggering and a cooldown to prevent double presses.
- Visual feedback: a fingertip cursor that changes color on reach and grab, a hover swell, a "pinch me" halo on the first islands, the sun's path dome while held, and rain footprints on the grass.

## Video script (≤ 2:45)
1. 0:00–0:08: MR shot of an island on a real desk. A hand pinches the sun and sweeps it, and shadows race across the grass. Title card.
2. 0:08–0:30: Island 1 (lift the sun, bloom) and Island 2 (drag the rain cloud, the ring fills, the flower pops).
3. 0:30–1:10: The "aha": tilt the sun so the cloud's shadow slides off the flower while rain keeps falling. Fern in a long rock shadow. Cactus drying in the sun.
4. 1:10–1:50: Eclipse level (cloud as parasol), Grand Garden, and the win burst with stars.
5. 1:50–2:20: Accessibility: one hand, far pinch, poke buttons, Bigger mode, icons.
6. 2:20–2:45: Daily Island and streak, "Come back tomorrow." Logo and URL.
