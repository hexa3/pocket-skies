// Handcrafted islands. Coordinates in island-local meters (+z toward the player).
// sun: az (0 = toward player, PI = behind island), el in radians.
export const LEVELS = [
  {
    id: 'l1', name: 'First Light', par: 20,
    hint: 'This sprout is stuck in shadow. Pinch the sun and lift it over the rock.',
    sun: { az: Math.PI, el: 0.16 },
    plants: [{ t: 'bloom', x: 0, z: 0.03, m: 0.6 }],
    rocks: [{ x: 0, z: -0.05, h: 0.1 }],
    clouds: [],
  },
  {
    id: 'l2', name: 'First Rain', par: 30,
    hint: 'Thirsty! Pinch the cloud and drift it over the sprout. Watch the blue ring fill.',
    sun: { az: 2.6, el: 1.1 },
    plants: [{ t: 'bloom', x: 0, z: 0, m: 0 }],
    rocks: [],
    clouds: [{ x: 0.11, y: 0.16, z: -0.07 }],
  },
  {
    id: 'l3', name: 'Shade Lover', par: 25,
    hint: 'Ferns hate the sun. Lower the sun behind the rock so its long shadow covers the fern.',
    sun: { az: 2.0, el: 1.35 },
    plants: [{ t: 'fern', x: 0.05, z: 0.04, m: 0.7 }],
    rocks: [{ x: -0.01, z: -0.01, h: 0.09 }],
    clouds: [],
  },
  {
    id: 'l4', name: 'Desert Heart', par: 25,
    hint: 'Cacti want dry soil and full sun. Move the cloud away and let it bake.',
    sun: { az: 2.8, el: 1.2 },
    plants: [{ t: 'cactus', x: 0, z: 0.02, m: 0.8 }],
    rocks: [],
    clouds: [{ x: 0, y: 0.15, z: 0.02 }],
  },
  {
    id: 'l5', name: 'Two Sides', par: 30,
    hint: 'One sun, two wishes. Find the angle that lights the flower and hides the fern.',
    sun: { az: 2.6, el: 1.3 },
    plants: [{ t: 'bloom', x: 0.075, z: 0, m: 0.6 }, { t: 'fern', x: -0.075, z: 0, m: 0.6 }],
    rocks: [{ x: 0, z: 0, h: 0.09 }],
    clouds: [],
  },
  {
    id: 'l6', name: 'Thirsty Trio', par: 45,
    hint: 'Wet soil stays wet for a while. Water each one, then let the light in.',
    sun: { az: 2.7, el: 1.0 },
    plants: [{ t: 'bloom', x: -0.1, z: 0.04, m: 0 }, { t: 'bloom', x: 0, z: -0.04, m: 0 }, { t: 'bloom', x: 0.1, z: 0.04, m: 0 }],
    rocks: [],
    clouds: [{ x: 0, y: 0.16, z: 0.13 }],
  },
  {
    id: 'l7', name: 'Canyon', par: 60,
    hint: 'Low sun makes long shadows. Careful: ferns drown if you rain on them too long.',
    sun: { az: 3.0, el: 1.4 },
    plants: [{ t: 'fern', x: 0, z: -0.03, m: 0.1 }, { t: 'bloom', x: -0.13, z: 0.08, m: 0.5 }, { t: 'bloom', x: 0.13, z: 0.08, m: 0.5 }],
    rocks: [{ x: -0.055, z: -0.03, h: 0.1 }, { x: 0.055, z: -0.03, h: 0.1 }],
    clouds: [{ x: 0, y: 0.17, z: 0.14 }],
  },
  {
    id: 'l8', name: 'Oasis', par: 50,
    hint: 'Precision rain: water the flower, never the cactus.',
    sun: { az: -2.5, el: 1.2 },
    plants: [{ t: 'cactus', x: 0.04, z: 0.02, m: 0.5 }, { t: 'bloom', x: -0.045, z: 0.02, m: 0 }, { t: 'fern', x: 0.06, z: -0.1, m: 0.5 }],
    rocks: [{ x: 0.1, z: -0.13, h: 0.09 }],
    clouds: [{ x: -0.12, y: 0.15, z: 0.12, r: 0.04 }],
  },
  {
    id: 'l9', name: 'Eclipse', par: 50,
    hint: 'No rocks here. A cloud makes a fine parasol, if its rain falls somewhere else.',
    sun: { az: 3.1, el: 1.45 },
    plants: [{ t: 'fern', x: 0, z: 0, m: 0.45 }, { t: 'bloom', x: -0.11, z: 0.07, m: 0.6 }, { t: 'bloom', x: 0.11, z: 0.07, m: 0.6 }],
    rocks: [],
    clouds: [{ x: -0.09, y: 0.15, z: -0.13 }, { x: 0.09, y: 0.19, z: -0.13 }],
  },
  {
    id: 'l10', name: 'Grand Garden', par: 120,
    hint: 'Everything you have learned. One sky, six wishes.',
    sun: { az: 2.4, el: 1.0 },
    plants: [
      { t: 'fern', x: -0.03, z: -0.11, m: 0.5 }, { t: 'fern', x: 0.15, z: 0.08, m: 0.2 },
      { t: 'bloom', x: -0.13, z: 0.06, m: 0 }, { t: 'bloom', x: 0.02, z: 0.11, m: 0.3 },
      { t: 'cactus', x: 0.04, z: -0.07, m: 0.7 }, { t: 'bloom', x: -0.03, z: 0.01, m: 0.4 },
    ],
    rocks: [{ x: -0.08, z: -0.06, h: 0.1 }, { x: 0.09, z: 0.03, h: 0.08 }],
    clouds: [{ x: -0.15, y: 0.16, z: -0.12 }, { x: 0, y: 0.19, z: 0.2 }],
  },
];

// ---------- Daily island (same for everyone on a given UTC date) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export function dailyLevel(key = todayKey()) {
  const rnd = mulberry32(hash('pocket-skies:' + key));
  const R = (a, b) => a + (b - a) * rnd();
  const far = (pts, x, z, d) => pts.every((p) => Math.hypot(p.x - x, p.z - z) >= d);
  const rocks = [];
  const nRocks = 1 + Math.floor(rnd() * 2);
  for (let tries = 0; rocks.length < nRocks && tries < 200; tries++) {
    const a = R(0, Math.PI * 2), d = R(0.02, 0.12);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (far(rocks, x, z, 0.12)) rocks.push({ x, z, h: R(0.07, 0.1) });
  }
  const plants = [];
  const nPlants = 4 + Math.floor(rnd() * 2);
  const types = ['bloom', 'bloom', 'fern', 'cactus', 'bloom', 'fern'];
  for (let i = 0; i < nPlants; i++) {
    const t = types[Math.floor(rnd() * types.length)];
    for (let tries = 0; tries < 300; tries++) {
      let x, z;
      if (t === 'fern' && rocks.length) { // ferns nest beside a rock
        const r = rocks[Math.floor(rnd() * rocks.length)], a = R(0, Math.PI * 2), d = R(0.055, 0.075);
        x = r.x + Math.sin(a) * d; z = r.z + Math.cos(a) * d;
      } else { const a = R(0, Math.PI * 2), d = R(0, 0.16); x = Math.sin(a) * d; z = Math.cos(a) * d; }
      if (Math.hypot(x, z) > 0.17) continue;
      if (!far(rocks, x, z, 0.05) || !far(plants, x, z, 0.075)) continue;
      plants.push({ t, x, z, m: t === 'cactus' ? R(0.4, 0.8) : R(0, 0.7) });
      break;
    }
  }
  const clouds = [];
  for (let i = 0; i < 2; i++) {
    for (let tries = 0; tries < 100; tries++) {
      const a = R(0, Math.PI * 2), d = R(0.16, 0.24);
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (far(clouds, x, z, 0.12)) { clouds.push({ x, y: R(0.14, 0.2), z }); break; }
    }
  }
  const [y, m, d] = key.split('-');
  return {
    id: 'daily', name: `Daily Island ${d}/${m}`, par: 25 * plants.length, daily: key,
    hint: 'A new island grows every day. Same island for everyone. Keep your streak alive!',
    sun: { az: R(Math.PI * 0.55, Math.PI * 1.45), el: R(0.3, 1.3) }, plants, rocks, clouds,
  };
}
