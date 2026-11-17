import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { K, makeState, step, allBloomed, starsFor, constrainCloud, constrainSun, sunFromAngles } from './sim.js';
import { LEVELS, dailyLevel, todayKey } from './levels.js';
import { VIS, makeSky, makeIsland, makeDecor, makeScenery, makeRock, CloudView, SunView, PlantView, Burst, makeDomeGuide, makeHomeGarden, makeShadowCatcher } from './world.js';
import { Card, Button } from './ui.js';
import { initAudio, sfx, setRain, setMuted } from './audio.js';
import { GhostHand } from './tutorial.js';
import { MRPlacement } from './mr.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ======================= Renderer / scene =======================
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 200);
const sky = makeSky(); scene.add(sky);
const scenery = makeScenery(scene);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 0.9); scene.add(hemi);

const board = new THREE.Group();
board.position.set(0, 0.95, -0.5);
scene.add(board);
const island = makeIsland(); board.add(island);
island.children[1].castShadow = true; // dirt cone shadows the real desk in MR
const content = new THREE.Group(); board.add(content);
const garden = new THREE.Group(); board.add(garden);
const domeGuide = makeDomeGuide(); board.add(domeGuide);
const shadowCatcher = makeShadowCatcher(); shadowCatcher.position.y = -0.185; board.add(shadowCatcher);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.0015;
board.add(sunLight); board.add(sunLight.target);
function setShadowBounds(s) {
  const c = sunLight.shadow.camera, b = 0.36 * s;
  c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 0.01; c.far = 1.6 * s; c.updateProjectionMatrix();
}
setShadowBounds(1);

const sunView = new SunView(); board.add(sunView.group);
const burst = new Burst(board);
const ghost = new GhostHand(board);

const halo = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.04, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
halo.visible = false; board.add(halo);

const mr = new MRPlacement(scene);

// ======================= Save data =======================
const SAVE_KEY = 'pocketskies.v1';
const save = { stars: {}, best: {}, streak: 0, lastDaily: '', dailyCount: 0, sizeBig: false, muted: false, hc: false, headGaze: false, seenNext: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } };
setMuted(save.muted);
VIS.hc = save.hc;
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
const SUN_TIERS = [[0, 0xffd25e, 'Golden sun'], [10, 0xff9ec4, 'Rose sun'], [20, 0x9ff0ff, 'Ice sun'], [30, 0xffffff, 'Moon-white sun']];
const sunTier = () => SUN_TIERS.filter((t) => totalStars() >= t[0]).pop();

function rebuildGarden() {
  garden.clear();
  garden.add(makeHomeGarden(totalStars(), save.dailyCount));
  sunView.core.material.color.set(sunTier()[1]);
}

// ======================= Level state =======================
let levelDef, state, plantViews = [], cloudViews = [], grabbables = [];
let timer = 0, started = false, won = false, wonTime = 0, menu = null, paused = false;
let introT = 0, idleT = 0, grabbedKinds = new Set(), unlockMsg = '';

const levelIndex = () => LEVELS.findIndex((l) => l.id === levelDef?.id);
const levelSaveId = () => (levelDef.daily ? 'daily:' + levelDef.daily : levelDef.id);

function loadLevel(def) {
  levelDef = def;
  state = makeState(def);
  content.clear();
  plantViews = state.plants.map((p) => { const v = new PlantView(p); content.add(v.group); return v; });
  for (const r of state.rocks) content.add(makeRock(r));
  content.add(makeDecor(state, def.id + (def.daily || '')));
  cloudViews = state.clouds.map((c) => { const v = new CloudView(c); content.add(v.group); return v; });
  grabbables = [
    { kind: 'sun', pos: state.sun, r: 0.045, view: sunView },
    ...cloudViews.map((v) => ({ kind: 'cloud', pos: v.cloud, r: v.cloud.r * 1.25, view: v })),
  ];
  timer = 0; started = false; won = false; introT = 0; idleT = 0; grabbedKinds = new Set(); unlockMsg = '';
  for (const h of allHolders()) h.held = null;
  openMenu(null);
  btnNext.pulse = false;
  drawInfo(true);
  setRain(state.clouds.length ? 0.6 : 0);
}

function nextLevel() {
  save.seenNext = true; persist();
  const i = levelIndex();
  if (levelDef.daily) return loadLevel(LEVELS[0]);
  if (i >= LEVELS.length - 1) return loadLevel(dailyLevel());
  loadLevel(LEVELS[i + 1]);
}

function onWin() {
  won = true; wonTime = timer;
  const id = levelSaveId();
  const tierBefore = sunTier();
  const stars = starsFor(timer, levelDef.par);
  const firstDaily = levelDef.daily && !save.stars[id];
  save.stars[id] = Math.max(save.stars[id] || 0, stars);
  save.best[id] = Math.min(save.best[id] ?? 1e9, timer);
  if (levelDef.daily) {
    const today = levelDef.daily;
    const y = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
    if (save.lastDaily !== today) { save.streak = save.lastDaily === y ? save.streak + 1 : 1; save.lastDaily = today; }
    if (firstDaily) save.dailyCount = (save.dailyCount || 0) + 1;
  }
  persist();
  const tierAfter = sunTier();
  unlockMsg = tierAfter !== tierBefore ? `New: ${tierAfter[2]} unlocked!` : '';
  sfx('win');
  for (const p of state.plants) burst.emit(p.x, 0.06, p.z, 0xffd25e, 30, 0.15);
  btnNext.pulse = true;
  rebuildGarden();
  refreshTiles();
  drawInfo(true);
}

// ======================= UI =======================
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// Info card sits just behind the sun dome, low enough to stay inside narrow-FoV displays.
const info = new Card(0.36, 0.125);
info.group.position.set(0, 0.2, -0.33);
info.group.rotation.x = 0.12;
board.add(info.group);
let infoKey = '', fps = 0;
function drawInfo(force) {
  const n = state.plants.filter((p) => p.bloomed).length, N = state.plants.length;
  const t = won ? wonTime : timer;
  const mrKey = mrMode ? `${mr.placing}|${mr.hasHit}` : '';
  const key = `${levelDef.id}|${n}|${Math.floor(t)}|${won}|${paused}|${save.streak}|${mrKey}|${VIS.hc}|${DEBUG ? Math.round(fps) : ''}`;
  if (!force && key === infoKey) return;
  infoKey = key;
  info.bg = VIS.hc ? 'rgba(0,0,0,1)' : 'rgba(18,22,38,0.86)';
  info.border = VIS.hc ? '#ffd25e' : 'rgba(255,255,255,0.18)';
  const x = info.begin(), W = info.canvas.width, H = info.canvas.height, P = 26;
  if (mrMode && mr.placing) {
    info.text('Place your island', P, P - 4, { size: 36, weight: 800 });
    info.text(mr.hasHit ? 'Look at your desk or table, then pinch to set the island down there.' : 'Look at a desk or table... or just pinch to place it right here.', P, 66, { size: 25, color: '#dbe6ff', maxW: W - P * 2 });
    info.text('It will be waiting in the same spot next time.', P, H - 42, { size: 22, color: '#ffd25e' });
    info.end(); return;
  }
  const title = levelDef.daily ? levelDef.name : `${levelIndex() + 1}. ${levelDef.name}`;
  info.text(title, P, P - 4, { size: 36, weight: 800 });
  const best = save.stars[levelSaveId()] || 0;
  if (best) info.text('★'.repeat(best), W - P, P - 2, { size: 32, align: 'right', color: '#ffd25e' });
  if (won) {
    const s = starsFor(wonTime, levelDef.par);
    info.text(`All bloomed in ${fmt(wonTime)}!  ${starStr(s)}`, P, 68, { size: 31, color: '#9dffb5', weight: 700 });
    const msg = unlockMsg || (levelDef.daily ? `Streak: ${save.streak} day${save.streak === 1 ? '' : 's'}. A new island grows tomorrow.`
      : s < 3 ? `+${s} flower${s > 1 ? 's' : ''} for your garden. Beat ${fmt(levelDef.par)} for 3 stars.` : `+3 flowers for your garden. Poke NEXT!`);
    info.text(msg, P, 112, { size: 24, color: unlockMsg ? '#ffd25e' : '#cfe0ff', maxW: W - P * 2 });
  } else {
    info.text(levelDef.hint, P, 62, { size: 24, color: '#dbe6ff', maxW: W - P * 2, weight: 500 });
    const foot = paused ? 'Paused' : `Blooms ${n}/${N}   ·   ${fmt(t)}   ·   par ${fmt(levelDef.par)}${DEBUG ? `   ·   ${Math.round(fps)} fps` : ''}`;
    info.text(foot, P, H - 42, { size: 22, color: '#ffd25e' });
  }
  info.end();
}

// ---- console (front edge, within easy poke reach) ----
const consoleGrp = new THREE.Group();
consoleGrp.position.set(0, -0.03, 0.255);
consoleGrp.rotation.x = -0.75;
board.add(consoleGrp);
const buttons = [];
const addBtn = (label, onPress, parent, x, y, w = 0.07, h = 0.038, opts) => {
  const b = new Button(label, w, h, onPress, opts); b.group.position.set(x, y, 0); parent.add(b.group); buttons.push(b); return b;
};
const cw = 0.076;
const btnLevels = addBtn('Islands', () => openMenu(menu === 'levels' ? null : 'levels'), consoleGrp, -1.5 * cw, 0);
const btnRetry = addBtn('Retry', () => loadLevel(levelDef.daily ? dailyLevel(levelDef.daily) : levelDef), consoleGrp, -0.5 * cw, 0);
const btnNext = addBtn('Next', () => nextLevel(), consoleGrp, 0.5 * cw, 0, 0.07, 0.038, { accent: 'rgba(40,120,80,0.95)' });
const btnOpts = addBtn('Options', () => openMenu(menu === 'options' ? null : 'options'), consoleGrp, 1.5 * cw, 0);

// ---- pop-up panels (level select / options) float over the island ----
function makePopup(title) {
  const g = new THREE.Group();
  g.position.set(0, 0.12, 0.07); g.rotation.x = -0.3; g.visible = false;
  const bg = new Card(0.4, 0.235, { bg: 'rgba(14,18,34,0.95)' });
  bg.mesh.position.z = -0.006; g.add(bg.group);
  bg.begin(); bg.text(title, 24, 14, { size: 26, weight: 800 }); bg.end();
  board.add(g);
  return g;
}
const levelsPanel = makePopup('Choose an island');
const optionsPanel = makePopup('Options');
const tiles = [];
const TW = 0.088, TH = 0.05, GAP = 0.007;
const tilePos = (i, cols = 4) => [((i % cols) - (cols - 1) / 2) * (TW + GAP), 0.05 - Math.floor(i / cols) * (TH + GAP) - 0.012];
for (let i = 0; i < 12; i++) {
  const [x, y] = tilePos(i);
  if (i < 10) tiles.push(addBtn(`${i + 1}`, () => loadLevel(LEVELS[i]), levelsPanel, x, y, TW, TH, { sub: ' ' }));
  else if (i === 10) tiles.push(addBtn('Daily', () => loadLevel(dailyLevel()), levelsPanel, x, y, TW, TH, { sub: ' ', accent: 'rgba(120,70,150,0.95)' }));
  else tiles.push(addBtn('Back', () => openMenu(null), levelsPanel, x, y, TW, TH, { accent: 'rgba(70,70,90,0.95)' }));
}
const OW = 0.12;
const optPos = (i) => [((i % 3) - 1) * (OW + GAP), 0.045 - Math.floor(i / 3) * (TH + 0.012) - 0.012];
const optBtn = (i, label, sub, fn, accent) => { const [x, y] = optPos(i); return addBtn(label, fn, optionsPanel, x, y, OW, TH + 0.008, { sub, accent }); };
const oSize = optBtn(0, 'Bigger', 'island size', () => { save.sizeBig = !save.sizeBig; persist(); applySize(); if (renderer.xr.isPresenting && !mrMode) needsRecenter = true; refreshTiles(); });
const oHC = optBtn(1, 'High contrast', 'off', () => { save.hc = VIS.hc = !save.hc; persist(); refreshTiles(); drawInfo(true); });
const oGaze = optBtn(2, 'Head gaze', 'off', () => { save.headGaze = !save.headGaze; persist(); refreshTiles(); });
const oSound = optBtn(3, 'Sound', 'on', () => { save.muted = !save.muted; setMuted(save.muted); persist(); refreshTiles(); });
const oMove = optBtn(4, 'Recenter', 'island', () => { if (mrMode) { mr.replace(); openMenu(null); } else needsRecenter = true; });
optBtn(5, 'Back', '', () => openMenu(null), 'rgba(70,70,90,0.95)');

function refreshTiles() {
  LEVELS.forEach((l, i) => tiles[i].set(`${i + 1} ${l.name}`, save.stars[l.id] ? '★'.repeat(save.stars[l.id]) : 'new'));
  const dk = 'daily:' + todayKey();
  tiles[10].set('Daily', save.stars[dk] ? '★'.repeat(save.stars[dk]) : `streak ${save.streak}`);
  oSize.set(save.sizeBig ? 'Smaller' : 'Bigger', 'island size');
  oHC.set('High contrast', save.hc ? 'ON' : 'off', save.hc ? 'rgba(150,110,0,0.95)' : null);
  oGaze.set('Head gaze', save.headGaze ? 'ON: look to act' : 'off', save.headGaze ? 'rgba(150,110,0,0.95)' : null);
  oSound.set('Sound', save.muted ? 'off' : 'on');
  oMove.set(mrMode ? 'Move island' : 'Recenter', mrMode ? 'pick a new spot' : 'in front of me');
}
function openMenu(which) {
  menu = which;
  levelsPanel.visible = which === 'levels';
  optionsPanel.visible = which === 'options';
  content.visible = !which;
  sunView.group.visible = !which;
  for (const h of allHolders()) h.held = null;
  btnLevels.set(which === 'levels' ? 'Close' : 'Islands');
  btnOpts.set(which === 'options' ? 'Close' : 'Options');
}

let pressCool = 0;
function pressButton(b) {
  if (pressCool > 0 || !b.active()) return false;
  pressCool = 0.35; initAudio(); sfx('click'); b.press(); return true;
}

function applySize() {
  const s = save.sizeBig ? 1.45 : 1;
  board.scale.setScalar(s);
  setShadowBounds(s);
}

// ======================= Picking helpers =======================
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();
const scaleNow = () => board.scale.x;
const activeButtons = () => buttons.filter((b) => b.active());
const toLocal = (w) => board.worldToLocal(w.clone());
const posOf = (g, out = new THREE.Vector3()) => board.localToWorld(out.set(g.pos.x, g.pos.y, g.pos.z));
function localRay(o, d) {
  const lo = board.worldToLocal(o.clone());
  const ld = board.worldToLocal(o.clone().add(d)).sub(lo).normalize();
  return { o: lo, d: ld };
}
function raySphere(o, d, c, r) {
  const t = tmpV2.copy(c).sub(o).dot(d);
  if (t < 0) return -1;
  const d2 = tmpV2.copy(c).sub(o).lengthSq() - t * t;
  return d2 < r * r ? t : -1;
}
function rayPlaneY(r, y) {
  if (Math.abs(r.d.y) < 1e-4) return null;
  const t = (y - r.o.y) / r.d.y; if (t < 0) return null;
  return r.o.clone().addScaledVector(r.d, t);
}
function rayPlane(r, p, n) {
  const den = r.d.dot(n); if (Math.abs(den) < 1e-5) return null;
  const t = tmpV2.copy(p).sub(r.o).dot(n) / den; if (t < 0) return null;
  return r.o.clone().addScaledVector(r.d, t);
}
const gameLocked = () => !!menu || (mrMode && mr.placing);

// What would a pinch act on right now? Direct reach first, then the ray.
function findTarget(origin, dir, pinchW) {
  let best = null;
  if (pinchW && !gameLocked()) {
    for (const g of grabbables) {
      const d = posOf(g, tmpV).distanceTo(pinchW);
      if (d < g.r * scaleNow() && (!best || d < best.d)) best = { type: 'grab', g, mode: 'direct', d };
    }
    if (best) return best;
  }
  if (!origin) return null;
  raycaster.set(origin, dir); raycaster.far = 3;
  const hits = raycaster.intersectObjects(activeButtons().map((b) => b.mesh), false);
  if (hits.length) best = { type: 'button', b: hits[0].object.userData.button, mode: 'ray', d: hits[0].distance };
  if (!gameLocked()) {
    for (const g of grabbables) {
      const t = raySphere(origin, dir, posOf(g, new THREE.Vector3()), g.r * 1.2 * scaleNow());
      if (t >= 0 && (!best || t < best.d)) best = { type: 'grab', g, mode: 'ray', d: t };
    }
  }
  return best;
}

// ======================= Holding & dragging =======================
// holder: an XR input, the mouse, or the head-gaze pointer.
function beginHold(holder, target, ctx) {
  const g = target.g;
  const h = { g, mode: target.mode, via: ctx.via, offset: new THREE.Vector3(), start: new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z), handStart: new THREE.Vector3() };
  if (target.mode === 'direct') {
    const pl = toLocal(ctx.pinchW);
    h.handStart.copy(pl); h.offset.copy(h.start).sub(pl);
  } else {
    if (ctx.gripW) h.handStart.copy(toLocal(ctx.gripW));
    const r = localRay(ctx.origin, ctx.dir);
    const hit = rayPlaneY(r, g.pos.y);
    if (hit) h.offset.copy(h.start).sub(hit);
    if (ctx.via === 'mouse') { h.planeN = r.d.clone().negate(); h.planeHit = rayPlane(r, h.start, h.planeN) || h.start.clone(); }
  }
  holder.held = h;
  started = true; grabbedKinds.add(g.kind); idleT = 0;
  sfx('grab'); pulse(holder, 0.5, 30);
}

function updateHold(holder, ctx) {
  const h = holder.held; if (!h) return;
  const g = h.g, p = g.pos;
  const target = new THREE.Vector3();
  if (h.mode === 'direct') {
    if (!ctx.pinchW) return;
    const pl = toLocal(ctx.pinchW);
    if (g.kind === 'cloud') target.copy(pl).add(h.offset);
    else target.copy(h.start).addScaledVector(pl.sub(h.handStart), 1.7);
  } else if (h.via === 'headgaze') {
    const r = localRay(ctx.origin, ctx.dir);
    if (g.kind === 'cloud') { const hit = rayPlaneY(r, p.y); if (!hit) return; target.copy(hit); target.y = p.y; }
    else { const hit = rayPlaneY(r, 0); if (!hit) return; target.set(hit.x, 0.1, hit.z); }
  } else if (h.via === 'mouse') {
    const r = localRay(ctx.origin, ctx.dir);
    if (g.kind === 'cloud') { const hit = rayPlaneY(r, p.y); if (!hit) return; target.copy(hit).add(h.offset); target.y = p.y; }
    else { const hit = rayPlane(r, h.start, h.planeN); if (!hit) return; target.copy(h.start).addScaledVector(hit.sub(h.planeHit), 1.4); }
  } else if (h.via === 'ownray' && g.kind === 'cloud') {
    // controller / hand ray: the cloud slides to where you point
    const r = localRay(ctx.origin, ctx.dir);
    const hit = rayPlaneY(r, p.y); if (!hit) return;
    target.copy(hit).add(h.offset); target.y = p.y;
  } else {
    // sun via any ray, or anything picked by eye gaze / transient pointer: amplified hand motion
    if (!ctx.gripW) return;
    const d = toLocal(ctx.gripW).sub(h.handStart);
    target.copy(h.start).addScaledVector(d, g.kind === 'sun' ? 2.6 : 2.0);
  }
  if (g.kind === 'cloud') constrainCloud(target); else constrainSun(target);
  p.x = target.x; p.y = target.y; p.z = target.z;
}
function pulse(holder, v, ms) { try { holder.source?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch { /* no haptics */ } }

// ======================= XR inputs =======================
const handFactory = new XRHandModelFactory();
const ctrlFactory = new XRControllerModelFactory();
function makeCursor() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
  m.renderOrder = 10; m.visible = false; scene.add(m); return m;
}
function makeRay() {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 }));
  l.visible = false; return l;
}
const inputs = [0, 1, 2, 3].map((i) => {
  const controller = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand(i);
  scene.add(controller, grip, hand);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  grip.add(ctrlFactory.createControllerModel(grip));
  const inp = { i, controller, grip, hand, mode: null, connected: false, source: null, held: null, poke: new Set(), ray: makeRay(), cursor: makeCursor(), target: null, gripModel: null };
  controller.add(inp.ray);
  controller.addEventListener('connected', (e) => {
    const s = e.data;
    inp.connected = true; inp.source = s;
    inp.mode = s.hand ? 'hand' : s.targetRayMode === 'gaze' ? 'gaze' : s.targetRayMode === 'transient-pointer' ? 'transient' : 'controller';
    grip.visible = inp.mode === 'controller';
    refreshTiles();
  });
  controller.addEventListener('disconnected', () => { inp.connected = false; inp.held = null; inp.mode = null; inp.cursor.visible = false; inp.ray.visible = false; });
  controller.addEventListener('selectstart', () => onSelectStart(inp));
  controller.addEventListener('selectend', () => onSelectEnd(inp));
  return inp;
});
const gazeInput = () => inputs.find((i) => i.connected && i.mode === 'gaze');

const joint = (inp, name) => { const j = inp.hand.joints?.[name]; return j && j.visible !== false ? j : null; };
function pinchPoint(inp, out) {
  if (inp.mode === 'hand') {
    const a = joint(inp, 'index-finger-tip'), b = joint(inp, 'thumb-tip');
    if (!a || !b) return null;
    a.getWorldPosition(out); b.getWorldPosition(tmpV2);
    return out.add(tmpV2).multiplyScalar(0.5);
  }
  if (inp.mode === 'controller') return inp.grip.getWorldPosition(out);
  return null; // transient pointers & gaze have no "reach"
}
function gripPoint(inp, out) {
  if (inp.mode === 'hand') { const w = joint(inp, 'wrist'); if (w) return w.getWorldPosition(out); }
  return inp.grip.getWorldPosition(out);
}
function worldRay(obj, o, d) {
  obj.getWorldPosition(o); obj.getWorldQuaternion(tmpQ);
  d.set(0, 0, -1).applyQuaternion(tmpQ);
}
// The ray used for picking: eyes if the device has eye tracking (gaze + pinch), else the input's own ray.
function pickRay(inp, o, d) {
  const gz = inp.mode === 'hand' ? gazeInput() : null;
  if (gz) { worldRay(gz.controller, o, d); return 'gaze'; }
  worldRay(inp.controller, o, d);
  return inp.mode === 'transient' ? 'transient' : 'ownray';
}
function ctxFor(inp) {
  const ctx = { pinchW: pinchPoint(inp, new THREE.Vector3()), gripW: gripPoint(inp, new THREE.Vector3()), origin: new THREE.Vector3(), dir: new THREE.Vector3() };
  ctx.via = pickRay(inp, ctx.origin, ctx.dir);
  return ctx;
}

function onSelectStart(inp) {
  initAudio();
  if (inp.mode === 'gaze') return;
  if (mrMode && mr.placing) { mr.confirm(); sfx('grab'); return; }
  const ctx = ctxFor(inp);
  const t = findTarget(ctx.origin, ctx.dir, ctx.pinchW);
  if (!t) return;
  if (t.type === 'button') { pressButton(t.b); pulse(inp, 0.3, 20); return; }
  beginHold(inp, t, ctx);
}
function onSelectEnd(inp) {
  if (inp.held) { sfx('drop'); inp.held = null; idleT = 0; }
}

// ---- Head-gaze dwell: fully hands-free play (accessibility) ----
const headGaze = { held: null, dwell: 0, dwellKey: null, block: null, still: 0, last: new THREE.Vector3() };
const reticle = new THREE.Group();
{
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.012, 32), ringM); ring.renderOrder = 30;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.009, 32), new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.85, depthTest: false }));
  fill.renderOrder = 31; reticle.add(ring, fill); reticle.userData.fill = fill; reticle.visible = false;
  scene.add(reticle);
}
const keyOf = (t) => (t ? (t.type === 'button' ? t.b : t.g) : null);
function updateHeadGaze(dt, camW, camDir) {
  const fill = reticle.userData.fill;
  if (!save.headGaze || !renderer.xr.isPresenting) { reticle.visible = false; headGaze.held = null; return; }
  reticle.visible = true;
  const ctx = { origin: camW.clone(), dir: camDir.clone(), via: 'headgaze' };
  if (mrMode && mr.placing) {
    headGaze.dwell += dt; fill.scale.setScalar(Math.min(1, headGaze.dwell / 2.5));
    reticle.position.copy(camW).addScaledVector(camDir, 0.6); reticle.lookAt(camW);
    if (headGaze.dwell > 2.5 && mr.hasHit) { mr.confirm(); headGaze.dwell = 0; }
    return;
  }
  if (headGaze.held) {
    updateHold(headGaze, ctx);
    headGaze.held.g.view.hover = 1;
    const p = posOf(headGaze.held.g, new THREE.Vector3());
    headGaze.still = p.distanceTo(headGaze.last) < 0.004 * scaleNow() ? headGaze.still + dt : 0;
    headGaze.last.copy(p);
    fill.scale.setScalar(Math.max(0.001, 1 - headGaze.still / 1.4));
    reticle.position.copy(p); reticle.lookAt(camW);
    if (headGaze.still > 1.4) { headGaze.block = headGaze.held.g; headGaze.held = null; sfx('drop'); idleT = 0; }
    return;
  }
  const t = findTarget(ctx.origin, ctx.dir, null);
  const k = keyOf(t);
  if (k !== headGaze.dwellKey) { headGaze.dwellKey = k; headGaze.dwell = 0; }
  if (k && k === headGaze.block) { fill.scale.setScalar(0.001); }
  else {
    if (k) headGaze.block = null;
    headGaze.dwell = k ? headGaze.dwell + dt : 0;
    fill.scale.setScalar(Math.max(0.001, Math.min(1, headGaze.dwell / 1.1)));
    if (t?.type === 'grab') t.g.view.hover = 1;
    if (t?.type === 'button') t.b.hover = 1;
    if (k && headGaze.dwell >= 1.1) {
      headGaze.dwell = 0; headGaze.block = k;
      if (t.type === 'button') pressButton(t.b);
      else { beginHold(headGaze, { ...t, mode: 'ray' }, ctx); headGaze.still = 0; headGaze.last.copy(posOf(t.g)); }
    }
  }
  reticle.position.copy(camW).addScaledVector(camDir, t ? Math.max(0.2, t.d - 0.01) : 0.6);
  reticle.lookAt(camW);
}

// ======================= Desktop / mouse =======================
const mouse = { isMouse: true, held: null, orbit: null, ndc: new THREE.Vector2(), over: null };
const allHolders = () => [...inputs, mouse, headGaze];
const orbit = { yaw: 0, pitch: 0.5, dist: 0.88 };
function mouseCtx(e) {
  mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse.ndc, camera);
  return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone(), via: 'mouse', pinchW: null };
}
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  initAudio();
  const ctx = mouseCtx(e);
  const t = findTarget(ctx.origin, ctx.dir, null);
  if (t?.type === 'button') { pressButton(t.b); return; }
  if (t?.type === 'grab') { beginHold(mouse, t, ctx); cvs.setPointerCapture(e.pointerId); return; }
  mouse.orbit = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch };
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  const ctx = mouseCtx(e);
  if (mouse.held) updateHold(mouse, ctx);
  else if (mouse.orbit) {
    orbit.yaw = THREE.MathUtils.clamp(mouse.orbit.yaw - (e.clientX - mouse.orbit.x) * 0.005, -1.2, 1.2);
    orbit.pitch = THREE.MathUtils.clamp(mouse.orbit.pitch + (e.clientY - mouse.orbit.y) * 0.004, 0.05, 1.2);
  } else mouse.over = findTarget(ctx.origin, ctx.dir, null);
  cvs.style.cursor = mouse.held ? 'grabbing' : mouse.over ? (mouse.over.type === 'button' ? 'pointer' : 'grab') : 'default';
});
const endMouse = () => { if (mouse.held) { sfx('drop'); idleT = 0; } mouse.held = null; mouse.orbit = null; };
cvs.addEventListener('pointerup', endMouse);
cvs.addEventListener('pointercancel', endMouse);
cvs.addEventListener('wheel', (e) => { orbit.dist = THREE.MathUtils.clamp(orbit.dist + e.deltaY * 0.0006, 0.4, 1.3); }, { passive: true });
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'r') btnRetry.press();
  if (k === 'n') btnNext.press();
  if (k === 'l') btnLevels.press();
  if (k === 'o') btnOpts.press();
  if (k === 'm') oSound.press();
});
function placeDesktopCamera() {
  const s = scaleNow();
  const c = board.position.clone().add(new THREE.Vector3(0, 0.1 * s, 0));
  const dist = orbit.dist * s;
  camera.position.set(c.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * dist, c.y + Math.sin(orbit.pitch) * dist, c.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * dist);
  camera.lookAt(c);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => { paused = document.hidden; });

// ======================= FoV-aware placement =======================
// Read the headset's real per-eye field of view and push the island out until the island,
// sun dome, info card and console all sit inside it (Quest: close & big; VR Glasses: a bit farther).
let deviceFov = null;
function readFov() {
  const cams = renderer.xr.getCamera().cameras;
  if (!cams?.length) return null;
  let up = 9, down = 9, side = 9;
  for (const c of cams) {
    const e = c.projectionMatrix.elements;
    up = Math.min(up, Math.atan((1 + e[9]) / e[5])); down = Math.min(down, Math.atan((1 - e[9]) / e[5]));
    side = Math.min(side, Math.atan((1 + e[8]) / e[0]), Math.atan((1 - e[8]) / e[0]));
  }
  const f = { up, down, side };
  if (params.get('fov') === 'glasses') { f.up = Math.min(f.up, 0.436); f.down = Math.min(f.down, 0.75); f.side = Math.min(f.side, 0.646); }
  return f;
}
const LAYOUT_PTS = [[-0.16, 0.26, -0.33], [0.16, 0.26, -0.33], [0, K.DOME_R, 0], [-0.2, 0, 0], [0.2, 0, 0], [-0.16, -0.05, 0.27], [0.16, -0.05, 0.27], [0, -0.05, 0.27]];
const GAZE_PITCH = 0.48; // ~27° down to the island centre
function fitDistance(f, s) {
  if (!f) return 0.45;
  for (let D = 0.4; D <= 0.8; D += 0.02) {
    const H = D * Math.tan(GAZE_PITCH);
    const ok = LAYOUT_PTS.every(([x, y, z]) => {
      const fwd = D - z * s, vert = -H + y * s, lat = x * s;
      const pitch = Math.atan2(vert, fwd) + GAZE_PITCH, yaw = Math.abs(Math.atan2(lat, fwd));
      return pitch < f.up * 0.92 && -pitch < f.down * 0.92 && yaw < f.side * 0.92;
    });
    if (ok) return D;
  }
  return 0.8;
}

// ======================= Sessions =======================
let needsRecenter = false, mrMode = false, recenterFrames = 0, xrSession = null;
const overlay = document.getElementById('overlay');
async function startSession(mode) {
  initAudio();
  if (!navigator.xr) return;
  const opt = ['local-floor', 'bounded-floor', 'hand-tracking'];
  if (mode === 'immersive-ar') opt.push('hit-test', 'anchors', 'plane-detection');
  try {
    let session;
    try { session = await navigator.xr.requestSession(mode, { optionalFeatures: [...opt, 'eye-tracking'] }); }
    catch { session = await navigator.xr.requestSession(mode, { optionalFeatures: opt }); }
    xrSession = session;
    mrMode = mode === 'immersive-ar';
    sky.visible = scenery.visible = !mrMode;
    shadowCatcher.visible = mrMode;
    renderer.setClearAlpha(mrMode ? 0 : 1);
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation?.(1);
    deviceFov = null;
    needsRecenter = true; recenterFrames = 0;
    if (mrMode) await mr.start(session, renderer.xr.getReferenceSpace());
    refreshTiles();
    overlay.classList.add('hidden');
    session.addEventListener('visibilitychange', () => { paused = session.visibilityState !== 'visible'; });
    session.addEventListener('end', () => {
      mr.end(); xrSession = null;
      sky.visible = scenery.visible = true; shadowCatcher.visible = false; mrMode = false; paused = false;
      board.position.set(0, 0.95, -0.5); board.rotation.set(0, 0, 0);
      refreshTiles(); drawInfo(true);
      overlay.classList.remove('hidden');
    });
  } catch (err) { console.warn(err); alert('Could not start XR session: ' + err.message); }
}
function headPose(frame) {
  const pose = frame?.getViewerPose(renderer.xr.getReferenceSpace());
  if (!pose) return null;
  const p = pose.transform.position, q = pose.transform.orientation;
  const head = new THREE.Vector3(p.x, p.y, p.z);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
  return { head, fwd };
}
function recenter(frame) {
  const hp = headPose(frame); if (!hp) return false;
  if (!deviceFov) deviceFov = readFov();
  const s = scaleNow(), D = fitDistance(deviceFov, s);
  board.position.copy(hp.head).addScaledVector(hp.fwd, D).add(new THREE.Vector3(0, -D * Math.tan(GAZE_PITCH), 0));
  board.rotation.set(0, Math.atan2(-hp.fwd.x, -hp.fwd.z), 0);
  return true;
}
document.getElementById('btn-vr').addEventListener('click', () => startSession('immersive-vr'));
document.getElementById('btn-mr').addEventListener('click', () => startSession('immersive-ar'));
document.getElementById('btn-web').addEventListener('click', () => { initAudio(); overlay.classList.add('hidden'); });
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) document.getElementById('btn-vr').disabled = false; }).catch(() => {});
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => { if (ok) document.getElementById('btn-mr').disabled = false; }).catch(() => {});
}

// ======================= Tutorial (show, don't tell) =======================
const TUT = {
  l1: () => ({ g: grabbables[0], to: new THREE.Vector3(0, 0.235, 0.1) }),
  l2: () => grabbables[1] && ({ g: grabbables[1], to: new THREE.Vector3(0, grabbables[1].pos.y, 0) }),
  l3: () => { const s = sunFromAngles(Math.atan2(-0.06, -0.05), 0.22); return { g: grabbables[0], to: new THREE.Vector3(s.x, s.y, s.z) }; },
  l4: () => grabbables[1] && ({ g: grabbables[1], to: new THREE.Vector3(0.17, grabbables[1].pos.y, 0.1) }),
};
function updateTutorial() {
  const anyHeld = allHolders().some((h) => h.held);
  if (menu || anyHeld || (mrMode && mr.placing)) { ghost.hide(); halo.visible = false; return; }
  if (won) {
    halo.visible = false;
    if (!save.seenNext && (levelDef.id === 'l1' || levelDef.id === 'l2')) {
      const w = btnNext.group.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0, 1).transformDirection(btnNext.group.matrixWorld);
      const nl = n.transformDirection(board.matrixWorld.clone().invert());
      ghost.show('poke', toLocal(w), null, nl);
    } else ghost.hide();
    return;
  }
  const tut = TUT[levelDef.id]?.();
  const first = tut && !grabbedKinds.has(tut.g.kind);
  if (tut && (first || idleT > 14)) {
    const from = new THREE.Vector3(tut.g.pos.x, tut.g.pos.y, tut.g.pos.z);
    ghost.show('pinch', from, tut.to);
    halo.visible = true;
    halo.position.copy(from);
  } else { ghost.hide(); halo.visible = false; }
}

// ======================= Main loop =======================
const clock = new THREE.Clock();
const camLocal = new THREE.Vector3(), camW = new THREE.Vector3(), camDir = new THREE.Vector3(), sunWorldDir = new THREE.Vector3();
const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3(), tipW = new THREE.Vector3();
let rainLevel = -1, fpsAcc = 0, fpsN = 0;
const PLANT_COLORS = { bloom: 0xff7fb0, fern: 0x7fffe0, cactus: 0xff6fa0 };

renderer.setAnimationLoop((time, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  pressCool = Math.max(0, pressCool - dt);
  const xr = renderer.xr.isPresenting;

  // ---- placement ----
  if (xr && mrMode) {
    const hp = headPose(frame);
    if (hp) {
      const res = mr.update(frame, hp.head, hp.fwd);
      if (res) {
        board.position.copy(res.pos).add(new THREE.Vector3(0, 0.185 * scaleNow(), 0));
        board.rotation.set(0, res.yaw, 0);
        needsRecenter = false;
      } else if (mr.placing) recenter(frame); // no surface yet: preview floating in front of you
      else if (needsRecenter) { if (recenter(frame) || ++recenterFrames > 90) needsRecenter = false; }
    }
  } else if (xr && needsRecenter) { if (recenter(frame) || ++recenterFrames > 90) needsRecenter = false; }
  if (!xr) placeDesktopCamera();

  const viewCam = xr ? renderer.xr.getCamera() : camera;
  viewCam.getWorldPosition(camW); viewCam.getWorldDirection(camDir);

  // ---- XR inputs: hover, holds, poke ----
  for (const g of grabbables) g.view.hover = 0;
  const gz = gazeInput();
  for (const inp of inputs) {
    if (!xr || !inp.connected || inp.mode === 'gaze') { inp.ray.visible = false; inp.cursor.visible = false; continue; }
    const ctx = ctxFor(inp);
    if (inp.held) {
      updateHold(inp, ctx);
      inp.held.g.view.hover = 1;
      inp.ray.visible = inp.held.mode === 'ray' && ctx.via === 'ownray';
      if (inp.ray.visible) inp.ray.scale.z = ctx.origin.distanceTo(posOf(inp.held.g, tmpV));
    } else {
      const tg = mrMode && mr.placing ? null : findTarget(ctx.origin, ctx.dir, ctx.pinchW);
      inp.target = tg;
      if (tg?.type === 'grab') tg.g.view.hover = 1;
      if (tg?.type === 'button') tg.b.hover = 1;
      inp.ray.visible = !!tg && tg.mode === 'ray' && ctx.via === 'ownray';
      if (inp.ray.visible) inp.ray.scale.z = tg.d;
    }
    if (inp.mode === 'hand' && ctx.pinchW) {
      inp.cursor.visible = true; inp.cursor.position.copy(ctx.pinchW);
      inp.cursor.material.color.set(inp.held ? 0xffd25e : inp.target?.mode === 'direct' ? 0x9dffb5 : 0xffffff);
      const tip = joint(inp, 'index-finger-tip');
      if (tip) {
        tip.getWorldPosition(tipW);
        for (const b of activeButtons()) {
          if (b.pokeTest(tipW)) { b.hover = 1; if (!inp.poke.has(b)) { inp.poke.add(b); pressButton(b); } }
          else inp.poke.delete(b);
        }
      }
    } else inp.cursor.visible = false;
  }
  if (xr && gz && !(mrMode && mr.placing)) { // eyes highlight what a pinch will grab
    worldRay(gz.controller, tmpO, tmpD);
    const tg = findTarget(tmpO, tmpD, null);
    if (tg?.type === 'grab') tg.g.view.hover = 1;
    if (tg?.type === 'button') tg.b.hover = 1;
  }
  updateHeadGaze(dt, camW, camDir);
  if (!xr && mouse.over?.type === 'grab' && !mouse.held) mouse.over.g.view.hover = 1;
  if (!xr && mouse.over?.type === 'button') mouse.over.b.hover = 1;
  if (mouse.held) mouse.held.g.view.hover = 1;

  // ---- simulation ----
  const anyHeld = allHolders().some((h) => h.held);
  if (!paused && !gameLocked() && !won) {
    if (started) timer += dt;
    idleT = anyHeld ? 0 : idleT + dt;
    for (const p of state.plants) p._q = Math.floor(p.g * 4);
    const bloomed = step(state, dt);
    state.plants.forEach((p, i) => { if (!p.bloomed && Math.floor(p.g * 4) > p._q) sfx('sprout', i + p._q); });
    for (const p of bloomed) { burst.emit(p.x, 0.05, p.z, PLANT_COLORS[p.t], 45); sfx('bloom', state.plants.indexOf(p)); }
    if (allBloomed(state)) onWin();
  }

  // ---- visuals ----
  introT = Math.min(1, introT + dt * 2.5);
  content.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - introT, 3)));
  const isHeld = (g) => allHolders().some((h) => h.held?.g === g);
  for (const v of plantViews) v.update(dt, t);
  cloudViews.forEach((v, i) => v.update(dt, t, isHeld(grabbables[i + 1])));
  camLocal.copy(camW); board.worldToLocal(camLocal);
  sunView.update(dt, t, state.sun, camLocal, isHeld(grabbables[0]));
  domeGuide.visible = isHeld(grabbables[0]);
  burst.update(dt);
  for (const b of buttons) b.update(dt, t);
  island.position.y = mrMode ? 0 : Math.sin(t * 0.8) * 0.002;
  updateTutorial();
  {
    let behind = false;
    const ip = info.group.position, hw = info.w / 2 + 0.02, hh = info.h / 2 + 0.02;
    for (const g of grabbables) {
      if (!isHeld(g)) continue; // only fade while you are moving something across the card
      const d = tmpV.set(g.pos.x, g.pos.y, g.pos.z).sub(camLocal);
      if (Math.abs(d.z) < 1e-4) continue;
      const k = (ip.z - camLocal.z) / d.z;
      if (k <= 0) continue; // card is behind the camera ray
      const x = camLocal.x + d.x * k, y = camLocal.y + d.y * k;
      if (Math.abs(x - ip.x) < hw && Math.abs(y - ip.y) < hh) behind = true;
    }
    const m = info.mesh.material, target = behind && !gameLocked() ? 0.25 : 1;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 8);
  }
  ghost.update(dt, camLocal);
  if (halo.visible) {
    halo.lookAt(camW);
    const k = (t * 1.2) % 1; halo.scale.setScalar(1 + k * 1.2); halo.material.opacity = 0.9 * (1 - k);
  }

  // sun -> light, sky
  const s = state.sun;
  sunLight.position.set(s.x, s.y, s.z).multiplyScalar(2.2);
  const day = THREE.MathUtils.clamp((Math.asin(s.y / K.DOME_R) - 0.12) / 0.7, 0, 1);
  sunLight.intensity = 1.3 + 1.6 * day;
  sunLight.color.setRGB(1, 0.72 + 0.26 * day, 0.5 + 0.42 * day);
  hemi.intensity = (mrMode ? 0.8 : 0.55) + 0.55 * day;
  if (sky.visible) {
    sky.material.uniforms.uDay.value = day;
    sunWorldDir.set(s.x, s.y, s.z).applyQuaternion(board.quaternion).normalize();
    sky.material.uniforms.uSun.value.copy(sunWorldDir);
    sky.position.copy(camW);
  }

  const r = state.clouds.length ? 0.4 + state.plants.filter((p) => p.wet).length * 0.4 : 0;
  if (Math.abs(r - rainLevel) > 0.01) { setRain(paused ? 0 : r); rainLevel = r; }

  drawInfo(false);
  renderer.render(scene, camera);
});

applySize();
rebuildGarden();
refreshTiles();
loadLevel(LEVELS[0]);
if (DEBUG) window.__ps = { get state() { return state; }, inputs, renderer, camera, board, THREE, loadLevel, LEVELS, dailyLevel, mr, ghost, save, btns: { btnNext, btnRetry, btnLevels, btnOpts }, opts: { oHC, oGaze, oSize }, get fps() { return fps; } };
