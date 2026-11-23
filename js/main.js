// 기억정원 · VR 엔진 (장면, 입력, 이동)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Panel, Bubble, C, loadIcons, drawGlyph, drawIcon, FONT, B, yawOf, UI_OBJS, BLUR } from './ui.js?v=21';
import { loadState, saveState } from './data.js?v=21';
import { startGame } from './game.js?v=21';

// Blender 좌표(x, y, z) → three 좌표
const FLOOR_Y = 0.133;

const $ = id => document.getElementById(id);
const E = window.MG = {};
E.state = loadState();
E.save = () => saveState(E.state);

// ---------- 렌더러 / 장면 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3f7');
E.scene = scene;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.set(0, 1.55, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
E.camera = camera; E.rig = rig; E.renderer = renderer;

scene.add(new THREE.HemisphereLight(0xfffbea, 0x9a8f70, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-20, 40, 15);
scene.add(sun);

// 하늘 (세로 그라데이션)
{
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fbfee'); gr.addColorStop(0.5, '#bfe3f7'); gr.addColorStop(1, '#eaf6fb');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.position.copy(B(40, -4, 0)); sky.renderOrder = -1;
  scene.add(sky);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 걸을 수 있는 바닥 ----------
let WALK = null;
E.walkable = (bx, by) => {
  // 울타리 안에서만 다니기
  if (bx < 30.45 || bx > 49.35 || by < -14.85 || by > 5.85) return false;
  if (!WALK) return true;
  const i = Math.round((bx - WALK.x0) / WALK.step), j = Math.round((by - WALK.y0) / WALK.step);
  if (i < 0 || j < 0 || i >= WALK.nx || j >= WALK.ny) return false;
  const h = WALK.h[j][i];
  return h > -0.5 && h <= 0.16;
};
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
floor.position.y = FLOOR_Y; floor.userData.isFloor = true;
scene.add(floor);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fbf6a, transparent: true, opacity: 0.85, depthWrite: false }));
marker.visible = false; marker.renderOrder = 5; UI_OBJS.add(marker);
scene.add(marker);

// ---------- 머리 위치와 방향 ----------
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
E.headWorld = () => camera.getWorldPosition(new THREE.Vector3());
E.headYaw = () => { camera.getWorldDirection(_v); return Math.atan2(-_v.x, -_v.z); };
E.headB = () => { const p = E.headWorld(); return { x: p.x, y: -p.z }; };
E.inXR = () => renderer.xr.isPresenting;

function rotateRig(d) {
  const h = E.headWorld();
  rig.position.sub(h).applyAxisAngle(new THREE.Vector3(0, 1, 0), d).add(h);
  rig.rotation.y += d;
}
E.setPose = (bx, by, yaw) => {
  if (yaw !== undefined) {
    if (E.inXR()) rotateRig(yaw - E.headYaw());
    else { rig.rotation.y = yaw; camera.rotation.set(0, 0, 0); pitch = 0; }
  }
  const h = E.headWorld();
  rig.position.x += bx - h.x; rig.position.z += -by - h.z;
};
// 가장 가까운 걸을 수 있는 곳 찾기
function nearestWalkable(bx, by) {
  for (let r = 0.25; r <= 12; r += 0.25)
    for (let a = 0; a < Math.PI * 2; a += 0.25 / r) {
      const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r;
      if (E.walkable(x, y)) return [x, y];
    }
  return [40.1, -10.5];
}
let stuckT = 0, dbgStuck = 0;
function tryMove(dx, dz) {
  const h = E.headWorld();
  const nx = h.x + dx, nz = h.z + dz;
  // 지금 서 있는 곳이 바닥 밖이면 막지 않고 움직이게 함
  if (!E.walkable(h.x, -h.z)) {
    rig.position.x += dx; rig.position.z += dz;
    stuckT += Math.hypot(dx, dz);
    if (stuckT > 0.6) { stuckT = 0; const [x, y] = nearestWalkable(h.x, -h.z); E.setPose(x, y); }
    return;
  }
  stuckT = 0;
  if (E.walkable(nx, -nz)) { rig.position.x += dx; rig.position.z += dz; }
  else if (E.walkable(nx, -h.z)) rig.position.x += dx;
  else if (E.walkable(h.x, -nz)) rig.position.z += dz;
}

// ---------- 패널 배치 ----------
E.placeInFront = (panel, dist = 1.9, dy = -0.12) => {
  if (!renderer.xr.isPresenting) dist *= 0.72;
  const h = E.headWorld(), yaw = E.headYaw();
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  panel.mesh.position.copy(h).addScaledVector(fwd, dist);
  panel.mesh.position.y = Math.max(1.0, h.y + dy);
  panel.mesh.lookAt(h.x, panel.mesh.position.y, h.z);
};
E.placeAt = (panel, pos, faceTo) => {
  panel.mesh.position.copy(pos);
  panel.mesh.lookAt(faceTo.x, pos.y, faceTo.z);
};

// ---------- 상호작용 대상 ----------
const targets = new Set();
E.addTarget = o => targets.add(o);
E.removeTarget = o => targets.delete(o);
E.panels = new Set();
E.addPanel = (p, parent = scene) => { parent.add(p.mesh); E.panels.add(p); targets.add(p.mesh); return p; };

// ---------- 토스트 / 음성 ----------
const toast = new Panel(1500, 150, 1.25, { renderOrder: 90 });
E.addPanel(toast); toast.show(false);
let toastT = 0;
E.toast = (msg, speak = true, dur = 3800) => {
  toast.setView(P => { P.glass(10, 10, P.W - 20, P.H - 20, 64, 'rgba(255,255,255,0.9)'); P.text(msg, P.W / 2, P.H / 2 + 2, { size: 50, weight: 700, maxW: P.W - 90 }); });
  E.placeInFront(toast, 1.6, -0.42);
  toast.show(true); toastT = performance.now() + dur;
  if (speak) E.say(msg);
  $('toast').textContent = msg; $('toast').style.opacity = 1;
};
E.say = text => {
  if (!E.state.settings.tts || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[“”"]/g, ''));
    u.lang = 'ko-KR'; u.rate = 1.0; u.pitch = 1.0;
    const ko = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
    // 더 자연스러운 목소리를 먼저 고름
    const pick = ko.find(v => /natural|online|neural/i.test(v.name)) || ko.find(v => /google/i.test(v.name)) || ko.find(v => /yuna|sora|heami/i.test(v.name)) || ko[0];
    if (pick) u.voice = pick;
    duck(true); u.onend = () => duck(false);
    speechSynthesis.speak(u);
  } catch (e) { /* 음성 출력 없음 */ }
};

// ---------- 걸어가기 안내 표시 ----------
const beacon = new THREE.Group();
{
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd98a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  col.position.y = 1.3; beacon.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b9a5b, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.y = FLOOR_Y + 0.01; beacon.add(ring);
  beacon.userData.label = new Bubble(700, 150, 1.0);
  beacon.userData.label.sprite.position.y = 2.9; beacon.add(beacon.userData.label.sprite);
  beacon.visible = false; scene.add(beacon); UI_OBJS.add(beacon);
}
let beaconZone = null;
E.beacon = zone => {
  beaconZone = zone;
  beacon.visible = !!zone;
  if (!zone) return;
  beacon.position.copy(B(zone.stand[0], zone.stand[1], 0));
  beacon.userData.label.paint((ctx, b) => {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.roundRect(8, 8, b.W - 16, b.H - 16, 60); ctx.fill();
    ctx.fillStyle = C.ink; ctx.font = `700 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(zone.name, b.W / 2, b.H / 2 + 4);
  });
};

// ---------- 손목 시계 패널 (왼손) ----------
const watch = new Panel(640, 300, 0.15, { renderOrder: 80, depthTest: true });
E.watch = watch;
E.listening = false;
E.refreshWatch = () => watch.setView(P => {
  P.glass(6, 6, P.W - 12, P.H - 12, 50, 'rgba(255,255,255,0.92)');
  drawGlyph(P.ctx, 'coin', 70, 80, 70); P.text(E.state.coins, 190, 82, { size: 62, weight: 700, align: 'left' });
  P.text(E.listening ? '듣고 있어요…' : 'X 버튼: 메뉴', P.W / 2, 175, { size: 46, weight: 700, color: E.listening ? C.green : C.ink });
  P.text('쥐기 버튼: 말하기', P.W / 2, 245, { size: 38, color: C.sub });
});

// ---------- 컨트롤러 ----------
const pointers = [];
const raycaster = new THREE.Raycaster();
const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  line.scale.z = 3; ctrl.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  dot.renderOrder = 99; dot.visible = false; scene.add(dot);
  const ptr = { kind: 'xr', ctrl, line, dot, src: null, hover: null, hit: null, turnArmed: true };
  ctrl.addEventListener('connected', e => { ptr.src = e.data; ctrl.visible = e.data.targetRayMode === 'tracked-pointer'; if (e.data.handedness === 'left') attachWatch(i); });
  ctrl.addEventListener('disconnected', () => { ptr.src = null; });
  ctrl.addEventListener('selectstart', () => doSelect(ptr));
  ctrl.addEventListener('selectend', () => doRelease(ptr));
  ctrl.addEventListener('squeezestart', () => E.voiceStart());
  ctrl.addEventListener('squeezeend', () => E.voiceStop());
  rig.add(ctrl);
  const grip = renderer.xr.getControllerGrip(i);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.6 }));
  grip.add(knob); rig.add(grip);
  ptr.grip = grip;
  pointers.push(ptr);
}
function attachWatch(i) {
  const grip = pointers[i].grip;
  watch.mesh.position.set(0, 0.06, 0.06);
  watch.mesh.rotation.set(-Math.PI / 2.6, 0, 0);
  grip.add(watch.mesh); E.panels.add(watch);
  E.refreshWatch();
}
// 마우스 (화면 모드)
const mouse = { kind: 'mouse', ndc: new THREE.Vector2(0, 0), hover: null, hit: null, active: false, dot: null };
pointers.push(mouse);

// 들고 있는 물건 (비료, 물뿌리개, 씨앗)
const carrySprite = new Bubble(200, 200, 0.14);
carrySprite.sprite.visible = false; scene.add(carrySprite.sprite);
E.carrying = null;
E.carry = item => {
  if (item) item.t0 = performance.now();
  E.carrying = item;
  carrySprite.sprite.visible = !!item;
  if (item) carrySprite.paint((ctx, b) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(100, 100, 92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.green; ctx.lineWidth = 8; ctx.stroke();
    drawIcon(ctx, item.icon, 100, 100, 130);
  });
};

function interactiveList() {
  const arr = [];
  for (const o of targets) {
    if (!o.visible) continue;
    let p = o.parent, ok = true;
    while (p) { if (!p.visible) { ok = false; break; } p = p.parent; }
    if (ok) arr.push(o);
  }
  arr.push(floor);
  return arr;
}

function updatePointer(ptr, list) {
  if (ptr.kind === 'xr') {
    if (!ptr.src || !E.inXR()) { ptr.line.visible = false; ptr.dot.visible = false; return; }
    ptr.line.visible = true;
    ptr.ctrl.updateMatrixWorld();
    raycaster.ray.origin.setFromMatrixPosition(ptr.ctrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyQuaternion(ptr.ctrl.getWorldQuaternion(_q));
  } else {
    if (E.inXR() || !mouse.active) return;
    raycaster.setFromCamera(ptr.ndc, camera);
  }
  raycaster.far = 30;
  const hits = raycaster.intersectObjects(list, false);
  let hit = null;
  for (const h of hits) {
    const o = h.object;
    if (o.userData.panel) {
      const b = o.userData.panel.hitAt(h.uv);
      if (b) { hit = { type: 'button', panel: o.userData.panel, btn: b, point: h.point, dist: h.distance }; break; }
      hit = { type: 'panel', point: h.point, dist: h.distance }; break; // 패널 빈 곳은 막음
    }
    if (o.userData.onSelect) { hit = { type: 'target', obj: o, point: h.point, dist: h.distance }; break; }
    if (o.userData.isFloor) { hit = { type: 'floor', point: h.point, dist: h.distance }; break; }
  }
  // 버튼 위 표시
  const prev = ptr.hit;
  if (prev && prev.type === 'button' && (!hit || hit.type !== 'button' || hit.panel !== prev.panel)) prev.panel.setHover(null);
  if (prev && prev.type === 'target' && (!hit || hit.obj !== prev.obj)) prev.obj.userData.onHover && prev.obj.userData.onHover(false);
  if (hit && hit.type === 'button') hit.panel.setHover(hit.btn);
  if (hit && hit.type === 'target' && (!prev || prev.obj !== hit.obj)) hit.obj.userData.onHover && hit.obj.userData.onHover(true);
  if (hit && hit.type === 'floor') {
    const bx = hit.point.x, by = -hit.point.z;
    hit.valid = E.walkable(bx, by) && hit.dist < 14;
  }
  ptr.hit = hit;
  if (ptr.kind === 'xr') {
    ptr.line.scale.z = hit ? Math.min(hit.dist, 6) : 3;
    ptr.dot.visible = !!hit && hit.type !== 'floor';
    if (hit) ptr.dot.position.copy(hit.point);
  }
}

// 누른 채로 옮긴 물건(비료 등)을 놓기: 꽃 위면 사용, 아니면 보관함으로
function doRelease(ptr) {
  if (!E.carrying || !E.carrying.drag) return;
  if (performance.now() - (E.carrying.t0 || 0) < 250) { E.carrying.drag = 'tap'; return; } // 짧게 누르면 들고 다니다가 다시 눌러 놓기
  const h = ptr.hit;
  if (h && h.type === 'target') { h.obj.userData.onSelect(E.carrying); click(); return; }
  E.carry(null); E.toast('보관함에 다시 넣었어요', false);
}
function doSelect(ptr) {
  const h = ptr.hit;
  if (!h) { if (E.carrying) { E.carry(null); E.toast('내려놓았어요', false); } return; }
  if (h.type === 'button') { h.panel.click(h.btn); click(); return; }
  if (h.type === 'target') { h.obj.userData.onSelect(E.carrying); click(); return; }
  if (h.type === 'floor') {
    if (E.carrying) { E.carry(null); E.toast('내려놓았어요', false); return; }
    // 순간 이동 없음: 걸어서만 움직여요
  }
}
// 짧은 효과음
let actx = null;
const clickAudio = new Audio('assets/audio/click.mp3'); clickAudio.preload = 'auto';
const bgm = new Audio('assets/audio/bgm.mp3'); bgm.loop = true; bgm.preload = 'auto';
const BGM_VOL = 0.25;
bgm.volume = BGM_VOL;
function duck(on) { bgm.volume = on ? 0.06 : BGM_VOL; }
E.setBgm = on => {
  E.state.settings.bgm = on; E.save();
  if (on) bgm.play().catch(() => { }); else bgm.pause();
};
function click() {
  try { const a = clickAudio.cloneNode(); a.volume = 0.7; a.play().catch(() => { }); return; } catch (e) { /* 아래 소리로 */ }

  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; g.gain.value = 0.05;
    o.connect(g); g.connect(actx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.12); o.stop(actx.currentTime + 0.13);
  } catch (e) { /* 소리 없음 */ }
}
E.click = click;

// ---------- 화면 모드 입력 ----------
let pitch = 0, drag = null;
const keys = {};
renderer.domElement.addEventListener('pointermove', e => {
  mouse.active = true;
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved && !drag.item) {
      rig.rotation.y -= dx * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.004));
      camera.rotation.x = pitch; drag.x = e.clientX; drag.y = e.clientY;
    }
  }
});
renderer.domElement.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, moved: false, item: false };
  const h = mouse.hit;
  if (!E.inXR() && h && h.type === 'button' && h.btn.drag) { h.panel.click(h.btn); click(); drag.item = true; }
});
renderer.domElement.addEventListener('pointerup', () => {
  if (drag && drag.item) { doRelease(mouse); drag = null; return; }
  if (drag && !drag.moved && !E.inXR()) doSelect(mouse);
  drag = null;
});
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') E.onMenuButton && E.onMenuButton();
  if (e.code === 'Escape') E.onBackButton && E.onBackButton();
  if (e.code === 'KeyV' && !e.repeat) E.voiceStart();
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyV') E.voiceStop(); });

// ---------- 음성 인식 (꾹 눌러서 말하기) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, heard = '', meter = null, spoke = false, lastErr = '', stopping = false;
E.voiceSupported = !!SR;
E.voiceLevel = 0;
const MIC_ERR = {
  'not-allowed': '마이크를 쓸 수 없어요. 주소창 왼쪽 아이콘을 눌러 마이크를 허용해 주세요',
  'service-not-allowed': '마이크를 쓸 수 없어요. 주소창 왼쪽 아이콘을 눌러 마이크를 허용해 주세요',
  'audio-capture': '마이크를 찾지 못했어요. 마이크 연결을 확인해 주세요',
  'network': '음성 인식에 연결하지 못했어요. 인터넷 연결을 확인해 주세요'
};
async function startMeter() {
  if (meter) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const an = actx.createAnalyser(); an.fftSize = 512;
    actx.createMediaStreamSource(stream).connect(an);
    meter = { an, buf: new Uint8Array(512) };
    return true;
  } catch (e) { lastErr = 'not-allowed'; return false; }
}
E.readLevel = () => {
  if (!meter || !E.listening) { E.voiceLevel = 0; return 0; }
  meter.an.getByteTimeDomainData(meter.buf);
  let s = 0; for (const v of meter.buf) { const d = (v - 128) / 128; s += d * d; }
  const r = Math.sqrt(s / meter.buf.length);
  E.voiceLevel = E.voiceLevel * 0.6 + r * 0.4;
  if (r > 0.035) spoke = true;
  if (E.micOpen) { // 회의처럼 계속 듣기: 말이 멈추면 한 마디로 묶어서 보내기
    const now = performance.now();
    if (r > 0.04) { lastLoud = now; if (!E.userTalking) { E.userTalking = true; E.onTalkStart && E.onTalkStart(); } }
    else if (E.userTalking && now - lastLoud > 1300) {
      E.userTalking = false;
      const seg = heard.slice(heardBase).trim(); heardBase = heard.length;
      E.onUtterance && E.onUtterance(seg);
    }
  }
  return r;
};
function startRec() {
  if (!SR) return;
  try {
    rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = true;
    rec.onresult = ev => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      heard = t; E.onVoiceInterim && E.onVoiceInterim(E.micOpen ? t.slice(heardBase) : t);
    };
    rec.onerror = ev => { if (ev.error !== 'no-speech' && ev.error !== 'aborted') lastErr = ev.error; };
    // 말을 잠깐 멈춰도 버튼을 누르고 있으면 계속 듣기
    rec.onend = () => { if (E.listening && !stopping && !MIC_ERR[lastErr]) { if (E.micOpen) { heard = ''; heardBase = 0; } try { rec.start(); } catch (e) { } } };
    rec.start();
  } catch (e) { /* 인식 없이 소리 크기만 사용 */ }
}
let heardBase = 0, lastLoud = 0;
E.micOpen = false; E.userTalking = false;
E.openMic = async on => {
  if (on === E.micOpen) return;
  if (on) {
    if (E.listening) { stopping = true; try { rec && rec.stop(); } catch (e) { } }
    E.micOpen = true; E.listening = true; stopping = false; spoke = false; heard = ''; heardBase = 0; lastErr = ''; E.userTalking = false;
    $('mic').classList.add('on'); duck(true);
    startRec();
    const ok = await startMeter();
    if (!ok && MIC_ERR[lastErr]) E.toast(MIC_ERR[lastErr], false);
  } else {
    E.micOpen = false; stopping = true; try { rec && rec.stop(); } catch (e) { }
    E.listening = false; stopping = false; E.userTalking = false; heard = ''; heardBase = 0;
    $('mic').classList.remove('on'); duck(false);
  }
  E.refreshWatch();
};
E.voiceStart = async () => {
  if (E.listening || E.micOpen) return;
  E.listening = true; stopping = false; spoke = false; heard = ''; lastErr = '';
  E.refreshWatch(); $('mic').classList.add('on'); duck(true);
  if (window.speechSynthesis) speechSynthesis.cancel();
  E.onVoiceStart && E.onVoiceStart();
  startRec();
  const ok = await startMeter();
  if (!ok && !SR) { E.listening = false; finishVoice(); }
};
E.voiceStop = () => {
  if (!E.listening || stopping || E.micOpen) return;
  stopping = true;
  try { rec && rec.stop(); } catch (e) { }
  setTimeout(finishVoice, 700); // 마지막 결과를 기다림
};
function finishVoice() {
  E.listening = false; stopping = false; E.refreshWatch(); $('mic').classList.remove('on'); duck(false);
  const t = heard.trim(); heard = '';
  if (!t && !spoke && MIC_ERR[lastErr]) E.toast(MIC_ERR[lastErr], false);
  E.onVoiceEnd && E.onVoiceEnd(t, spoke || !!t);
}
// 음성 → 화면 버튼
const norm = s => (s || '').replace(/[\s“”"'.,!?·]/g, '');
E.matchVoice = (text, panelsList) => {
  const t = norm(text);
  if (!t) return false;
  for (const p of panelsList) {
    if (!p.visible) continue;
    for (const h of p.hits) {
      if (h.disabled || !h.voice) continue;
      for (const v of h.voice) {
        const n = norm(v);
        if (n && (t.includes(n) || (n.length >= 2 && n.includes(t) && t.length >= 2))) { p.click(h); click(); return true; }
      }
    }
  }
  return false;
};

// ---------- 유리 패널 뒤 흐림 (머리 위치에서 낮은 해상도로 그린 뒤 흐리게) ----------
const blurCam = new THREE.PerspectiveCamera(110, 1, 0.1, 300);
const rtOpt = { type: THREE.HalfFloatType, depthBuffer: true };
const rtScene = new THREE.WebGLRenderTarget(320, 320, rtOpt);
const rtA = new THREE.WebGLRenderTarget(160, 160, { type: THREE.HalfFloatType, depthBuffer: false });
const rtB = new THREE.WebGLRenderTarget(160, 160, { type: THREE.HalfFloatType, depthBuffer: false });
const blurMat = new THREE.ShaderMaterial({
  uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(src, vUv).rgb * 0.2270270270;
      c += texture2D(src, vUv + dir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(src, vUv - dir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(src, vUv + dir * 3.2307692308).rgb * 0.0702702703;
      c += texture2D(src, vUv - dir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false
});
const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
blurQuad.frustumCulled = false;
const blurScene = new THREE.Scene(); blurScene.add(blurQuad);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let blurFrame = 0;
const hidden = [];
function blurPass() {
  let any = false;
  for (const p of E.panels) if (p.visible && p.mesh.parent === scene && p.W >= 1000) { any = true; break; }
  if (!any) return;
  if ((blurFrame++ % 3) !== 0 && BLUR.on.value) return;
  camera.getWorldPosition(blurCam.position);
  camera.getWorldQuaternion(blurCam.quaternion);
  blurCam.updateMatrixWorld(); blurCam.updateProjectionMatrix();
  hidden.length = 0;
  for (const o of UI_OBJS) if (o.visible) { o.visible = false; hidden.push(o); }
  const xrOn = renderer.xr.enabled, prev = renderer.getRenderTarget();
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rtScene); renderer.render(scene, blurCam);
  const pass = (src, dst, x, y) => { blurMat.uniforms.src.value = src.texture; blurMat.uniforms.dir.value.set(x / src.width, y / src.height); renderer.setRenderTarget(dst); renderer.render(blurScene, orthoCam); };
  pass(rtScene, rtA, 1, 0); pass(rtA, rtB, 0, 1); pass(rtB, rtA, 1.2, 0); pass(rtA, rtB, 0, 1.2);
  renderer.setRenderTarget(prev);
  renderer.xr.enabled = xrOn;
  for (const o of hidden) o.visible = true;
  BLUR.tex.value = rtB.texture;
  BLUR.vp.value.multiplyMatrices(blurCam.projectionMatrix, blurCam.matrixWorldInverse);
  BLUR.on.value = 1;
}

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let lastSave = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  cloudRing.rotation.y += dt * 0.004;
  const now = performance.now();
  const list = interactiveList();
  for (const p of pointers) updatePointer(p, list);
  // 순간 이동 표시
  const tp = pointers.find(p => p.hit && p.hit.type === 'floor' && p.hit.valid && !E.carrying && (p.kind === 'mouse' ? !E.inXR() && mouse.active : true));
  marker.visible = false;
  if (tp) { marker.position.set(tp.hit.point.x, FLOOR_Y + 0.01, tp.hit.point.z); }
  // 들고 있는 물건
  if (E.carrying) {
    const p = pointers.find(p => p.hit && (p.kind === 'xr' ? E.inXR() : !E.inXR()));
    if (p) carrySprite.sprite.position.copy(p.hit.point).add(new THREE.Vector3(0, 0.1, 0));
  }
  // 컨트롤러 스틱
  if (E.inXR()) {
    const session = renderer.xr.getSession();
    let hasLeft = false;
    for (const src of session.inputSources) if (src.handedness === 'left' && src.gamepad) hasLeft = true;
    if (!hasLeft && !E._oneHandTold && E.inXR()) { E._oneHandTold = true; setTimeout(() => { const ss = renderer.xr.getSession(); if (ss && ![...ss.inputSources].some(x => x.handedness === 'left' && x.gamepad)) E.toast('왼손 컨트롤러가 안 보여요. 오른손 스틱을 앞뒤로 밀면 걸어요.', true, 6000); else E._oneHandTold = false; }, 4500); }
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      const st = src.handedness === 'left' ? 'L' : 'R';
      const key = 'btn' + st;
      const b4 = gp.buttons[4] && gp.buttons[4].pressed, b5 = gp.buttons[5] && gp.buttons[5].pressed;
      if (b4 && !E[key + '4']) E.onMenuButton && E.onMenuButton();
      if (b5 && !E[key + '5']) E.onBackButton && E.onBackButton();
      E[key + '4'] = b4; E[key + '5'] = b5;
      if (st === 'L') {
        try {
          const sp = ([0.7, 1.2, 1.8][E.state.settings.speed] || 1.2) * dt;
          if (Math.hypot(ax[0], ax[1]) > 0.2) {
            const yaw = E.headYaw();
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
            tryMove((fx * -ax[1] + rx * ax[0]) * sp, (fz * -ax[1] + rz * ax[0]) * sp);
          }
        } catch (err) { console.warn(err); }
      }
      // 왼손 컨트롤러가 없으면 오른손 스틱 앞뒤로 걷기
      if (st === 'R' && !hasLeft && Math.abs(ax[1]) > 0.3 && Math.abs(ax[1]) > Math.abs(ax[0])) {
        const sp = ([0.7, 1.2, 1.8][E.state.settings.speed] || 1.2) * dt;
        const yaw = E.headYaw();
        tryMove(-Math.sin(yaw) * -ax[1] * sp, -Math.cos(yaw) * -ax[1] * sp);
      }
      if (st === 'R') {
        const ptr = pointers.find(p => p.src === src);
        const armed = ptr ? ptr.turnArmed : true;
        if (Math.abs(ax[0]) > 0.7 && armed) { rotateRig(-Math.sign(ax[0]) * Math.PI / 6); if (ptr) ptr.turnArmed = false; }
        if (Math.abs(ax[0]) < 0.3 && ptr) ptr.turnArmed = true;
      }
    }
  } else {
    // 키보드 이동
    const sp = [1.2, 1.8, 2.6][E.state.settings.speed] * dt;
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
    if (keys.KeyQ || keys.ArrowLeft) rig.rotation.y += 1.6 * dt;
    if (keys.KeyE || keys.ArrowRight) rig.rotation.y -= 1.6 * dt;
    if (f || s) {
      const yaw = rig.rotation.y;
      tryMove((-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp, (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp);
    }
  }
  // 걸어가기 도착 확인
  if (beaconZone) {
    const hb = E.headB();
    beacon.children[0].material.opacity = 0.22 + 0.1 * Math.sin(now / 300);
    if (Math.hypot(hb.x - beaconZone.stand[0], hb.y - beaconZone.stand[1]) < 1.4) {
      const z = beaconZone; E.beacon(null); E.onArrive && E.onArrive(z);
    }
  }
  if (toast.visible && now > toastT) { toast.show(false); $('toast').style.opacity = 0; }
  E.onTick && E.onTick(dt, now);
  for (const p of E.panels) if (p.visible) p.draw();
  if (now - lastSave > 5000) { lastSave = now; E.state.lastVisit = Date.now(); E.save(); }
  if (E.listening) E.readLevel();
  blurPass();
  renderer.render(scene, camera);
});

// ---------- VR 시작 ----------
let xrStarting = false;
async function enterVR() {
  if (!navigator.xr || xrStarting || renderer.xr.isPresenting) return;
  xrStarting = true;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    const keep = E.headB(), yaw = rig.rotation.y;
    try { await renderer.xr.setSession(session); } catch (err) { try { await session.end(); } catch (e2) { } throw err; }
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    $('overlay').classList.add('hidden');
    setTimeout(() => { E.setPose(keep.x, keep.y, yaw); E.onEnterVR && E.onEnterVR(); }, 400);
    // 헤드셋 위치가 바닥 밖이면 가까운 바닥으로 옮기기
    setTimeout(() => { const h = E.headB(); if (!E.walkable(h.x, h.y)) { const [x, y] = nearestWalkable(keep.x, keep.y); E.setPose(x, y); } }, 1500);
    session.addEventListener('end', () => {
      camera.position.set(0, 1.55, 0); pitch = 0; camera.rotation.set(0, 0, 0);
      $('overlay').classList.remove('hidden');
    });
  } catch (e) {
    if (/already an active/i.test(e.message)) alert('VR이 이미 다른 곳에서 켜져 있어요. 정원 탭을 하나만 남기고 나머지는 닫아 주세요. 헤드셋에서 다른 VR 앱도 꺼 주세요. 그다음 다시 눌러 주세요.');
    else alert('VR을 시작하지 못했어요. 헤드셋이 컴퓨터에 연결되어 있는지 확인해 주세요.\n(' + e.message + ')');
  } finally { xrStarting = false; }
}


// ---------- 구름: 원래 구름 6개를 본으로 삼아 사방에 높이를 달리해 띄우기 ----------
const cloudRing = new THREE.Group();
function buildClouds(root) {
  let mesh = null;
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return;
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
  const pos = geo.attributes.position, col = geo.attributes.color;
  const groups = [];
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    let g = groups.find(q => Math.abs(q.x - cx) < 4 && Math.abs(q.z - cz) < 2.5);
    if (!g) { g = { x: cx, z: cz, tris: [] }; groups.push(g); }
    g.tris.push(t);
  }
  // 구운 색에 섞인 초록빛을 없애고 흰 구름으로: 밝기만 남겨 흰색~옅은 하늘빛 그늘로 다시 칠하기
  {
    const n = col.count, L = new Float32Array(n);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < n; i++) { const l = 0.3 * col.getX(i) + 0.55 * col.getY(i) + 0.15 * col.getZ(i); L[i] = l; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    for (let i = 0; i < n; i++) {
      const t = Math.pow((L[i] - lo) / Math.max(hi - lo, 1e-5), 0.6);
      col.setXYZ(i, 0.78 + 0.22 * t, 0.83 + 0.17 * t, 0.9 + 0.1 * t);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const templates = groups.map(g => {
    const n = g.tris.length * 3, P = new Float32Array(n * 3), Cc = new Float32Array(n * col.itemSize);
    let k = 0;
    for (const t of g.tris) for (let v = 0; v < 3; v++, k++) {
      P[k * 3] = pos.getX(t + v); P[k * 3 + 1] = pos.getY(t + v); P[k * 3 + 2] = pos.getZ(t + v);
      for (let c = 0; c < col.itemSize; c++) Cc[k * col.itemSize + c] = col.array[(t + v) * col.itemSize + c];
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(Cc, col.itemSize, col.normalized));
    bg.computeBoundingBox();
    const bb = bg.boundingBox, c = bb.getCenter(new THREE.Vector3());
    bg.translate(-c.x, -bb.min.y, -c.z);
    bg.computeBoundingSphere();
    return bg;
  });
  if (!templates.length) return;
  // 정원 가운데 (Blender 40, -4.5)
  cloudRing.position.set(40, 0, 4.5);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = 34;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const tier = i % 3;
    const r = [38, 55, 75][tier] + rnd() * 12;
    const h = [12, 19, 27][tier] + rnd() * 5;
    const s = (r / 30) * (1.1 + rnd() * 0.9);
    const m = new THREE.Mesh(templates[i % templates.length], mat);
    m.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    m.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 0.4;
    m.scale.set(s * (0.9 + rnd() * 0.4), s * (0.7 + rnd() * 0.5), s);
    m.frustumCulled = true;
    cloudRing.add(m);
  }
  scene.add(cloudRing);
}


// ---------- 고화질 구운 텍스처: 색(albedo) × 빛(lightmap) ----------
const BAKE_SETS = 4;
const ASSET_V = 12; // 모델·텍스처를 바꾸면 숫자를 올려서 새로 받게 하기
async function loadBakedMaterials() {
  let info = null;
  try { info = await fetch(`models/bake/bake.json?v=${ASSET_V}`).then(r => r.json()); } catch (e) { return {}; }
  const tl = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const load = url => new Promise((res, rej) => tl.load(url, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; res(t); }, undefined, rej));
  const out = {};
  await Promise.all(info.sets.map(async s => {
    const [alb, lm] = await Promise.all([load(`models/bake/${s.alb}?v=${ASSET_V}`), load(`models/bake/${s.lm}?v=${ASSET_V}`)]);
    lm.anisotropy = Math.min(4, aniso);
    out[s.material] = new THREE.ShaderMaterial({
      uniforms: { alb: { value: alb }, lm: { value: lm }, S: { value: s.scale } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D alb; uniform sampler2D lm; uniform float S; varying vec2 vUv;
        void main(){ vec3 c = texture2D(alb, vUv).rgb * texture2D(lm, vUv).rgb * S; gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide
    });
  }));
  return out;
}

// ---------- 불러오기 ----------
const MODELS = [
  ['static_hd', 14], ['plants_right', 3.1], ['plants_backleft', 3.2], ['plants_left', 2.1], ['plants_gate', 0.6],
  ['plants_pots', 0.55], ['plants_cottageA', 0.45], ['plants_gathering', 0.33], ['plants_cottageB', 0.32],
  ['trees', 0.06], ['clouds', 0.01], ['growth', 0.36]
];
const ICONS = ['rose', 'hydrangea', 'anemone', 'poppy', 'daffodil', 'iris', 'tulip', 'daisy', 'sunflower', 'tulip_bud',
  'wheelbarrow', 'sieve', 'kneeling_pad', 'hose', 'hand_fork', 'gloves', 'fertilizer', 'watering_can', 'basket', 'soil',
  'seeds', 'pot', 'plant_labels', 'pruners', 'hoe', 'cultivator', 'weeder', 'dibber',
  'ic_basket', 'ic_market', 'ic_flowers', 'ic_tea', 'ic_mail', 'ribbon', 'wrap', 'pesticide'];

async function boot() {
  const draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const total = MODELS.reduce((a, m) => a + m[1], 0);
  const prog = {};
  const setBar = () => {
    const done = MODELS.reduce((a, m) => a + (prog[m[0]] || 0) * m[1], 0);
    $('bar').style.width = Math.round(done / total * 100) + '%';
    $('loadtxt').textContent = `정원을 불러오는 중… ${Math.round(done / total * 100)}%`;
  };
  const fontsReady = Promise.race([
    Promise.all([document.fonts.load(`700 40px "Noto Sans KR"`), document.fonts.load(`500 40px "Noto Sans KR"`)]),
    new Promise(r => setTimeout(r, 4000))
  ]);
  const [walk] = await Promise.all([
    fetch('walk.json').then(r => r.json()).catch(() => null),
    loadIcons(ICONS), fontsReady
  ]);
  WALK = walk;
  const BAKED = await loadBakedMaterials();
  const results = {};
  await Promise.all(MODELS.map(([name]) => new Promise((res, rej) => {
    loader.load(`models/${name}.glb?v=${ASSET_V}`, g => { prog[name] = 1; setBar(); results[name] = g; res(); },
      x => { if (x.total) { prog[name] = x.loaded / x.total; setBar(); } }, rej);
  })));
  // 구운 장면: 빛 계산 없이 표시
  for (const [name] of MODELS) {
    if (name === 'growth') continue;
    const root = results[name].scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (name === 'static_hd' && BAKED[m.name]) {
        o.material = BAKED[m.name];
      } else if (name === 'static_hd') {
        const map = m.emissiveMap || m.map;
        o.material = map ? new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })
          : new THREE.MeshBasicMaterial({ color: m.emissive && m.emissive.getHex() ? m.emissive : new THREE.Color(0x15402a), side: THREE.DoubleSide });
      } else {
        o.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      }
      o.matrixAutoUpdate = false; o.updateMatrix();
    });
    if (name === 'clouds') buildClouds(root); else scene.add(root);
  }
  E.growthScene = results.growth.scene;
  E.growthScene.updateMatrixWorld(true);
  $('loading').classList.add('hidden');
  $('start').classList.remove('hidden');
  const xrOK = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  $('btnVR').disabled = !xrOK;
  $('vrnote').textContent = xrOK ? '헤드셋이 연결되어 있어요. 아래 버튼을 눌러 시작하세요.'
    : '이 컴퓨터에서 VR 헤드셋을 찾지 못했어요. Quest Link나 SteamVR을 켠 뒤 페이지를 새로 고침해 주세요.';
  if (!E.voiceSupported) $('micnote').textContent = '이 브라우저는 음성 인식을 지원하지 않아요. Chrome을 사용해 주세요.';
  startGame(E);
}

$('btnVR').addEventListener('click', () => { if (E.state.settings.bgm) E.setBgm(true); enterVR(); });
$('btnDesk').addEventListener('click', () => { if (E.state.settings.bgm) E.setBgm(true); $('overlay').classList.add('hidden'); mouse.active = true; E.onEnterDesktop && E.onEnterDesktop(); });
$('btnMic').addEventListener('click', async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    $('micnote').textContent = '마이크를 쓸 수 있어요. VR에서는 쥐기 버튼을 누른 채 말하세요.';
  } catch (e) { $('micnote').textContent = '마이크를 허용하지 않았어요. 음성 없이도 모든 기능을 쓸 수 있어요.'; }
});
$('mic').addEventListener('pointerdown', () => E.voiceStart());
$('mic').addEventListener('pointerup', () => E.voiceStop());
$('menuBtn').addEventListener('click', () => E.onMenuButton && E.onMenuButton());
$('vrBtn2').addEventListener('click', enterVR);

boot().catch(err => {
  console.error(err);
  $('loadtxt').textContent = '불러오기에 실패했어요: ' + err.message;
});
