// Fully procedural audio (no asset downloads): rain bed, ambient pad, chimes.
let ctx = null, master, rainGain, padGain;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);

  // Rain: looped noise through a band-pass.
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  noise.connect(bp).connect(lp).connect(rainGain).connect(master); noise.start();

  // Ambient pad: two soft detuned triangles with slow tremolo.
  padGain = ctx.createGain(); padGain.gain.value = 0.025; padGain.connect(master);
  for (const f of [110, 164.8, 220.5]) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0.33;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05;
    const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg).connect(g.gain); lfo.start();
    o.connect(g).connect(padGain); o.start();
  }
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
export const isMuted = () => muted;

export function setRain(level) { // 0..1
  if (!ctx) return;
  rainGain.gain.setTargetAtTime(Math.min(0.18, level * 0.09), ctx.currentTime, 0.3);
}

function tone(freq, t0, dur, vol = 0.12, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

export function sfx(name, i = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'grab': tone(hz(7, 440), t, 0.12, 0.08); tone(hz(12, 440), t + 0.03, 0.1, 0.05); break;
    case 'drop': tone(hz(0, 440), t, 0.15, 0.06); break;
    case 'click': tone(1200, t, 0.05, 0.06, 'square'); break;
    case 'bloom': {
      const n = PENTA[(i * 3) % PENTA.length];
      tone(hz(n), t, 1.2, 0.12); tone(hz(n + 12), t + 0.06, 0.9, 0.05, 'triangle'); break;
    }
    case 'win': [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => tone(hz(s), t + k * 0.09, 1.4, 0.09, k % 2 ? 'triangle' : 'sine')); break;
    case 'sprout': tone(hz(PENTA[i % PENTA.length], 880), t, 0.25, 0.025); break;
  }
}
