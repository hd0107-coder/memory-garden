// 기억정원 · 캔버스로 그리는 VR 패널
import * as THREE from 'three';

// Blender 좌표(x, y, z) → three 좌표
export const B = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
export const yawOf = (dx, dy) => Math.atan2(-dx, dy);
// 화면 UI 물체 (흐림 배경을 만들 때 잠시 숨김)
export const UI_OBJS = new Set();
// 유리 패널 뒤 흐림 효과
export const BLUR = { tex: { value: null }, vp: { value: new THREE.Matrix4() }, on: { value: 0 } };
const PANEL_VS = `varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PANEL_FS = `uniform sampler2D map; uniform sampler2D blurTex; uniform mat4 blurVP; uniform float blurOn;
varying vec2 vUv; varying vec3 vW;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.004) discard;
  vec3 bg = vec3(0.86, 0.9, 0.84);
  if (blurOn > 0.5) {
    vec4 c = blurVP * vec4(vW, 1.0);
    vec2 s = c.xy / c.w * 0.5 + 0.5;
    if (c.w > 0.0) bg = texture2D(blurTex, clamp(s, 0.002, 0.998)).rgb * 1.02 + 0.02;
  }
  gl_FragColor = vec4(mix(bg, t.rgb, t.a), smoothstep(0.0, 0.3, t.a));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const C = {
  green: '#6b9a5b', greenDark: '#4f7d42', greenSoft: '#e3efdc', ink: '#2b2b2b', sub: '#6c6c6c',
  glass: 'rgba(255,255,255,0.2)', glassEdge: 'rgba(255,255,255,0.95)', card: 'rgba(255,255,255,0.48)',
  pill: 'rgba(255,255,255,0.4)', gold: '#f2c14e', goldDark: '#d29a1e', blue: '#5a9bd8', danger: '#c86a5a',
  badge: '#f6d77a', lock: '#b9b9b9'
};

export const ICON = {};
function makePesticideIcon() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#7fb069'; c.beginPath(); c.roundRect(78, 96, 100, 140, 26); c.fill();
  c.fillStyle = '#5e8f4b'; c.fillRect(78, 150, 100, 34);
  c.fillStyle = '#f3efe6'; c.beginPath(); c.roundRect(100, 58, 56, 44, 10); c.fill();
  c.fillStyle = '#e07a5f'; c.beginPath(); c.moveTo(150, 62); c.lineTo(206, 50); c.lineTo(206, 76); c.lineTo(150, 84); c.closePath(); c.fill();
  c.fillStyle = '#4a4a4a'; c.beginPath(); c.roundRect(112, 26, 32, 36, 8); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.85)'; [[218, 40], [228, 62], [216, 84]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); });
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(128, 166, 16, 12, 0, 0, Math.PI * 2); c.fill();
  return cv;
}
export function loadIcons(names, base = 'assets/icons/') {
  ICON.pesticide = makePesticideIcon();
  return Promise.all(names.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { ICON[n] = im; res(); };
    im.onerror = () => res();
    im.src = base + n + '.png';
  })));
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 손으로 그리는 작은 아이콘 (Figma 에셋에 없는 것)
export function drawGlyph(ctx, name, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  const k = s / 100;
  ctx.scale(k, k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (name === 'sprout') {
    ctx.strokeStyle = '#5e8f45'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, 38); ctx.quadraticCurveTo(-2, 10, 0, -6); ctx.stroke();
    ctx.fillStyle = '#7fb85e';
    ctx.beginPath(); ctx.ellipse(-20, -14, 22, 11, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -18, 22, 11, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a3b'; ctx.beginPath(); ctx.ellipse(0, 40, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
  } else if (name === 'ribbon') {
    ctx.fillStyle = '#f3c84b';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-30, -35, -48, -5, -28, 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(30, -35, 48, -5, 28, 8); ctx.closePath(); ctx.fill();
    ctx.fillRect(-18, 2, 10, 38); ctx.fillRect(8, 2, 10, 38);
    ctx.fillStyle = '#e0a92c'; ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI * 2); ctx.fill();
  } else if (name === 'wrap') {
    ctx.fillStyle = '#f4d9e0'; ctx.strokeStyle = '#d9a8b6'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-36, -34); ctx.lineTo(36, -34); ctx.lineTo(14, 40); ctx.lineTo(-14, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(20, -20); ctx.stroke();
  } else if (name === 'water') {
    ctx.fillStyle = '#5a9bd8';
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.bezierCurveTo(30, 0, 30, 36, 0, 36); ctx.bezierCurveTo(-30, 36, -30, 0, 0, -38); ctx.fill();
  } else if (name === 'check') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(-30, 2); ctx.lineTo(-8, 24); ctx.lineTo(32, -20); ctx.stroke();
  } else if (name === 'coin') {
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.goldDark; ctx.lineWidth = 6; ctx.stroke();
  } else if (name === 'back') {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-30, 0); ctx.moveTo(-8, -22); ctx.lineTo(-30, 0); ctx.lineTo(-8, 22); ctx.stroke();
  } else if (name === 'exit') {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(6, -30); ctx.lineTo(30, -30); ctx.lineTo(30, 30); ctx.lineTo(6, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-32, 0); ctx.moveTo(-16, -16); ctx.lineTo(-32, 0); ctx.lineTo(-16, 16); ctx.stroke();
  } else if (name === 'close') {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(22, 22); ctx.moveTo(22, -22); ctx.lineTo(-22, 22); ctx.stroke();
  } else if (name === 'mic') {
    ctx.fillStyle = '#ffffff';
    rr(ctx, -14, -36, 28, 48, 14); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, 40); ctx.stroke();
  } else if (name === 'sun') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24); ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); ctx.stroke(); }
  } else if (name === 'bug') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 6, 18, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -22, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    [[-1, -6], [-1, 6], [-1, 18], [1, -6], [1, 6], [1, 18]].forEach(([sx, y]) => { ctx.beginPath(); ctx.moveTo(sx * 16, y); ctx.lineTo(sx * 32, y - 8); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(-5, -30); ctx.lineTo(-12, -40); ctx.moveTo(5, -30); ctx.lineTo(12, -40); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 30); ctx.stroke();
  } else if (name === 'micOn' || name === 'micOff') {
    ctx.fillStyle = C.ink; rr(ctx, -12, -34, 24, 44, 12); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, -4, 22, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, 32); ctx.stroke();
    if (name === 'micOff') { ctx.strokeStyle = C.danger; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-28, -34); ctx.lineTo(28, 34); ctx.stroke(); }
  } else if (name === 'lock') {
    ctx.fillStyle = '#ffffff';
    rr(ctx, -18, -4, 36, 30, 6); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, -6, 12, Math.PI, 0); ctx.stroke();
  } else if (name === 'box') {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 7;
    rr(ctx, -30, -24, 60, 16, 4); ctx.stroke();
    rr(ctx, -26, -8, 52, 34, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(10, 6); ctx.stroke();
  } else if (name === 'sleep') {
    ctx.fillStyle = '#7a86b8'; ctx.font = `700 46px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('z', -10, 8); ctx.font = `700 30px ${FONT}`; ctx.fillText('z', 18, -16);
  } else if (name === 'butterfly') {
    ctx.fillStyle = '#f2a7b8';
    ctx.beginPath(); ctx.ellipse(-24, -16, 26, 20, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, -16, 26, 20, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6cf6b';
    ctx.beginPath(); ctx.ellipse(-18, 16, 16, 14, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, 16, 16, 14, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-2, -24); ctx.quadraticCurveTo(-10, -40, -18, -42); ctx.moveTo(2, -24); ctx.quadraticCurveTo(10, -40, 18, -42); ctx.stroke();
  } else if (name === 'gear') {
    ctx.strokeStyle = '#5e8a50'; ctx.lineWidth = 8;
    [-18, 0, 18].forEach((y, k) => {
      ctx.beginPath(); ctx.moveTo(-36, y); ctx.lineTo(36, y); ctx.stroke();
      const x = [12, -14, 4][k];
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    });
  } else if (name === 'scissors') {
    ctx.strokeStyle = '#d07a6a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(-16, 22, 12, 0, Math.PI * 2); ctx.arc(16, 22, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#8a8a8a'; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(18, -36); ctx.moveTo(8, 12); ctx.lineTo(-18, -36); ctx.stroke();
  }
  ctx.restore();
}

// 이미지 아이콘 또는 그림 아이콘
export function drawIcon(ctx, name, cx, cy, s) {
  if (!name) return;
  if (ICON[name]) ctx.drawImage(ICON[name], cx - s / 2, cy - s / 2, s, s);
  else drawGlyph(ctx, name, cx, cy, s * 0.8);
}

let panelCount = 0;

export class Panel {
  // pxW/pxH: 캔버스 해상도, widthM: 실제 폭(미터)
  constructor(pxW, pxH, widthM, opts = {}) {
    this.W = pxW; this.H = pxH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const hM = widthM * pxH / pxW;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, blurTex: BLUR.tex, blurVP: BLUR.vp, blurOn: BLUR.on },
      vertexShader: PANEL_VS, fragmentShader: PANEL_FS,
      transparent: true, depthTest: opts.depthTest ?? false, depthWrite: false, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, hM), mat);
    this.mesh.renderOrder = opts.renderOrder ?? (20 + (panelCount++ % 50));
    this.mesh.userData.panel = this;
    UI_OBJS.add(this.mesh);
    this.hits = [];
    this.hover = null;
    this.view = null;
    this.dirty = true;
    this.visible = true;
    this.pressed = null;
    this.pressT = 0;
  }
  setView(fn) { this.view = fn; this.hover = null; this.dirty = true; return this; }
  refresh() { this.dirty = true; }
  show(v = true) { this.mesh.visible = v; this.visible = v; if (!v) this.hover = null; }
  draw() {
    if (!this.dirty || !this.view) return;
    this.dirty = false;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.hits = [];
    this.view(this);
    // 안내 중일 때 눌러야 할 버튼을 주황색으로 반짝이게
    const gid = this.guideId;
    const g = gid && this.hits.find(h => typeof gid === 'function' ? gid(h) : h.id === gid);
    if (g) {
      const a = 0.6 + 0.4 * Math.sin(performance.now() / 260);
      const pad = 12, r = Math.min(60, g.h / 2 + pad);
      ctx.save();
      ctx.shadowColor = 'rgba(240,140,30,0.9)'; ctx.shadowBlur = 30;
      ctx.strokeStyle = `rgba(240,150,40,${a})`; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.roundRect(g.x - pad, g.y - pad, g.w + pad * 2, g.h + pad * 2, r); ctx.stroke();
      ctx.restore();
      if (this.guideText) {
        ctx.save();
        ctx.font = `700 34px ${FONT}`;
        const tw = ctx.measureText(this.guideText).width + 56, th = 64, gap = pad + 24;
        const mid = g.y + g.h / 2, cxg = g.x + g.w / 2;
        // 위 · 오른쪽 · 아래 · 왼쪽 중에서 다른 버튼을 가리지 않는 곳
        const cands = [
          ['right', g.x + g.w + gap, mid - th / 2], ['up', cxg - tw / 2, g.y - gap - th],
          ['left', g.x - gap - tw, mid - th / 2], ['down', cxg - tw / 2, g.y + g.h + gap]
        ];
        const free = ([, x, y]) => x >= 4 && y >= 4 && x + tw <= this.W - 4 && y + th <= this.H - 4 &&
          !this.hits.some(o => o !== g && x < o.x + o.w && x + tw > o.x && y < o.y + o.h && y + th > o.y);
        const [side, bx, by] = cands.find(free) || cands[0];
        ctx.fillStyle = '#f08c1e';
        ctx.beginPath(); ctx.roundRect(bx, by, tw, th, th / 2); ctx.fill();
        ctx.beginPath();
        if (side === 'up') { ctx.moveTo(cxg - 16, by + th - 1); ctx.lineTo(cxg + 16, by + th - 1); ctx.lineTo(cxg, by + th + 18); }
        if (side === 'down') { ctx.moveTo(cxg - 16, by + 1); ctx.lineTo(cxg + 16, by + 1); ctx.lineTo(cxg, by - 18); }
        if (side === 'right') { ctx.moveTo(bx + 1, mid - 16); ctx.lineTo(bx + 1, mid + 16); ctx.lineTo(bx - 18, mid); }
        if (side === 'left') { ctx.moveTo(bx + tw - 1, mid - 16); ctx.lineTo(bx + tw - 1, mid + 16); ctx.lineTo(bx + tw + 18, mid); }
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.guideText, bx + tw / 2, by + th / 2 + 1);
        ctx.restore();
      }
    }
    this.tex.needsUpdate = true;
  }
  // 레이 교차점(uv) → 버튼
  hitAt(uv) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && !h.disabled) return h;
    }
    return null;
  }
  setHover(h) {
    const id = h ? h.id : null;
    if (id !== this.hover) { this.hover = id; this.dirty = true; }
  }
  click(h) {
    if (!h || h.disabled) return false;
    this.pressed = h.id; this.pressT = performance.now(); this.dirty = true;
    setTimeout(() => { this.pressed = null; this.dirty = true; }, 160);
    h.cb && h.cb();
    return true;
  }
  // ---- 그리기 도우미 ----
  glass(x, y, w, h, r = 48, fill = C.glass) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(60,60,40,0.18)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
    rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r); ctx.strokeStyle = C.glassEdge; ctx.lineWidth = 3; ctx.stroke();
  }
  rect(x, y, w, h, r, fill, stroke, lw = 4) {
    const ctx = this.ctx;
    rr(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  circle(cx, cy, r, fill, stroke, lw = 4) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  text(str, x, y, o = {}) {
    const ctx = this.ctx;
    ctx.font = `${o.weight || 500} ${o.size || 40}px ${FONT}`;
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    if (o.maxW) {
      // 자동 줄바꿈
      const lines = wrap(ctx, String(str), o.maxW);
      const lh = (o.size || 40) * (o.lh || 1.35);
      const y0 = y - (lines.length - 1) * lh / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, x, y0 + i * lh));
      return lines.length;
    }
    ctx.fillText(String(str), x, y);
    return 1;
  }
  icon(name, cx, cy, s) { drawIcon(this.ctx, name, cx, cy, s); }
  hit(id, x, y, w, h, cb, extra = {}) {
    this.hits.push({ id, x, y, w, h, cb, ...extra });
  }
  // 버튼: kind = 'primary' | 'secondary' | 'chip' | 'chipOn'
  button(id, x, y, w, h, label, cb, o = {}) {
    const hov = this.hover === id, prs = this.pressed === id;
    const kind = o.kind || 'secondary';
    let fill = kind === 'primary' ? C.green : (kind === 'chipOn' ? C.green : C.pill);
    let tc = (kind === 'primary' || kind === 'chipOn') ? '#ffffff' : C.ink;
    if (o.disabled) { fill = 'rgba(235,235,230,0.5)'; tc = '#a6a6a6'; }
    else if (hov) fill = kind === 'primary' || kind === 'chipOn' ? C.greenDark : '#ffffff';
    const s = prs ? 0.96 : 1;
    const cx = x + w / 2, cy = y + h / 2, ww = w * s, hh = h * s;
    const ctx = this.ctx;
    ctx.save();
    if (!o.disabled) { ctx.shadowColor = 'rgba(40,60,30,0.18)'; ctx.shadowBlur = hov ? 24 : 12; ctx.shadowOffsetY = 4; }
    rr(ctx, cx - ww / 2, cy - hh / 2, ww, hh, o.r ?? hh / 2); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
    if (hov && !o.disabled) { rr(ctx, cx - ww / 2, cy - hh / 2, ww, hh, o.r ?? hh / 2); ctx.strokeStyle = kind === 'primary' ? '#ffffff' : C.green; ctx.lineWidth = 5; ctx.stroke(); }
    else if (kind !== 'primary' && kind !== 'chipOn') { rr(ctx, cx - ww / 2, cy - hh / 2, ww, hh, o.r ?? hh / 2); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke(); }
    if (o.icon) {
      this.icon(o.icon, cx - (o.iconLeft ?? 0), cy - (o.label2 ? 22 : 0) - (o.iconUp ?? 0), o.iconSize || h * 0.5);
    }
    if (label) this.text(label, cx + (o.dx || 0), cy + (o.dy || 0), { size: o.size || Math.round(h * 0.36), weight: o.weight || 700, color: tc });
    this.hit(id, x, y, w, h, cb, { disabled: !!o.disabled, voice: o.voice || [label] });
  }
  // 둥근 아이콘 버튼 (뒤로/나가기)
  roundBtn(id, cx, cy, r, glyph, cb, voice) {
    const hov = this.hover === id;
    this.circle(cx, cy, r, hov ? '#ffffff' : C.pill, hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 5 : 3);
    drawGlyph(this.ctx, glyph, cx, cy, r * 1.1);
    this.hit(id, cx - r, cy - r, 2 * r, 2 * r, cb, { voice });
  }
  // 코인 칩
  coinChip(x, y, coins) {
    this.rect(x, y, 230, 84, 42, C.pill, 'rgba(255,255,255,0.95)', 3);
    drawGlyph(this.ctx, 'coin', x + 50, y + 42, 46);
    this.text(String(coins), x + 140, y + 44, { size: 40, weight: 700 });
  }
  // 아래쪽 음성 안내 알약
  hint(str, y, w = 760) {
    this.rect(this.W / 2 - w / 2, y, w, 64, 32, 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.95)', 3);
    this.text(str, this.W / 2, y + 33, { size: 30, weight: 500, color: '#555' });
  }
  badge(str, cx, cy, fill = C.badge, color = '#5a4a12') {
    const ctx = this.ctx;
    ctx.font = `700 30px ${FONT}`;
    const w = ctx.measureText(str).width + 44;
    this.rect(cx - w / 2, cy - 24, w, 48, 24, fill);
    this.text(str, cx, cy + 1, { size: 30, weight: 700, color });
  }
}

export function wrap(ctx, str, maxW) {
  const out = [];
  str.split('\n').forEach(par => {
    let line = '';
    // 한국어는 글자 단위로도 줄바꿈 가능
    // 중국어 · 일본어 한자는 한 글자씩 끊어서 줄바꿈
    const words = par.match(/[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef“”‘’]|[^\s\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef“”‘’]+|\s+/g) || [];
    for (const w of words) {
      const t = line + w;
      // 쉼표 · 마침표는 줄 맨 앞에 오지 않게 앞줄에 붙임
      if (/^[，。、！？：；）」』”’,.!?:;)]$/.test(w)) { line = t; continue; }
      if (ctx.measureText(t).width > maxW && line.trim()) {
        out.push(line.trim()); line = w.trimStart();
        while (ctx.measureText(line).width > maxW) {
          let i = line.length;
          while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--;
          out.push(line.slice(0, i)); line = line.slice(i);
        }
      } else line = t;
    }
    out.push(line.trim());
  });
  return out;
}

// 떠 있는 작은 말풍선/상태 스프라이트
export class Bubble {
  constructor(pxW, pxH, widthM) {
    this.W = pxW; this.H = pxH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.sprite.scale.set(widthM, widthM * pxH / pxW, 1);
    this.sprite.renderOrder = 15;
    UI_OBJS.add(this.sprite);
  }
  paint(fn) {
    this.ctx.clearRect(0, 0, this.W, this.H);
    fn(this.ctx, this);
    this.tex.needsUpdate = true;
  }
}

export { rr };
