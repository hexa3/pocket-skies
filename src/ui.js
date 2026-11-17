import * as THREE from 'three';

const PX = 1400; // canvas pixels per meter

function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

function wrap(x, text, maxW) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// A flat card with a canvas texture; draw() receives the 2D context.
export class Card {
  constructor(w, h, opts = {}) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * PX); this.canvas.height = Math.round(h * PX);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: opts.depthWrite ?? true }));
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.bg = opts.bg ?? 'rgba(18,22,38,0.86)';
    this.border = opts.border ?? 'rgba(255,255,255,0.18)';
  }
  begin() {
    const x = this.ctx, W = this.canvas.width, H = this.canvas.height;
    x.clearRect(0, 0, W, H);
    roundRect(x, 4, 4, W - 8, H - 8, Math.min(W, H) * 0.16);
    x.fillStyle = this.bg; x.fill(); x.lineWidth = 4; x.strokeStyle = this.border; x.stroke();
    return x;
  }
  end() { this.tex.needsUpdate = true; }
  text(str, X, Y, { size = 28, color = '#fff', weight = 600, align = 'left', maxW = 0, lh = 1.25 } = {}) {
    const x = this.ctx;
    x.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    x.fillStyle = color; x.textAlign = align; x.textBaseline = 'top';
    const lines = maxW ? wrap(x, str, maxW) : [str];
    lines.forEach((l, i) => x.fillText(l, X, Y + i * size * lh));
    return Y + lines.length * size * lh;
  }
}

// Pokeable / pinchable / clickable button.
export class Button extends Card {
  constructor(label, w, h, onPress, opts = {}) {
    super(w, h, { bg: opts.bg ?? 'rgba(40,52,92,0.92)', border: opts.border ?? 'rgba(160,190,255,0.5)' });
    this.label = label; this.sub = opts.sub || ''; this.onPress = onPress;
    this.accent = opts.accent || null;
    this.enabled = true; this.hover = 0; this.pressT = 0; this.pulse = false;
    // thin back plate for depth
    const back = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 1.04, 0.006), new THREE.MeshStandardMaterial({ color: 0x1a2040, roughness: 0.6 }));
    back.position.z = -0.0035; this.group.add(back);
    this.mesh.position.z = 0.0005;
    this.mesh.userData.button = this;
    this.draw();
  }
  set(label, sub = this.sub, accent = this.accent) {
    if (label === this.label && sub === this.sub && accent === this.accent) return;
    this.label = label; this.sub = sub; this.accent = accent; this.draw();
  }
  draw() {
    this.bg = this.accent || 'rgba(40,52,92,0.92)';
    const x = this.begin(), W = this.canvas.width, H = this.canvas.height;
    let size = H * (this.sub ? 0.36 : 0.44);
    x.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const mw = x.measureText(this.label).width;
    if (mw > W * 0.86) size *= (W * 0.86) / mw;
    this.text(this.label, W / 2, this.sub ? H * 0.14 : (H - size) / 2, { size, align: 'center', weight: 700 });
    if (this.sub) this.text(this.sub, W / 2, H * 0.58, { size: H * 0.26, align: 'center', color: '#ffd25e', weight: 600 });
    this.end();
  }
  active() {
    if (!this.enabled) return false;
    let o = this.group;
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }
  // world point -> is the fingertip inside the button volume?
  pokeTest(worldP) {
    const l = this.group.worldToLocal(worldP.clone());
    return Math.abs(l.x) < this.w / 2 && Math.abs(l.y) < this.h / 2 && l.z < 0.012 && l.z > -0.03;
  }
  press() {
    if (!this.active()) return;
    this.pressT = 1;
    this.onPress?.(this);
  }
  update(dt, t) {
    this.pressT = Math.max(0, this.pressT - dt * 4);
    const z = -this.pressT * 0.004 + (this.hover ? 0.002 : 0);
    this.mesh.position.z += (z + 0.0005 - this.mesh.position.z) * Math.min(1, dt * 20);
    const s = this.pulse ? 1 + 0.05 * Math.sin(t * 6) : 1;
    this.mesh.scale.setScalar(s);
    this.mesh.material.color.setScalar(this.hover ? 1.25 : 1);
    this.hover = 0;
  }
}
