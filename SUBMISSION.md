# Devpost submission: Pocket Skies

**Track:** Gaming · **Division:** New Experience
**Special awards it is built for:** Best First Five Minutes · Best Accessibility Forward Experience · Best Reason to Come Back · Boldest Original Concept · Best Agentic Interaction
**Link for judges:** https://hexa3.github.io/pocket-skies/ (open in Meta Quest Browser and tap *Play in Mixed Reality*)
**Target launch:** Live now on the web; Meta Horizon Store PWA listing planned Q1 2027.

## Tagline (≤140)
A tiny island sits on your real desk and you are its weather. Pinch the sun, drag the clouds and bloom a garden with just your hands.

## Gallery
Cover/thumbnail: `media/00-cover.jpg`. Then `media/05-pinch-the-sun.jpg`, `media/06-rain-and-light.jpg`, `media/07-garden-and-streak.jpg`, `media/01-first-light-tutorial.png`, `media/02-two-sides-shadow-puzzle.png`, `media/03-eclipse-cloud-parasol.png`, `media/04-grand-garden-bloomed.png`

## Description

**Inspiration.** The most magical moment in hand tracking is picking up something you "shouldn't" be able to hold. So we asked what the most impossible thing to hold is. The answer was the sun. Pocket Skies sets a palm-sized island on your real desk and makes you its weather. Pinch the sun and swing it across the sky, and its shadows sweep across the grass and onto your actual table. Pinch a cloud and drift it over a thirsty sprout. Rain patters down, the soil ring fills, and a flower pops open with a chime.

**One physical rule, many puzzles.** *Rocks and clouds cast real shadows, and rain falls straight down.* Sunblooms want light and moist soil. Shade ferns want shadow and moisture. Cacti want sun and dry soil. A cloud that waters a flower also shades it, unless you lower the sun so the shadow lands beside the flower. Ferns hide in the long shadows of an evening sun. A cloud becomes a parasol if its rain falls next to the plant instead of on it. There are 10 handcrafted islands, plus a **Daily Island** grown procedurally from the date, the same for every player.

**The first five minutes.** There are no menus and no text walls. The game opens straight onto island 1, and a glowing hand icon demonstrates the pinch on the real sun and traces where to drag it. Your first flower blooms in under 30 seconds. After your first win, the hand icon shows you how to poke **Next**. Each of the first four islands teaches exactly one idea by showing it.

**A reason to come back.** Every star you earn plants a permanent flower around your island's rim. Daily Islands grow a fruit tree on a little satellite islet and keep a streak. Star milestones unlock new sun colors. In mixed reality, your island is saved with a **persistent spatial anchor**, so tomorrow it is waiting on the same spot of your desk, a bit more in bloom.

**The Sky Spirit: an agent that actually understands your garden.** A small glowing wisp lives beside the island. Poke **Hint** and it reads the live state of every plant, works out *why* each one is unhappy (thirsty, drowning, sunburnt, stuck in a rock's shadow) and searches hundreds of sun positions and cloud placements with the game's real light model. It then flies to the object, tells you in plain words ("The middle fern is getting sunburnt. Drop the sun here so a shadow covers it."), and the hand icon shows the exact move. Poke **Do it** and the spirit performs the move for you, which is a real assist for players with limited motor control. It isn't scripted: an automated test lets the spirit play alone, and it solves all 10 islands and 365 days of Daily Islands.

**Accessible by default.** Everything is seated within about 40 cm, and the whole game is playable with **one hand**. Far-pinch with the hand ray means you never have to reach. **Eye gaze + pinch** works on devices with eye tracking. A **head-gaze dwell mode** makes the game fully playable with *no hands at all*: look to pick up, look to move, hold still to drop, and dwell on buttons to press them. There is also a **high-contrast mode** and a **Bigger** mode (×1.45). Plant needs are shown with shapes as well as color (sun, moon, droplet, crossed droplet). Nothing can fail, there are no punishing timers, sound is optional, and there's no locomotion. Controllers and a mouse work too.

**Juice.** Butterflies visit every flower you bloom. Stars come out when you drag the sun down to dusk. Rain splashes on the grass, and in MR it drips off the island's edge onto your real desk. Each plant type blooms with its own sound (chime, shimmer, marimba), and the sun hums warmly while you hold it.

**Built for Meta devices.**
- **Passthrough with purpose:** hit-testing and detected-plane outlines let you set the island down on your real desk or table. A persistent anchor remembers the spot, and a shadow-catcher plane makes the island and clouds cast shadows onto your real furniture.
- **Field of view:** the game reads each eye's actual field of view from the headset and moves the island back until the island, sun dome, info card and console all fit inside it. That covers Quest 3 and the narrower Meta VR Glasses, which we tested in Meta's IWER emulator.
- **Input:** hands-first, with direct pinch, ray pinch, fingertip poke, gaze + pinch and transient-pointer input.

**How we built it.** We used Three.js + WebXR (`immersive-ar`/`immersive-vr`, `hand-tracking`, `hit-test`, `plane-detection`, `anchors`) and ship as a static site, so judges launch it from a link in seconds. The garden logic is a pure, unit-tested module. Light is a segment-vs-sphere test from each plant to the sun through rocks and clouds, and the shadow map renders the same occluders, so what you see is what the plant feels. All art and audio are procedural, with no asset downloads: rain is filtered noise and blooms are pentatonic chimes. Static geometry is merged by material, which keeps a full island to about 150 draw calls. **Adaptive quality** watches the real frame rate against the headset's refresh rate and steps down shadow resolution and background scenery if needed, so it stays smooth. An automated test proves every handcrafted level and 365 days of daily islands are solvable. Automated tests in Meta's IWER emulator, on Quest 3 and VR Glasses profiles, exercise the whole flow: pinch-grab, drag, bloom, poke, head-gaze play and MR placement.

**What's next.** Wind and snow as new verbs. Co-op, where one player is the sun and the other is the rain. A garden journal of every flower you've bloomed. A shareable island editor.

## How hand interactions are implemented
- **Direct pinch-grab:** the midpoint of the thumb tip and index tip grabs the nearest sun or cloud within a few centimeters. Clouds follow 1:1. The sun follows amplified relative hand motion projected onto its sky dome, so a small wrist movement sweeps sunrise to sunset.
- **Far pinch:** with nothing in reach, the hand ray (or your eyes, on devices with eye tracking) targets objects and buttons, and a pinch grabs or presses.
- **Poke:** fingertip-volume buttons with edge-triggering and a cooldown.
- **Feedback:** a fingertip cursor that changes color on reach and grab, objects that swell on hover, the sun's path dome while held, rain footprints, live growth and moisture rings, and haptics on controllers.
- **Teaching:** an animated hand icon performs the gesture on the real object (open, pinch, carry, release), with a dashed arc to the goal.

## What excites us about the future of VR
Glasses-sized headsets will live on desks and in laps. We think the best experiences will be small, tactile worlds that share your real space and reward a minute of play, not an hour.

## Video
`media/pocket-skies-trailer.mp4` (1:29, 720p, with soundtrack). Upload it to YouTube as **Public**, titled "Pocket Skies — you are the weather (Meta VR Start 2026)", and paste the link into Devpost.

The trailer shows real gameplay recorded in **Meta's Immersive Web Emulator (IWER)** with an emulated Quest 3, tracked hands and the **Synthetic Environment Module's** home-office room as passthrough. The rules allow this ("via XR Simulator or another equivalent emulator"). Every move in it is a real pinch, poke or gaze input, and the one sped-up section is captioned "time-lapse". Soundtrack: a procedurally composed bed plus the game's own sound events at the moments they happened.

Scenes: island placed on the desk (hit-test + plane detection) → ghost-hand tutorial → pinch the sun → poke Next → drag the rain cloud → Two Sides shadow puzzle → Sky Spirit Hint / Do it → full bloom with butterflies → hands-free head-gaze play → home garden, streak tree and Daily Island → end card.
