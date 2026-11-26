// 기억정원 · 게임 화면과 규칙 (한국어)
import * as THREE from 'three';
import { Panel, Bubble, C, drawGlyph, drawIcon, FONT, B, yawOf, UI_OBJS } from './ui.js?v=28';
import { ITEMS, BASKETS, FLOWER_PRICE, basketPrice, SHOP_TABS, FLOWERS, STAGE_NAMES, FLASH_POOL, flashCfg, todayStr, clearState } from './data.js?v=28';

const W = 1920, H = 1080;
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 활동 구역 (Blender 좌표)
const ZONES = {
  garden: { id: 'garden', name: '정원 가꾸기', stand: [40.1, -7.8], face: [0, 1], panel: [40.1, -5.9, 1.25] },
  flash:  { id: 'flash',  name: '반짝 꽃 찾기', stand: [39.0, 1.0], face: [0, 1], panel: [39.0, 3.0, 1.45] },
  shop:   { id: 'shop',   name: '기억 꽃집', stand: [41.4, -1.7], face: [0.7071, 0.7071] },
  tea:    { id: 'tea',    name: '정원 티파티', stand: [47.0, -6.4], face: [0, 1], panel: [47.0, -4.6, 1.4] },
  market: { id: 'market', name: '꽃 시장', stand: [34.2, -3.9], face: [0, 1], panel: [34.2, -2.4, 1.45] },
  mr:     { id: 'mr',     name: '야외 정원', stand: [40.0, 4.4], face: [0, 1], panel: [40.0, 5.8, 1.5] },
  mail:   { id: 'mail',   name: '우편함', stand: [34.9, -7.9], face: [0.7071, 0.7071] }
};
ZONES.shop.panel = [41.4 + 0.7071 * 1.9, -1.7 + 0.7071 * 1.9, 1.45];
ZONES.mail.panel = [34.9 + 0.7071 * 1.9, -7.9 + 0.7071 * 1.9, 1.45];

export function startGame(E) {
  const S = E.state;
  const log = (type, data = {}) => { S.log.push({ t: Date.now(), type, ...data }); if (S.log.length > 500) S.log.shift(); };
  const flowerCount = () => Object.values(S.flowers).reduce((a, b) => a + b, 0);
  const inv = id => S.inv[id] || 0;
  const addInv = (id, n = 1) => { S.inv[id] = inv(id) + n; if (S.inv[id] <= 0) delete S.inv[id]; };

  // ---------- 하루 시작 ----------
  const today = todayStr();
  let dailyMsg = null;
  if (S.lastDay !== today) {
    const away = Date.now() - (S.lastVisit || Date.now());
    S.lastDay = today; S.trainCoinsToday = 0;
    // 오늘의 추천: 최근 7일 동안 덜 한 훈련
    const week = Date.now() - 7 * 864e5;
    const cnt = { flash: 0, shop: 0, garden: 0 };
    S.log.filter(l => l.t > week && l.type === 'train').forEach(l => { if (cnt[l.game] !== undefined) cnt[l.game]++; });
    S.rec = Object.keys(cnt).sort((a, b) => cnt[a] - cnt[b])[0];
    // 오래 접속하지 않았으면 핀 꽃은 휴면
    if (away > 7 * 864e5) S.slots.forEach(s => { if (s && s.stage === 3) s.dormant = true; });
    S.dailyWish = { type: shuffle(Object.keys(FLOWERS))[0], n: 2 };
    log('day', { rec: S.rec });
  }
  if (!S.dailyWish) S.dailyWish = { type: 'tulip', n: 2 };
  // 출석 보상: 지난번 보상에서 24시간이 지나면 200코인
  const LOGIN_BONUS = 200;
  function loginBonus() {
    const now = Date.now();
    if (!S.lastBonus) { S.lastBonus = now; return false; }
    if (now - S.lastBonus < 864e5) return false;
    S.lastBonus = now; S.coins += LOGIN_BONUS; log('bonus', { n: LOGIN_BONUS });
    E.save(); E.refreshWatch && E.refreshWatch();
    return true;
  }
  if (loginBonus()) dailyMsg = '출석 보상으로 꽃 코인 200개를 받았어요';
  // 야외 정원(MR)에서 딴 꽃: 하루에 10송이까지만 팔 수 있어요
  const WILD_LIMIT = 10;
  if (!S.wild) S.wild = {};
  const wildDay = () => { const d = todayStr(); if (S.wildSoldDay !== d) { S.wildSoldDay = d; S.wildSold = 0; } };
  const wildOf = t => Math.min(S.wild[t] || 0, S.flowers[t] || 0);
  const wildLeft = () => { wildDay(); return Math.max(0, WILD_LIMIT - (S.wildSold || 0)); };
  const sellableOf = t => (S.flowers[t] || 0) - wildOf(t) + Math.min(wildOf(t), wildLeft());
  const sellableTotal = () => { let g = 0, w = 0; Object.keys(FLOWERS).forEach(t => { g += (S.flowers[t] || 0) - wildOf(t); w += wildOf(t); }); return g + Math.min(w, wildLeft()); };
  // 팔 때는 정원 꽃부터, 그다음 야외 꽃
  function sellFlower(t, n) {
    const w0 = wildOf(t), g = (S.flowers[t] || 0) - w0, fromG = Math.min(n, g), fromW = n - fromG;
    S.flowers[t] = (S.flowers[t] || 0) - n; S.wild[t] = Math.max(0, w0 - fromW);
    wildDay(); S.wildSold = (S.wildSold || 0) + fromW;
  }
  // 바구니 · 선물에 쓸 때는 야외 꽃부터
  function useFlower(t, n) {
    S.flowers[t] = Math.max(0, (S.flowers[t] || 0) - n); S.wild[t] = Math.max(0, (S.wild[t] || 0) - n);
  }
  E.save();

  // ---------- 큰 패널 ----------
  const main = E.addPanel(new Panel(W, H, 1.9));
  main.show(false);
  let current = null;     // 현재 화면 이름
  let activeZone = null;  // 지금 하고 있는 활동 구역
  const back = [];

  function open(view, place = 'front', name = '') {
    if (!/^basket(Make|Done)/.test(name) && typeof b3Hide === 'function') b3Hide();
    current = name;
    main.setView(view);
    if (place === 'front') E.placeInFront(main);
    else if (place && place.panel) E.placeAt(main, B(...place.panel), B(place.stand[0], place.stand[1], 1.5));
    main.show(true);
    tilesHide();
  }
  function closeAll(msg) {
    b3Hide();
    main.show(false); current = null; activeZone = null; tilesHide(); teaStop(); invClose(); stopFlashTimer(); flash = null;
    if (msg) E.toast(msg);
  }
  const zoneOf = id => ZONES[id];
  // 화면을 놓을 곳: 그 장소 가까이 있으면 그곳에, 멀리 있으면 바로 눈앞에
  const placeOf = id => { const z = ZONES[id], h = E.headB(); return Math.hypot(h.x - z.stand[0], h.y - z.stand[1]) < 3.5 ? z : 'front'; };

  // 공통: 오른쪽 위 나가기 버튼
  const exitBtn = (P, cb = () => closeAll('언제든 X 버튼으로 메뉴를 열 수 있어요')) => P.roundBtn('exit', 90, 90, 48, 'exit', cb, ['나가기', '끝내기', '그만']);
  const backBtn = (P, cb) => P.roundBtn('back', 90, 90, 48, 'exit', cb, ['뒤로', '돌아가기', '나가기']);
  const greet = () => { const h = new Date().getHours(); return h < 11 ? '좋은 아침이에요!' : h < 17 ? '좋은 오후예요!' : '좋은 저녁이에요!'; };

  // ================= 메인 메뉴 =================
  function mainMenu() {
    const need = S.slots.filter(s => s && (needCount(s) || s.dormant)).length;
    const bloom = S.slots.filter(s => s && s.stage === 3 && !s.dormant).length;
    const msg = need ? `${greet()} 꽃 ${need}송이가 돌봄을 기다려요` : bloom ? `${greet()} 정원에 꽃이 피어 있어요` : `${greet()} 오늘은 무엇을 해 볼까요?`;
    open(P => {
      P.coinChip(60, 50, S.coins);
      P.glass(470, 40, 980, 120, 60);
      P.text(msg, W / 2, 101, { size: 48, weight: 700 });
      P.roundBtn('close', W - 90, 92, 46, 'close', () => closeAll(), ['닫기']);
      P.button('help', 1480, 48, 300, 96, '사용 방법', () => tutorial(0), { size: 34, voice: ['사용 방법', '도움말', '설명'] });
      P.glass(90, 380, 1740, 300, 60, 'rgba(255,255,255,0.35)');
      const items = [
        ['garden', '정원 가꾸기', 'ic_flowers', () => guideTo('garden'), ['정원 가꾸기', '정원', '꽃 심기']],
        ['train', '훈련 공간', 'anemone', () => trainingArea(), ['훈련 공간', '훈련']],
        ['market', '꽃 시장', 'ic_market', () => guideTo('market'), ['꽃 시장', '시장']],
        ['tea', '정원 티파티', 'ic_tea', () => guideTo('tea'), ['정원 티파티', '티파티', '파티']],
        ['mail', '우편함', 'ic_mail', () => guideTo('mail'), ['우편함', '편지', '소원']],
        ['quest', '처음 안내', 'plant_labels', () => questStart(), ['처음 안내', '안내', '처음']],
        ['set', '설정', 'gear', () => settings(), ['설정']]
      ];
      items.forEach((it, i) => {
        const x = 108 + i * 246, y = 440, w = 232, h = 190;
        const isRec = it[0] === 'train' && (S.rec === 'flash' || S.rec === 'shop') || it[0] === 'garden' && S.rec === 'garden';
        P.button(it[0], x, y, w, h, it[1], it[3], { kind: isRec ? 'primary' : 'secondary', r: 36, size: 34, dy: 52, voice: it[4] });
        const cx = x + w / 2, cy = y + 68;
        if (it[2] === 'gear') drawGlyph(P.ctx, 'gear', cx, cy, 80);
        else P.icon(it[2], cx, cy, 100);
        if (isRec) P.badge('오늘의 추천', cx, y - 6);
      });
      P.hint('가고 싶은 곳을 말해 보세요 (예: “훈련 공간”)', 730, 900);
      P.text(E.inXR() ? '왼쪽 X 버튼으로 메뉴를 열고 닫아요 · 왼쪽 스틱으로 걸어요' : 'M 키로 메뉴를 열고 닫아요 · W A S D 로 걸어요 · Q E 로 몸을 돌려요', W / 2, 850, { size: 30, color: '#555' });
    }, 'front', 'menu');
    E.say(msg);
  }
  function teaCup(ctx, cx, cy, inv) {
    ctx.save(); ctx.strokeStyle = inv ? '#fff' : '#5e8a50'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 34, cy - 18); ctx.lineTo(cx + 26, cy - 18); ctx.lineTo(cx + 20, cy + 26); ctx.lineTo(cx - 28, cy + 26); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 34, cy, 13, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 14, cy - 30); ctx.quadraticCurveTo(cx - 6, cy - 40, cx - 14, cy - 50); ctx.stroke();
    ctx.restore();
  }
  function gear(ctx, cx, cy, inv) {
    ctx.save(); ctx.strokeStyle = inv ? '#fff' : '#5e8a50'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    [[-24, -16, 10], [-24, 0, -14], [-24, 16, 4]].forEach(([x, y, k]) => {
      ctx.beginPath(); ctx.moveTo(cx - 36, cy + y); ctx.lineTo(cx + 36, cy + y); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + k, cy + y, 7, 0, Math.PI * 2); ctx.fillStyle = inv ? C.green : '#fff'; ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  // ================= 이동 안내 =================
  function guideTo(id) {
    const z = zoneOf(id);
    const hb = E.headB();
    if (Math.hypot(hb.x - z.stand[0], hb.y - z.stand[1]) < 2.5) { arrive(z); return; }
    open(P => {
      P.glass(460, 250, 1000, 560, 60);
      P.text(`${z.name}(으)로 가 볼까요?`, W / 2, 360, { size: 60, weight: 700 });
      P.text('초록 빛기둥을 따라 천천히 걸어가 보세요.', W / 2, 450, { size: 36, color: C.sub });
      P.button('walk', 560, 560, 800, 110, '걸어서 가기', () => { closeAll(); E.beacon(z); E.toast(`초록 빛기둥을 따라 ${z.name}(으)로 걸어가세요`); }, { kind: 'primary', voice: ['걸어서', '걷기', '가기'] });
      P.button('cancel', 560, 690, 800, 90, '취소', () => mainMenu(), { voice: ['취소'] });
    }, 'front', 'guide');
  }
  E.onArrive = z => arrive(z);
  function arrive(z) {
    activeZone = z.id;
    if (z.id === 'garden') gardenWelcome();
    else if (z.id === 'flash') flashStart();
    else if (z.id === 'shop') shopStart();
    else if (z.id === 'tea') teaEntry();
    else if (z.id === 'market') marketScreen();
    else if (z.id === 'mr') mrInfo();
    else if (z.id === 'mail') mailScreen();
  }

  // ================= 훈련 공간 =================
  function trainingArea() {
    open(P => {
      P.glass(560, 50, 800, 160, 60);
      P.text('훈련 공간', W / 2, 108, { size: 60, weight: 700 });
      P.text('오늘은 어떤 훈련을 해 볼까요?', W / 2, 170, { size: 34, color: C.sub });
      backBtn(P, () => mainMenu());
      const cards = [
        ['flash', '반짝 꽃 찾기', '잠깐 나타난 꽃의\n위치 기억하기', 'anemone', () => { activeZone = 'flash'; flashStart(); }, ['반짝', '꽃 찾기']],
        ['shop', '기억 꽃집', '살 물건을 기억해\n꽃집에서 고르기', 'watering_can', () => { activeZone = 'shop'; shopStart(); }, ['기억 꽃집', '꽃집']],
        ['mr', '꽃 따기', '꽃을 기억해서\n내 방에서 따기', 'poppy', () => mrInfo(), ['꽃 따기']],
        ['basket', '꽃바구니 만들기', '내 꽃으로\n꽃바구니 만들기', 'ic_basket', () => basketStart(), ['꽃바구니']]
      ];
      cards.forEach((c, i) => {
        const x = 150 + i * 420, y = 280, w = 380, h = 560;
        const rec = S.rec === c[0];
        const hov = P.hover === c[0];
        P.rect(x, y, w, h, 44, hov ? '#ffffff' : 'rgba(255,255,255,0.58)', rec ? C.green : (hov ? C.green : 'rgba(255,255,255,0.95)'), rec || hov ? 7 : 3);
        P.circle(x + w / 2, y + 160, 110, '#f8f6ef');
        P.icon(c[3], x + w / 2, y + 160, 170);
        P.text(c[1], x + w / 2, y + 350, { size: 48, weight: 700 });
        P.text(c[2], x + w / 2, y + 450, { size: 32, color: C.sub, maxW: w - 40 });
        if (rec) P.badge('오늘의 추천', x + w / 2, y - 2, C.green, '#fff');
        if (c[0] === 'mr') { P.rect(x + w - 100, y + 24, 76, 48, 24, '#4f6b45'); P.text('MR', x + w - 62, y + 49, { size: 28, weight: 700, color: '#fff' }); }
        P.hit(c[0], x, y, w, h, c[4], { voice: c[5] });
      });
      P.hint('오늘의 추천은 참고용이에요. 다른 훈련을 해도 괜찮아요.', 880, 1000);
      P.text(S.rec === 'garden' ? '오늘의 추천: 정원 가꾸기' : `“${S.rec === 'flash' ? '반짝 꽃 찾기' : '기억 꽃집'}”라고 말해 보세요`, W / 2, 1000, { size: 30, color: '#555' });
    }, 'front', 'training');
  }
  // ================= MR 꽃 따기 (기억 훈련) =================
  const MR_TYPES = ['tulip', 'daisy', 'sunflower'];
  let mr = null, mrReturn = null, mrTimer = null;
  const mrLevel = () => Math.min(5, S.mrLevel || 1);
  const sumv = o => Object.values(o).reduce((a, b) => a + b, 0);
  function mrTarget(lv) {
    const types = MR_TYPES.slice().sort(() => Math.random() - 0.5).slice(0, [0, 1, 2, 3, 3, 3][lv]);
    const t = {}; types.forEach(x => t[x] = 1);
    let total = [0, 2, 3, 4, 5, 6][lv];
    while (sumv(t) < total) { const x = types[Math.floor(Math.random() * types.length)]; if (t[x] < 3) t[x]++; }
    return t;
  }
  function mrFlowerNeed() {
    if (!(bk && bk.style)) return null;
    const st = bStyle(bk.style); if (!st) return null;
    const t = {}; basketNeeds(st).filter(m => m.kind === 'flower').forEach(m => t[m.id] = m.need);
    return sumv(t) ? t : null;
  }
  function mrInfo() {
    const forBasket = !!mrFlowerNeed();
    open(P => {
      exitBtn(P);
      P.glass(360, 110, 1200, 860, 60);
      P.circle(W / 2, 240, 90, '#f8f6ef'); P.icon('poppy', W / 2, 240, 140);
      P.text('꽃 따기 (MR)', W / 2, 390, { size: 60, weight: 700 });
      P.text(forBasket ? '꽃바구니에 부족한 꽃을 기억하고 있나요? 꽃밭에서는 목록을 보여 주지 않아요. 기억한 꽃만 골라서 따 보세요.' : '내 방 바닥에 꽃이 피어나요. 먼저 딸 꽃을 잘 기억한 다음, 그 꽃만 골라서 따 보세요.', W / 2, 490, { size: 34, color: C.sub, maxW: 1000 });
      P.text('컨트롤러로 꽃을 가리키고 방아쇠를 누르면 따져요. 시작하기 전에 주변에 부딪힐 물건이 없는지 확인해 주세요.', W / 2, 610, { size: 30, color: C.sub, maxW: 1000 });
      if (!forBasket) P.text(`지금 ${mrLevel()}단계`, W / 2, 700, { size: 34, weight: 700, color: C.green });
      P.button('go', 560, 760, 800, 110, 'MR 시작하기', () => mrBegin(forBasket), { kind: 'primary', size: 42, voice: ['시작', 'MR'] });
    }, activeZone === 'mr' ? zoneOf('mr') : 'front', 'mr');
  }
  async function mrBegin(forBasket) {
    if (!(await E.mrSupported())) {
      open(P => {
        exitBtn(P);
        P.glass(460, 240, 1000, 600, 60);
        P.text('여기서는 MR을 쓸 수 없어요', W / 2, 380, { size: 52, weight: 700 });
        P.text('혼합현실(MR)은 Quest 헤드셋의 브라우저에서 열었을 때만 쓸 수 있어요. 컴퓨터 화면이나 컴퓨터에 연결한 VR에서는 쓸 수 없어요.', W / 2, 500, { size: 32, color: C.sub, maxW: 860 });
        P.button('ok', 610, 660, 700, 100, '확인', () => { if (quest) { qev('mr'); closeAll(); } else mrInfo(); }, { kind: 'primary' });
      }, 'front', 'mrNo');
      return;
    }
    const lv = mrLevel();
    const target = forBasket ? (mrFlowerNeed() || mrTarget(lv)) : mrTarget(lv);
    mr = { lv, target, picked: {}, wrong: 0, hints: 0, forBasket, items: [], phase: 'wait' };
    main.show(false); current = null; tilesHide();
    E.toast('잠시 후 내 방이 보여요', false, 2500);
    E.enterMR();
  }
  E.onMRCancel = () => { mr = null; };
  E.onEnterMR = () => {
    qev('mr');
    if (!mr) { const lv = mrLevel(); mr = { lv, target: mrTarget(lv), picked: {}, wrong: 0, hints: 0, forBasket: false, items: [], phase: 'wait' }; }
    mrSpawn();
    if (mr.forBasket) { mr.phase = 'pick'; mrHud(); E.toast('기억한 꽃만 골라서 따 보세요', true, 4000); }
    else mrShowTarget(false);
  };
  E.onExitMR = () => {
    mrClear(); clearInterval(mrTimer); mr = null;
    main.show(false); current = null;
  };
  function mrClear() {
    if (!mr) return;
    for (const it of mr.items) { E.removeTarget(it.hb); E.mrRoot.remove(it.g); }
    mr.items = [];
  }
  function mrSpawn() {
    mrClear();
    const list = [];
    Object.entries(mr.target).forEach(([t, n]) => { for (let k = 0; k < n; k++) list.push(t); });
    const extra = 4 + mr.lv;
    for (let k = 0; k < extra; k++) list.push(MR_TYPES[Math.floor(Math.random() * MR_TYPES.length)]);
    list.sort(() => Math.random() - 0.5);
    const pts = [];
    for (let tries = 0; pts.length < list.length && tries < 2000; tries++) {
      const a = (Math.random() * 2 - 1) * 1.9, r = 0.9 + Math.random() * 0.9;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (pts.every(([px, pz]) => Math.hypot(px - x, pz - z) > 0.42)) pts.push([x, z]);
    }
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6e8f4a, roughness: 1, transparent: true, opacity: 0.9 });
    list.forEach((t, k) => {
      if (!pts[k]) return;
      const g = new THREE.Group();
      const f = flower3D(t); f.scale.multiplyScalar(1.7); g.add(f);
      const tuft = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24).rotateX(-Math.PI / 2), tuftMat); tuft.position.y = 0.004; g.add(tuft);
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.65, 10), new THREE.MeshBasicMaterial({ visible: false }));
      hb.position.y = 0.32; g.add(hb);
      g.position.set(pts[k][0], 0, pts[k][1]); g.rotation.y = Math.random() * 6.28; g.scale.setScalar(0.001);
      const it = { t, g, hb, born: performance.now() + k * 120, hov: false, shake: 0, gone: 0 };
      hb.userData.onSelect = () => mrPick(it);
      hb.userData.onHover = on => { it.hov = on; };
      E.mrRoot.add(g); E.addTarget(hb); mr.items.push(it);
    });
  }
  function mrFrame(now) {
    if (!mr) return;
    for (let k = mr.items.length - 1; k >= 0; k--) {
      const it = mr.items[k];
      if (it.gone) {
        const u = (now - it.gone) / 700;
        if (u >= 1) { E.mrRoot.remove(it.g); mr.items.splice(k, 1); continue; }
        it.g.position.y = u * 0.5; it.g.scale.setScalar(Math.max(0.001, 1 - u));
        continue;
      }
      const u = Math.min(1, Math.max(0, (now - it.born) / 600));
      let sc = (1 - Math.pow(1 - u, 3)) * (it.hov && mr.phase === 'pick' ? 1.12 : 1);
      it.g.scale.setScalar(Math.max(0.001, sc));
      const sh = now - it.shake;
      it.g.rotation.z = sh < 600 ? Math.sin(sh / 40) * 0.18 * (1 - sh / 600) : 0;
    }
  }
  function mrPick(it) {
    if (!mr || mr.phase !== 'pick' || it.gone) return;
    const t = it.t, need = (mr.target[t] || 0) - (mr.picked[t] || 0);
    if (need > 0) {
      it.gone = performance.now(); E.removeTarget(it.hb);
      mr.picked[t] = (mr.picked[t] || 0) + 1;
      S.flowers[t] = (S.flowers[t] || 0) + 1; S.wild[t] = (S.wild[t] || 0) + 1; E.save();
      E.toast(`${FLOWERS[t].name} +1 · 꽃 창고에 넣었어요`, false, 1500);
      mrHud();
      if (Object.keys(mr.target).every(k => (mr.picked[k] || 0) >= mr.target[k])) { mr.phase = 'done'; setTimeout(mrDone, 900); }
    } else {
      mr.wrong++; it.shake = performance.now();
      E.toast(mr.target[t] ? '그 꽃은 이미 충분히 땄어요' : '이 꽃은 아니었어요. 다시 떠올려 볼까요?', false, 2200);
    }
  }
  function mrShowTarget(isHint) {
    if (!mr) return;
    mr.phase = 'show';
    if (isHint) mr.hints++;
    const sec = isHint ? 3 : [0, 6, 6, 7, 7, 6][mr.lv] || 6, t0 = performance.now();
    open(P => {
      P.glass(360, 110, 1200, 760, 60);
      P.text(isHint ? '다시 한 번 볼까요?' : (mr.forBasket ? '꽃바구니에 필요한 꽃이에요' : '이 꽃들을 기억해 주세요'), W / 2, 200, { size: 54, weight: 700 });
      const list = Object.entries(mr.target), n = list.length;
      list.forEach(([t, c], k) => {
        const x = W / 2 + (k - (n - 1) / 2) * 340;
        P.circle(x, 400, 120, '#f8f6ef'); P.icon(FLOWERS[t].icon, x, 400, 180);
        P.text(`${FLOWERS[t].name} ${c}송이`, x, 575, { size: 42, weight: 700 });
      });
      const left = Math.max(0, sec - (performance.now() - t0) / 1000);
      P.rect(560, 660, 800, 26, 13, 'rgba(255,255,255,0.7)');
      P.rect(560, 660, Math.max(26, 800 * left / sec), 26, 13, C.green);
      P.text('잠시 후 사라져요. 그다음 이 꽃들만 따 주세요', W / 2, 760, { size: 32, color: C.sub });
    }, 'front', 'mrShow');
    clearInterval(mrTimer);
    mrTimer = setInterval(() => {
      if (!mr || current !== 'mrShow') { clearInterval(mrTimer); return; }
      if (performance.now() - t0 >= sec * 1000) { clearInterval(mrTimer); mr.phase = 'pick'; mrHud(); E.toast('이제 기억한 꽃을 따 보세요', true, 3000); return; }
      main.refresh();
    }, 200);
  }
  function mrHud() {
    if (!mr) return;
    const total = sumv(mr.target), got = sumv(mr.picked);
    open(P => {
      P.glass(400, 30, 1120, 170, 50);
      P.text(`딴 꽃 ${got} / ${total}송이`, 640, 115, { size: 44, weight: 700 });
      P.button('hint', 900, 60, 300, 110, '다시 보기', () => mrShowTarget(true), { size: 34, voice: ['다시 보기'] });
      P.button('end', 1220, 60, 270, 110, '끝내기', () => mrQuit(), { size: 34, voice: ['끝내기', '그만'] });
    }, 'front', 'mrHud');
    E.placeInFront(main, 2.0, 0.28);
  }
  function mrQuit() {
    if (mr) log('train', { game: 'mr', level: mr.lv, quit: true, picked: sumv(mr.picked) });
    mrReturn = null; E.exitMR(true);
  }
  function mrDone() {
    if (!mr) return;
    const perfect = !mr.wrong && !mr.hints;
    const reward = Math.max(0, Math.min(10, 50 - S.trainCoinsToday));
    S.coins += reward; S.trainCoinsToday += reward;
    let unlocked = false;
    if (!mr.forBasket && perfect && mr.lv === mrLevel() && mrLevel() < 5) { S.mrLevel = mrLevel() + 1; unlocked = true; }
    log('train', { game: 'mr', level: mr.lv, ok: true, wrong: mr.wrong, hints: mr.hints, basket: mr.forBasket });
    E.save(); E.refreshWatch();
    const fb = mr.forBasket, lv = mr.lv, wrong = mr.wrong, hints = mr.hints;
    open(P => {
      P.glass(410, 90, 1100, 880, 60);
      P.circle(W / 2, 220, 80, C.green); drawGlyph(P.ctx, 'check', W / 2, 220, 100);
      P.text(perfect ? '모두 기억해서 땄어요!' : '꽃을 다 땄어요!', W / 2, 360, { size: 54, weight: 700 });
      const label = reward ? `꽃 코인 +${reward}` : '오늘 보상은 다 받았어요', ts = reward ? 38 : 30;
      P.ctx.font = `700 ${ts}px ${FONT}`;
      const tw = P.ctx.measureText(label).width, pw = tw + 44 + 24 + 64, px = W / 2 - pw / 2;
      P.rect(px, 410, pw, 80, 40, 'rgba(238,244,232,0.85)');
      drawGlyph(P.ctx, 'coin', px + 32 + 22, 450, 44);
      P.text(label, px + 32 + 44 + 24, 452, { size: ts, weight: 700, color: C.greenDark, align: 'left' });
      P.text(`잘못 고른 꽃 ${wrong}번 · 다시 보기 ${hints}번`, W / 2, 540, { size: 32, color: C.sub });
      P.text(unlocked ? `${lv + 1}단계가 열렸어요. 딴 꽃은 꽃 창고에 넣었어요.` : '딴 꽃은 꽃 창고에 넣었어요. 꽃 시장에서 팔 수 있어요.', W / 2, 595, { size: 32, color: C.sub, maxW: 900 });
      if (fb) P.button('basket', 560, 650, 800, 105, '꽃바구니 만들러 가기', () => { const id = bk.style; mrReturn = () => basketCheck(id); E.exitMR(true); }, { kind: 'primary', voice: ['꽃바구니', '만들러'] });
      else P.button('again', 560, 650, 800, 105, '한 번 더 하기', () => mrAgain(), { kind: 'primary', voice: ['한 번 더', '다시'] });
      P.button('home', 560, 775, 800, 105, '정원으로 돌아가기', () => { mrReturn = null; E.exitMR(true); }, { voice: ['정원으로', '돌아가기'] });
    }, 'front', 'mrDone');
  }
  function mrAgain() {
    const lv = mrLevel();
    mrClear();
    mr = { lv, target: mrTarget(lv), picked: {}, wrong: 0, hints: 0, forBasket: false, items: [], phase: 'wait' };
    mrSpawn(); mrShowTarget(false);
  }
  // ================= 꽃바구니 만들기 =================
  let bk = null; // { style, mode, slots: [type|null], order: [type], pick }
  let CUSTOM = null; // 내 마음대로 만든 바구니
  const bStyle = id => id === 'custom' ? CUSTOM : BASKETS.find(x => x.id === id) || (S.baskets.find(b => b.style === id && b.custom) || {}).custom;
  function basketNeeds(st) {
    const miss = [];
    Object.entries(st.flowers).forEach(([t, n]) => { const h = S.flowers[t] || 0; if (h < n) miss.push({ kind: 'flower', id: t, need: n - h }); });
    st.tools.forEach(id => { if (!inv(id)) miss.push({ kind: 'tool', id, need: 1 }); });
    Object.entries(st.use).forEach(([id, n]) => { if (inv(id) < n) miss.push({ kind: 'use', id, need: n - inv(id) }); });
    return miss;
  }
  // 1. 바구니 고르기
  function basketStart() {
    open(P => {
      exitBtn(P, () => trainingArea());
      P.glass(560, 40, 800, 130, 60);
      P.text('꽃바구니 만들기', W / 2, 92, { size: 54, weight: 700 });
      P.text('마음에 드는 바구니를 골라 주세요', W / 2, 145, { size: 30, color: C.sub });
      BASKETS.forEach((st, i) => {
        const x = 130 + i * 420, y = 230, w = 390, h = 640, hov = P.hover === st.id;
        P.rect(x, y, w, h, 44, hov ? '#fff' : 'rgba(255,255,255,0.5)', hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 7 : 3);
        try { P.ctx.drawImage(b3Thumb(st), x + w / 2 - 160, y + 25, 320, 320); } catch (e) { drawBasket(P, x + w / 2, y + 200, 0.62, Object.entries(st.flowers).flatMap(([t, n]) => Array(n).fill(t))); }
        P.text(st.name, x + w / 2, y + 380, { size: 42, weight: 700 });
        P.text(st.desc, x + w / 2, y + 430, { size: 28, color: C.sub, maxW: w - 40 });
        Object.entries(st.flowers).forEach(([t, n], k, arr) => {
          const cx = x + w / 2 + (k - (arr.length - 1) / 2) * 110;
          P.icon(FLOWERS[t].icon, cx, y + 505, 64); P.text(`×${n}`, cx, y + 562, { size: 28, weight: 700 });
        });
        drawGlyph(P.ctx, 'coin', x + w / 2 - 70, y + 610, 30); P.text(`팔면 ${basketPrice(st)}`, x + w / 2 + 14, y + 612, { size: 28, weight: 700, color: C.greenDark });
        P.hit(st.id, x, y, w, h, () => basketCheck(st.id), { voice: [st.name, st.name.split(' ')[0]] });
      });
      { // 내 마음대로 만들기
        const x = 130 + 3 * 420, y = 230, w = 390, h = 640, hov = P.hover === 'custom';
        P.rect(x, y, w, h, 44, hov ? '#fff' : 'rgba(255,255,255,0.5)', hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 7 : 3);
        P.circle(x + w / 2, y + 185, 120, 'rgba(255,255,255,0.7)', C.green, 4);
        P.icon('ic_basket', x + w / 2, y + 175, 170);
        P.circle(x + w / 2 + 85, y + 255, 34, C.green); P.text('+', x + w / 2 + 85, y + 252, { size: 52, weight: 700, color: '#fff' });
        P.text('내 마음대로', x + w / 2, y + 380, { size: 42, weight: 700 });
        P.text('꽃과 꾸미기 재료를\n직접 골라 만들어요', x + w / 2, y + 450, { size: 28, color: C.sub, maxW: w - 40 });
        P.text('값은 고른 재료에 따라 정해져요', x + w / 2, y + 590, { size: 24, color: C.sub, maxW: w - 30 });
        P.hit('custom', x, y, w, h, () => customSetup(), { voice: ['마음대로', '내 마음대로', '직접'] });
      }
      const made = (S.baskets || []).length;
      P.hint(made ? `지금까지 꽃바구니 ${made}개를 만들었어요` : '바구니를 누르면 필요한 재료를 보여 드려요', 920, 900);
    }, 'front', 'basketStart');
    E.say('꽃바구니 만들기. 마음에 드는 바구니를 골라 주세요.');
  }
  // 내 마음대로: 꽃 종류·수와 꾸미기 재료를 직접 고르기
  let cust = { flowers: { tulip: 1, daisy: 1, sunflower: 1 }, ribbon: 1, wrap: 0 };
  function customStyle() {
    const flowers = Object.fromEntries(Object.entries(cust.flowers).filter(([, n]) => n > 0));
    const use = { basket: 1 }; if (cust.ribbon) use.ribbon = cust.ribbon; if (cust.wrap) use.wrap = cust.wrap;
    return { id: 'custom', name: '나만의 꽃바구니', desc: '내가 고른 꽃으로 만든 바구니', flowers, tools: ['pruners'], use };
  }
  function customSetup() {
    open(P => {
      exitBtn(P, () => basketStart());
      P.glass(460, 40, 1000, 130, 60);
      P.text('내 마음대로 꽃바구니', W / 2, 92, { size: 52, weight: 700 });
      P.text('꽃은 모두 9송이까지 넣을 수 있어요', W / 2, 145, { size: 28, color: C.sub });
      const total = Object.values(cust.flowers).reduce((a, b) => a + b, 0);
      P.glass(200, 200, 900, 680, 50, 'rgba(255,255,255,0.32)');
      P.text('꽃', 650, 250, { size: 38, weight: 700 });
      Object.keys(FLOWERS).forEach((t, k) => {
        const y = 300 + k * 180, n = cust.flowers[t];
        P.rect(240, y, 820, 160, 32, 'rgba(255,255,255,0.55)');
        P.icon(FLOWERS[t].icon, 330, y + 80, 110);
        P.text(FLOWERS[t].name, 420, y + 60, { size: 38, weight: 700, align: 'left' });
        P.text(`내 ${FLOWERS[t].name}: ${S.flowers[t] || 0}송이`, 420, y + 110, { size: 26, color: C.sub, align: 'left' });
        P.button('m' + t, 750, y + 40, 90, 80, '−', () => { cust.flowers[t] = Math.max(0, n - 1); main.refresh(); }, { size: 46, disabled: !n, voice: [] });
        P.text(String(n), 885, y + 82, { size: 44, weight: 700 });
        P.button('p' + t, 930, y + 40, 90, 80, '+', () => { cust.flowers[t] = n + 1; main.refresh(); }, { size: 46, disabled: total >= 9, voice: [] });
      });
      P.glass(1140, 200, 580, 680, 50, 'rgba(255,255,255,0.32)');
      P.text('꾸미기 재료', 1430, 250, { size: 38, weight: 700 });
      const opt = (y, id, val, max, set) => {
        P.rect(1170, y, 520, 150, 32, 'rgba(255,255,255,0.55)');
        shopIcon(P, id, 1250, y + 75, 100);
        P.text(ITEMS[id].name, 1320, y + 55, { size: 34, weight: 700, align: 'left' });
        P.text(`내 ${ITEMS[id].name}: ${inv(id)}개`, 1320, y + 105, { size: 24, color: C.sub, align: 'left' });
        if (max) {
          P.button('m' + id, 1480, y + 40, 70, 70, '−', () => { set(Math.max(0, val - 1)); main.refresh(); }, { size: 40, disabled: !val, voice: [] });
          P.text(String(val), 1580, y + 77, { size: 40, weight: 700 });
          P.button('p' + id, 1610, y + 40, 70, 70, '+', () => { set(Math.min(max, val + 1)); main.refresh(); }, { size: 40, disabled: val >= max, voice: [] });
        } else P.text('1개 (꼭 필요해요)', 1680, y + 78, { size: 26, color: C.greenDark, align: 'right' });
      };
      opt(300, 'basket', 1, 0, () => {});
      opt(470, 'ribbon', cust.ribbon, 3, v => cust.ribbon = v);
      opt(640, 'wrap', cust.wrap, 2, v => cust.wrap = v);
      const st = customStyle();
      drawGlyph(P.ctx, 'coin', 760, 945, 40);
      P.text(`다 만들면 ${total ? basketPrice(st) : 0}코인에 팔 수 있어요`, 790, 947, { size: 32, weight: 700, color: C.greenDark, align: 'left' });
      P.button('next', 1300, 900, 420, 100, '재료 확인하기', () => { CUSTOM = customStyle(); basketCheck('custom'); }, { kind: 'primary', disabled: !total, voice: ['확인', '다음'] });
    }, 'front', 'customSetup');
    E.say('꽃과 꾸미기 재료를 골라 주세요');
  }
  // 2~3. 필요한 재료와 보관함 확인
  function basketCheck(id) {
    const st = bStyle(id), miss = basketNeeds(st);
    open(P => {
      exitBtn(P, () => basketStart());
      P.glass(200, 40, 1520, 130, 60);
      P.text(st.name, W / 2, 92, { size: 50, weight: 700 });
      P.text('필요한 재료예요. 초록 표시는 이미 있는 것, 빨간 표시는 부족한 것이에요', W / 2, 145, { size: 28, color: C.sub });
      const col = (x, title, sub, rows) => {
        P.glass(x, 200, 480, 600, 44, 'rgba(255,255,255,0.32)');
        P.text(title, x + 240, 250, { size: 38, weight: 700 }); P.text(sub, x + 240, 292, { size: 24, color: C.sub });
        rows.forEach((r, k) => {
          const y = 330 + k * 150;
          P.rect(x + 30, y, 420, 130, 30, 'rgba(255,255,255,0.55)', r.ok ? 'rgba(255,255,255,0.95)' : C.danger, r.ok ? 3 : 4);
          r.draw(x + 105, y + 65);
          P.text(r.name, x + 180, y + 48, { size: 32, weight: 700, align: 'left' });
          P.text(r.line, x + 180, y + 92, { size: 26, color: r.ok ? C.sub : C.danger, align: 'left' });
          P.circle(x + 410, y + 65, 22, r.ok ? C.green : C.danger); drawGlyph(P.ctx, r.ok ? 'check' : 'close', x + 410, y + 65, 24);
        });
      };
      col(220, '꽃', 'MR 꽃밭에서 따거나 정원에서 키워요', Object.entries(st.flowers).map(([t, n]) => ({ name: `${FLOWERS[t].name} ${n}송이`, line: `내 ${FLOWERS[t].name}: ${S.flowers[t] || 0}송이`, ok: (S.flowers[t] || 0) >= n, draw: (x, y) => P.icon(FLOWERS[t].icon, x, y, 90) })));
      col(720, '도구', '한 번 사면 계속 쓸 수 있어요', st.tools.map(id => ({ name: ITEMS[id].name, line: inv(id) ? '가지고 있어요' : '없어요', ok: !!inv(id), draw: (x, y) => shopIcon(P, id, x, y, 90) })));
      col(1220, '꾸미기 재료', '바구니를 만들 때마다 써요', Object.entries(st.use).map(([id, n]) => ({ name: `${ITEMS[id].name} ${n}개`, line: `내 ${ITEMS[id].name}: ${inv(id)}개`, ok: inv(id) >= n, draw: (x, y) => shopIcon(P, id, x, y, 90) })));
      if (!miss.length) {
        P.button('make', 560, 840, 800, 110, '재료가 모두 있어요 · 만들기 시작', () => basketMode(id), { kind: 'primary', size: 40, voice: ['만들기', '시작'] });
      } else {
        const needShop = miss.some(m => m.kind !== 'flower'), needFlower = miss.some(m => m.kind === 'flower');
        P.text('부족한 것을 잘 기억해 두세요. 가게와 꽃밭에서는 목록을 보여 주지 않아요', W / 2, 838, { size: 30, weight: 600, color: C.greenDark });
        const btns = [];
        if (needShop) btns.push(['shop', '기억 꽃집에 사러 가기', () => { bk = { style: id }; guideTo('shop'); }, ['꽃집', '사러']]);
        if (needFlower) btns.push(['mr', 'MR 꽃밭에 꽃 따러 가기', () => { bk = { style: id }; guideTo('mr'); }, ['꽃밭', '꽃 따러']]);
        btns.push(['again', id === 'custom' ? '재료 다시 고르기' : '바구니 다시 고르기', () => id === 'custom' ? customSetup() : basketStart(), ['다시']]);
        const bw = (1300 - (btns.length - 1) * 20) / btns.length;
        btns.forEach((b, k) => P.button(b[0], 310 + k * (bw + 20), 880, bw, 100, b[1], b[2], { kind: k === 0 ? 'primary' : 'secondary', size: 34, voice: b[3] }));
      }
    }, 'front', 'basketCheck');
    E.say(miss.length ? `부족한 재료가 ${miss.length}가지 있어요. 잘 기억해 두세요.` : '재료가 모두 있어요. 꽃바구니를 만들어 볼까요?');
  }
  // 6. 따라 꽂기 / 자유롭게 꽂기
  function basketMode(id) {
    const st = bStyle(id);
    open(P => {
      exitBtn(P, () => basketCheck(id));
      P.glass(460, 120, 1000, 820, 60);
      P.text('어떻게 꽂아 볼까요?', W / 2, 220, { size: 56, weight: 700 });
      [['guide', '따라 꽂기', '빛나는 자리에\n알려 주는 꽃을 꽂아요'], ['free', '자유롭게 꽂기', '내가 원하는 자리에\n마음대로 꽂아요']].forEach(([m, t, d], k) => {
        const x = 520 + k * 450, y = 290, w = 430, h = 460, hov = P.hover === m;
        P.rect(x, y, w, h, 40, hov ? '#fff' : 'rgba(255,255,255,0.5)', hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 7 : 3);
        drawBasket(P, x + w / 2, y + 170, 0.5, m === 'guide' ? ['tulip', null, 'daisy', null] : ['daisy', 'tulip', null, 'sunflower'], m === 'guide' ? 1 : -1);
        P.text(t, x + w / 2, y + 330, { size: 44, weight: 700 });
        P.text(d, x + w / 2, y + 400, { size: 28, color: C.sub, maxW: w - 40 });
        P.hit(m, x, y, w, h, () => basketMake(id, m), { voice: [t, t.split(' ')[0]] });
      });
      P.hint('“따라 꽂기”나 “자유롭게”라고 말해도 돼요', 810);
    }, 'front', 'basketMode');
  }
  function basketMake(id, mode) {
    const st = bStyle(id);
    const order = shuffle(Object.entries(st.flowers).flatMap(([t, n]) => Array(n).fill(t)));
    bk = { style: id, mode, slots: Array(order.length).fill(null), order, pick: null, left: { ...st.flowers } };
    b3Show(order.length);
    basketDraw();
    E.say(mode === 'guide' ? '빛나는 자리에 알려 주는 꽃을 꽂아 주세요.' : '꽃을 고른 뒤 바구니의 빈자리를 눌러 꽂아 주세요.');
  }
  function basketDraw() {
    const st = bStyle(bk.style), n = bk.slots.length;
    const next = bk.slots.indexOf(null);
    open(P => {
      exitBtn(P, () => { bk = null; basketCheck(st.id); });
      P.glass(470, 30, 980, 110, 55);
      const done = next < 0;
      P.text(done ? '다 꽂았어요!' : bk.mode === 'guide' ? `빛나는 자리에 ${FLOWERS[bk.order[next]].name}를 꽂아 주세요` : (bk.pick ? `${FLOWERS[bk.pick].name}를 꽂을 자리를 눌러 주세요` : '오른쪽에서 꽃을 골라 주세요'), W / 2, 86, { size: 42, weight: 700 });
      // 가운데는 비워 두고, 앞에 놓인 3D 바구니에 꽃을 꽂아요
      b3Update(bk.slots, bk.mode === 'guide' && !done ? next : -1, bk.mode === 'guide' && !done ? bk.order[next] : null);
      if (bk.mode === 'free' && !done) P.text(bk.pick ? '바구니의 하얀 동그라미를 눌러 꽂아요 · 꽂은 꽃을 누르면 다시 빼요' : '', W / 2, 160, { size: 28, color: '#444' });
      // 꽃 고르는 칸
      const types = Object.keys(st.flowers);
      types.forEach((t, k) => {
        const x = 1560, y = 200 + k * 220, sel = bk.pick === t, left = bk.left[t];
        P.rect(x, y, 230, 200, 36, sel ? '#fff' : 'rgba(255,255,255,0.5)', sel ? C.green : 'rgba(255,255,255,0.95)', sel ? 7 : 3);
        P.ctx.save(); if (!left) P.ctx.globalAlpha = 0.35; P.icon(FLOWERS[t].icon, x + 115, y + 80, 110); P.ctx.restore();
        P.text(`${FLOWERS[t].name} ${left}`, x + 115, y + 170, { size: 30, weight: 700, color: left ? C.ink : '#999' });
        P.hit('f' + t, x, y, 230, 200, () => basketPick(t), { disabled: !left || done, voice: [FLOWERS[t].name] });
      });
      if (done) P.button('finish', 1500, 880, 360, 110, '완성하기', () => basketFinish(), { kind: 'primary', size: 40, voice: ['완성', '다 했어요'] });
    }, 'front', 'basketMake');
  }
  function basketPick(t) {
    if (bk.mode === 'guide') {
      const next = bk.slots.indexOf(null);
      if (bk.order[next] !== t) { E.toast(`이번에는 ${FLOWERS[bk.order[next]].name}를 꽂아 볼까요?`, false); return; }
      bk.slots[next] = t; bk.left[t]--; basketDraw(); return;
    }
    bk.pick = bk.pick === t ? null : t; basketDraw();
  }
  function basketSlot(k) {
    if (bk.mode === 'guide') { const nx = bk.slots.indexOf(null); if (nx >= 0) E.toast(`오른쪽에서 ${FLOWERS[bk.order[nx]].name}를 골라 주세요`, false); return; }
    if (bk.slots[k]) { bk.left[bk.slots[k]]++; bk.slots[k] = null; basketDraw(); return; } // 다시 빼기
    if (!bk.pick || !bk.left[bk.pick]) return;
    bk.slots[k] = bk.pick; bk.left[bk.pick]--; if (!bk.left[bk.pick]) bk.pick = null; basketDraw();
  }
  // 7. 완성: 전시 · 선물 · 팔기
  function basketFinish() {
    const st = bStyle(bk.style);
    Object.entries(st.flowers).forEach(([t, n]) => useFlower(t, n));
    Object.entries(st.use).forEach(([id, n]) => addInv(id, -n));
    const item = { style: st.id, slots: bk.slots.slice(), mode: bk.mode, t: Date.now(), state: 'new', custom: st.id === 'custom' ? JSON.parse(JSON.stringify(st)) : null };
    S.baskets.push(item);
    log('train', { game: 'basket', style: st.id, mode: bk.mode });
    E.save(); E.refreshWatch();
    const idx = S.baskets.length - 1; bk = null;
    basketDone(idx);
    B3.slots.forEach(s => { s.mk.visible = false; s.hb.visible = false; });
  }
  function basketDone(idx) {
    const b = S.baskets[idx], st = b.custom || bStyle(b.style);
    open(P => {
      exitBtn(P, () => closeAll('꽃바구니를 만들었어요'));
      if (!B3.group) { b3Show(b.slots.length); b3Update(b.slots, -1, null); B3.slots.forEach(s => { s.mk.visible = false; s.hb.visible = false; }); }
      P.glass(560, 40, 800, 150, 60);
      P.text('꽃바구니가 완성됐어요!', W / 2, 100, { size: 54, weight: 700 });
      P.text(st.name, W / 2, 158, { size: 30, color: C.sub });
      P.glass(1420, 220, 460, 720, 50);
      if (b.state === 'new') {
        P.text('이 꽃바구니를', 1650, 300, { size: 34, weight: 600 }); P.text('어떻게 할까요?', 1650, 345, { size: 34, weight: 600 });
        P.button('show', 1470, 410, 360, 110, '전시하기', () => { b.state = 'shown'; E.save(); placeShownBaskets(); E.toast('티파티 탁자 옆에 전시했어요'); basketDone(idx); }, { size: 36, voice: ['전시'] });
        P.button('gift', 1470, 545, 360, 110, '선물하기', () => {
          b.state = 'gift'; S.letters.unshift({ from: '딸', text: `엄마가 만든 ${st.name} 정말 예뻐요! 고마워요.` });
          log('wish', { from: '딸', type: 'basket' }); E.save(); E.toast('딸에게 꽃바구니를 보냈어요. 우편함에 답장이 왔어요'); basketDone(idx);
        }, { size: 36, voice: ['선물'] });
        P.button('sell', 1470, 680, 360, 110, `팔기 (+${basketPrice(st)})`, () => { b.state = 'sold'; S.coins += basketPrice(st); E.save(); E.refreshWatch(); E.toast(`꽃 코인 ${basketPrice(st)}개를 받았어요`); basketDone(idx); }, { size: 34, voice: ['팔기', '팔아'] });
      } else {
        P.text(b.state === 'shown' ? '티파티 탁자 옆에\n전시했어요' : b.state === 'gift' ? '딸에게 선물했어요.\n우편함을 확인해 보세요' : `꽃 코인 ${basketPrice(st)}개를\n받았어요`, 1650, 360, { size: 32, weight: 600, color: C.greenDark, maxW: 400 });
        P.button('more', 1470, 560, 360, 100, '또 만들기', () => basketStart(), { kind: 'primary', voice: ['또', '다시'] });
        P.button('home', 1470, 690, 360, 100, '정원으로', () => closeAll('정원으로 돌아왔어요'), { voice: ['정원'] });
      }
    }, 'front', 'basketDone');
    E.say('꽃바구니가 완성됐어요!');
  }
  // ---------- 3D 꽃바구니 (모델링한 바구니와 꽃) ----------
  const WICKER = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#b8814a'; c.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
      const x = k * 32, y = r * 32, odd = (r + k) % 2;
      const g = c.createLinearGradient(x, y, x, y + 32); g.addColorStop(0, odd ? '#d9a466' : '#c78f52'); g.addColorStop(1, odd ? '#b07740' : '#9c6634');
      c.fillStyle = g; c.beginPath(); c.roundRect(x + 2, y + 3, 28, 26, 10); c.fill();
    }
    c.strokeStyle = 'rgba(90,55,25,0.35)'; c.lineWidth = 3; for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32, 256); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1.4); t.anisotropy = 4;
    return t;
  })();
  const B3 = { group: null, slots: [], flowers: [], ghost: null, glowT: 0 };
  const BS = 0.72; // 바구니 크기 (꽃에 비해 작게)
  function slotXZ(n) {
    const out = [];
    if (n === 1) return [[0, 0]];
    const inner = n >= 6 ? 1 : 0;
    if (inner) out.push([0, 0]);
    const m = n - inner;
    for (let k = 0; k < m; k++) { const a = (k / m) * Math.PI * 2 + 0.3; out.push([Math.cos(a) * 0.075 * BS / 0.72, Math.sin(a) * 0.06 * BS / 0.72]); }
    return out;
  }
  function makeBasket3D(n) {
    const g = new THREE.Group();
    const wick = new THREE.MeshStandardMaterial({ map: WICKER, roughness: 0.9, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x9a6534, roughness: 0.85 });
    const prof = [[0.0, 0], [0.12, 0], [0.135, 0.008], [0.16, 0.08], [0.175, 0.14]].map(([r, y]) => new THREE.Vector2(r * BS, y * BS));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), wick); g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.177 * BS, 0.011, 10, 48).rotateX(Math.PI / 2), dark); rim.position.y = 0.14 * BS; g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17 * BS, 0.01, 10, 40, Math.PI), dark); handle.position.y = 0.14 * BS; g.add(handle);
    const moss = new THREE.Mesh(new THREE.CircleGeometry(0.165 * BS, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6e8f4a, roughness: 1 })); moss.position.y = 0.125 * BS; g.add(moss);
    // 빈자리 표시 (누르면 꽃을 꽂아요)
    const slots = slotXZ(n).map(([x, z], k) => {
      const mk = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.03, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      mk.position.set(x, 0.129 * BS + 0.002, z); g.add(mk);
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 10), new THREE.MeshBasicMaterial({ visible: false }));
      hb.position.set(x, 0.2, z); g.add(hb);
      hb.userData.onSelect = () => { if (bk && bk.slots) basketSlot(k); };
      hb.userData.onHover = on => { mk.scale.setScalar(on ? 1.4 : 1); };
      E.addTarget(hb);
      return { mk, hb, x, z };
    });
    return { g, slots };
  }
  function flower3D(t, ghost) {
    const src = stageModels[t + '_bloom']; if (!src) return new THREE.Group();
    const m = src.clone(true); const h = src.userData.height || 1;
    const H = t === 'sunflower' ? 0.34 : 0.28; m.scale.setScalar(H / h); m.userData.sink = H * 0.5;
    if (ghost) m.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.35; c.material.depthWrite = false; } });
    return m;
  }
  function placeFlower(f, sl, k) {
    const r = Math.hypot(sl.x, sl.z), tilt = r > 0.01 ? 0.38 : 0.05;
    f.position.set(sl.x, 0.13 * BS - (f.userData.sink || 0) * 0.8, sl.z);
    f.rotation.set(r > 0.01 ? (sl.z / r) * tilt : 0, (k * 1.7) % 6.28, r > 0.01 ? -(sl.x / r) * tilt : 0, 'XZY');
  }
  function b3Show(n) {
    b3Hide();
    const { g, slots } = makeBasket3D(n);
    const hw = E.headWorld(), yaw = E.headYaw(), xr = E.inXR();
    const d = xr ? 0.7 : 0.95;
    g.position.set(hw.x - Math.sin(yaw) * d, hw.y - (xr ? 0.42 : 0.33), hw.z - Math.cos(yaw) * d);
    g.rotation.y = yaw; g.scale.setScalar(xr ? 1.2 : 1.25);
    E.scene.add(g);
    B3.group = g; B3.slots = slots; B3.flowers = Array(n).fill(null);
  }
  function b3Hide() {
    if (!B3.group) return;
    B3.slots.forEach(s => { s.hb.userData.onSelect = null; s.hb.visible = false; });
    E.scene.remove(B3.group); B3.group = null; B3.slots = []; B3.flowers = []; B3.ghost = null;
  }
  function b3Update(slotsArr, glow, glowType) {
    if (!B3.group) return;
    slotsArr.forEach((t, k) => {
      const sl = B3.slots[k]; if (!sl) return;
      const cur = B3.flowers[k];
      if ((cur && cur.userData.t) !== t) {
        if (cur) B3.group.remove(cur);
        B3.flowers[k] = null;
        if (t) {
          const f = flower3D(t); f.userData.t = t; placeFlower(f, sl, k);
          B3.group.add(f); B3.flowers[k] = f;
        }
      }
      sl.mk.visible = !t; sl.mk.material.color.set(k === glow ? 0x7fc768 : 0xffffff);
      sl.hb.visible = true;
    });
    if (B3.ghost) { B3.group.remove(B3.ghost); B3.ghost = null; }
    if (glow >= 0 && glowType) { const sl = B3.slots[glow]; const gh = flower3D(glowType, true); placeFlower(gh, sl, glow); B3.group.add(gh); B3.ghost = gh; }
  }
  // 바구니 고르기 화면용 작은 3D 사진
  const b3Thumbs = {};
  function b3Thumb(st) {
    if (b3Thumbs[st.id]) return b3Thumbs[st.id];
    const R = E.renderer, size = 360;
    const types = Object.entries(st.flowers).flatMap(([t, n]) => Array(n).fill(t));
    const { g, slots } = makeBasket3D(types.length);
    slots.forEach(s => { s.mk.visible = false; s.hb.userData.onSelect = null; s.hb.visible = false; });
    types.forEach((t, k) => { const f = flower3D(t); placeFlower(f, slots[k], k); g.add(f); });
    const sc = new THREE.Scene(); sc.add(g); sc.add(new THREE.HemisphereLight(0xfffbea, 0x9a8f70, 1.8)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(1, 2, 1.5); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 10); cam.position.set(0, 0.45, 0.85); cam.lookAt(0, 0.16, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    const xrOn = R.xr.enabled, prev = R.getRenderTarget(), cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
    R.xr.enabled = false; R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(sc, cam);
    const px = new Uint8Array(size * size * 4); R.readRenderTargetPixels(rt, 0, 0, size, size, px);
    R.setRenderTarget(prev); R.xr.enabled = xrOn; R.setClearColor(cc, ca); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'); const im = c.createImageData(size, size);
    for (let y = 0; y < size; y++) im.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    c.putImageData(im, 0, 0);
    b3Thumbs[st.id] = cv; return cv;
  }
  // 전시한 꽃바구니는 티파티 탁자 옆에 놓여요
  const shownBaskets = [];
  function placeShownBaskets() {
    shownBaskets.forEach(o => E.scene.remove(o)); shownBaskets.length = 0;
    const spots = [[45.9, -5.2], [48.1, -5.2], [47.0, -3.5]];
    (S.baskets || []).filter(b => b.state === 'shown').slice(-3).forEach((b, k) => {
      const { g, slots } = makeBasket3D(b.slots.length);
      slots.forEach(s => { s.mk.visible = false; s.hb.userData.onSelect = null; s.hb.visible = false; });
      b.slots.forEach((t, j) => { if (!t) return; const f = flower3D(t); placeFlower(f, slots[j], j); g.add(f); });
      g.position.copy(B(spots[k][0], spots[k][1], 0.14)); g.scale.setScalar(1.6);
      E.scene.add(g); shownBaskets.push(g);
    });
  }

  // 바구니 그림: 몸통 + 손잡이 + 꽃 자리
  function basketSlotPos(n, cx, cy, s) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1), a = Math.PI * (0.86 - 0.72 * t);
      const ring = k % 2 ? 0.78 : 1;
      out.push([cx + Math.cos(a) * 190 * s * ring, cy - 30 * s - Math.sin(a) * 120 * s * ring]);
    }
    return out;
  }
  function drawBasket(P, cx, cy, s, slots, glow = -1, glowType = null) {
    const ctx = P.ctx;
    ctx.save();
    ctx.strokeStyle = '#a8743f'; ctx.lineWidth = 16 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(cx, cy - 10 * s, 190 * s, 190 * s, 0, Math.PI, 0); ctx.stroke();
    const pos = basketSlotPos(slots.length, cx, cy, s);
    pos.forEach((p, k) => {
      const t = slots[k];
      if (t) P.icon(FLOWERS[t].icon, p[0], p[1], 110 * s);
      else {
        ctx.setLineDash([10 * s, 8 * s]); ctx.strokeStyle = k === glow ? C.green : 'rgba(120,90,50,0.45)'; ctx.lineWidth = (k === glow ? 6 : 3) * s;
        ctx.beginPath(); ctx.arc(p[0], p[1], 42 * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (k === glow) { ctx.fillStyle = 'rgba(159,217,138,0.35)'; ctx.fill(); if (glowType) { ctx.globalAlpha = 0.45; P.icon(FLOWERS[glowType].icon, p[0], p[1], 70 * s); ctx.globalAlpha = 1; } }
      }
    });
    // 몸통
    ctx.fillStyle = '#c98f52'; ctx.beginPath();
    ctx.moveTo(cx - 210 * s, cy - 10 * s); ctx.lineTo(cx + 210 * s, cy - 10 * s); ctx.lineTo(cx + 160 * s, cy + 150 * s); ctx.lineTo(cx - 160 * s, cy + 150 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(110,70,30,0.35)'; ctx.lineWidth = 5 * s;
    for (let r = 1; r < 4; r++) { const y = cy - 10 * s + r * 40 * s, w = 210 * s - r * 12.5 * s; ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx + w, y); ctx.stroke(); }
    for (let c = -3; c <= 3; c++) { ctx.beginPath(); ctx.moveTo(cx + c * 55 * s, cy - 10 * s); ctx.lineTo(cx + c * 42 * s, cy + 150 * s); ctx.stroke(); }
    ctx.fillStyle = '#b07a42'; rrect(ctx, cx - 220 * s, cy - 26 * s, 440 * s, 30 * s, 15 * s); ctx.fill();
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // ================= 반짝 꽃 찾기 =================
  // 단계가 끝없이 이어지고, 올라갈수록 칸과 꽃이 늘고 시간이 줄어요
  let flashSel = Math.max(1, S.flashLevel), flashPage = Math.floor((flashSel - 1) / 5), flash = null, flashTimer = null;
  const PX = 1.9 / W; // 패널 1픽셀의 실제 크기(미터)
  const tiles = [];
  for (let i = 0; i < 25; i++) {
    const t = new Panel(300, 300, 0.3, { renderOrder: 70 });
    t.idx = i;
    E.addPanel(t, main.mesh); t.show(false);
    tiles.push(t);
  }
  function tilesHide() { tiles.forEach(t => t.show(false)); }
  function stopFlashTimer() { if (flashTimer) { clearInterval(flashTimer); flashTimer = null; } }
  function drawTile(t) {
    t.setView(P => {
      const st = flash ? flash.cell[t.idx] : {};
      const hov = P.hover === 't' && flash && flash.phase.startsWith('choose');
      const sel = st.sel || st.bsel;
      P.rect(8, 8, 284, 284, 44, sel ? 'rgba(227,239,220,0.85)' : 'rgba(255,255,255,0.24)', sel || hov ? C.green : 'rgba(255,255,255,0.95)', sel || hov ? 8 : 3);
      if (st.show) { P.circle(150, 150, 96, 'rgba(238,244,232,0.9)'); P.icon(st.show, 150, 150, 150); }
      if (st.bshow) drawGlyph(P.ctx, 'butterfly', st.show ? 225 : 150, st.show ? 80 : 150, st.show ? 90 : 150);
      if (st.bsel && !st.bshow) drawGlyph(P.ctx, 'butterfly', 150, 150, 90);
      if (st.good) { P.circle(250, 50, 30, C.green); drawGlyph(P.ctx, 'check', 250, 50, 34); }
      if (st.bad) { P.circle(250, 50, 30, C.danger); drawGlyph(P.ctx, 'close', 250, 50, 34); }
      P.hit('t', 0, 0, 300, 300, () => flashPick(t.idx), { voice: [] });
    });
  }
  function flashStart() {
    stopFlashTimer(); flash = null;
    open(P => {
      exitBtn(P);
      P.glass(560, 90, 800, 860, 60);
      P.circle(W / 2, 240, 115, '#eef4e8'); P.icon('anemone', W / 2, 240, 190);
      P.text('반짝 꽃 찾기', W / 2, 425, { size: 72, weight: 700 });
      P.text('꽃의 위치를 기억하세요', W / 2, 500, { size: 38, color: C.sub });
      const first = flashPage * 5 + 1;
      P.button('prev', 585, 560, 64, 80, '‹', () => { flashPage = Math.max(0, flashPage - 1); main.refresh(); }, { disabled: flashPage === 0, size: 50, voice: ['이전'] });
      P.button('nextp', 1271, 560, 64, 80, '›', () => { flashPage++; main.refresh(); }, { disabled: first + 5 > S.flashLevel + 1, size: 50, voice: ['다음 단계들'] });
      for (let k = 0; k < 5; k++) {
        const l = first + k, x = 660 + k * 122, locked = l > S.flashLevel;
        P.button('lv' + l, x, 560, 112, 80, `${l}단계`, () => { flashSel = l; main.refresh(); }, { kind: flashSel === l ? 'chipOn' : 'secondary', disabled: locked, size: 27, voice: [`${l}단계`] });
        if (locked) { P.circle(x + 100, 566, 18, C.lock); drawGlyph(P.ctx, 'lock', x + 100, 566, 25); }
      }
      const cf = flashCfg(flashSel);
      P.text(`${cf.cols}×${cf.rows}칸 · 꽃 ${cf.n}송이${cf.bfly ? ' · 나비' : ''} · 대답 시간 ${cf.limit}초`, W / 2, 685, { size: 30, color: C.greenDark, weight: 600 });
      P.button('start', 660, 740, 600, 110, '시작하기', () => flashInstr(), { kind: 'primary', voice: ['시작'] });
      P.hint('“시작”이라고 말해 보세요', 970, 560);
    }, placeOf('flash'), 'flashStart');
    E.say('반짝 꽃 찾기. 꽃의 위치를 기억하세요.');
  }
  function flashInstr() {
    open(P => {
      exitBtn(P, () => flashStart());
      P.glass(260, 140, 1400, 800, 60);
      P.text('반짝 꽃 찾기', W / 2, 230, { size: 64, weight: 700 });
      const steps = ['꽃이 몇 초 동안 나타나요', '어느 칸에 있었는지 기억하세요', '시간 안에 그 칸을 가리키세요'];
      steps.forEach((s, i) => {
        const x = 330 + i * 430, y = 300;
        P.rect(x, y, 400, 300, 40, 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.95)', 3);
        P.circle(x + 40, y + 40, 24, C.green); P.text(String(i + 1), x + 40, y + 42, { size: 30, weight: 700, color: '#fff' });
        if (i === 0) { P.circle(x + 200, y + 150, 90, '#eef4e8'); P.icon('anemone', x + 200, y + 150, 140); }
        else {
          for (let k = 0; k < 4; k++) {
            const cx = x + 140 + (k % 2) * 120, cy = y + 90 + Math.floor(k / 2) * 120;
            P.rect(cx - 50, cy - 50, 100, 100, 18, 'rgba(255,255,255,0.58)', i === 2 && k === 1 ? C.green : '#e6e6e0', i === 2 && k === 1 ? 6 : 2);
            if (i === 1 && k === 1) P.icon('anemone', cx, cy, 70);
          }
          if (i === 2) { P.circle(x + 350, y + 60, 34, '#fff', C.green, 6); P.text('5', x + 350, y + 62, { size: 34, weight: 700, color: C.green }); }
        }
        P.text(s, x + 200, y + 360, { size: 34, weight: 600, maxW: 400 });
      });
      P.text('단계가 올라갈수록 칸과 꽃이 늘고 시간이 짧아져요. 4단계부터는 나비도 나와요.', W / 2, 740, { size: 30, color: C.sub });
      P.button('ok', 660, 800, 600, 100, '확인', () => flashRun(flashSel), { kind: 'primary', voice: ['확인', '시작'] });
    }, placeOf('flash'), 'flashInstr');
    E.say('꽃이 몇 초 동안 나타나요. 어느 칸에 있었는지 기억하세요.');
  }
  function flashTitle() {
    const f = flash, cf = f.cfg;
    if (f.phase === 'show') return cf.n > 1 ? `꽃 ${cf.n}송이의 위치를 기억하세요` : '꽃의 위치를 기억하세요';
    if (f.phase === 'chooseB') return '나비는 어디에 앉아 있었나요?';
    if (f.phase === 'choose') return cf.n > 1 ? `꽃 ${cf.n}송이는 어디에 있었나요?` : '꽃이 어디에 있었나요?';
    return '정답을 확인해요';
  }
  function flashRun(level) {
    stopFlashTimer();
    const cfg = flashCfg(level);
    const N = cfg.cols * cfg.rows;
    const order = shuffle([...Array(N).keys()]);
    const cells = order.slice(0, cfg.n);
    const bcell = cfg.bfly ? order[cfg.n] : -1;
    const kinds = shuffle([...FLASH_POOL]).slice(0, cfg.n);
    flash = { level, cfg, answer: cells, bcell, kinds, picks: [], bpick: -1, phase: 'show', cell: [...Array(25)].map(() => ({})), t0: performance.now(), dur: cfg.show };
    cells.forEach((c, i) => { flash.cell[c].show = kinds[i]; });
    if (bcell >= 0) flash.cell[bcell].bshow = true;
    open(P => {
      if (!flash) return;
      exitBtn(P, () => { stopFlashTimer(); flash = null; closeAll('반짝 꽃 찾기를 마쳤어요'); });
      P.rect(W - 280, 50, 220, 80, 40, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
      P.text(`${level}단계`, W - 170, 92, { size: 36, weight: 700, color: C.green });
      P.glass(470, 40, 980, 120, 60);
      P.text(flashTitle(), W / 2, 101, { size: 48, weight: 700 });
      // 옆에 남은 시간 표시
      if (flash.phase !== 'reveal') {
        const left = Math.max(0, flash.dur - (performance.now() - flash.t0));
        const p = left / flash.dur, cx = 1700, cy = 560, r = 120;
        const col = flash.phase === 'show' ? C.green : (left < 3000 ? C.danger : C.blue);
        P.circle(cx, cy, r + 26, 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0.95)', 3);
        P.ctx.lineCap = 'round'; P.ctx.lineWidth = 18;
        P.ctx.strokeStyle = 'rgba(0,0,0,0.08)'; P.ctx.beginPath(); P.ctx.arc(cx, cy, r, 0, Math.PI * 2); P.ctx.stroke();
        P.ctx.strokeStyle = col; P.ctx.beginPath(); P.ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); P.ctx.stroke();
        P.text(String(Math.ceil(left / 1000)), cx, cy - 6, { size: 96, weight: 700, color: col });
        P.text(flash.phase === 'show' ? '기억 시간' : '남은 시간', cx, cy + 62, { size: 28, weight: 600, color: C.sub });
      }
      const tip = flash.phase === 'choose' ? (cfg.n > 1 ? `칸을 가리키고\n버튼을 누르세요 (${flash.picks.length}/${cfg.n})` : '칸을 가리키고\n버튼을 누르세요') : flash.phase === 'chooseB' ? '나비가 있던 칸을\n골라 주세요' : '';
      if (tip) { P.rect(1540, 740, 320, 130, 36, 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.95)', 3); P.text(tip, 1700, 805, { size: 30, weight: 600, color: '#444', maxW: 300 }); }
    }, placeOf('flash'), 'flashRun');
    // 칸 배치: 제목 아래(190px)부터 아래 끝(1020px)까지, 오른쪽 타이머를 피해서
    const gap = 0.035;
    const availH = (1020 - 190) * PX, availW = (1500 - 260) * PX;
    const size = Math.min(0.3, (availH - gap * (cfg.rows - 1)) / cfg.rows, (availW - gap * (cfg.cols - 1)) / cfg.cols);
    const cxM = (880 - W / 2) * PX, cyM = (H / 2 - 605) * PX;
    for (let i = 0; i < 25; i++) {
      const t = tiles[i];
      if (i >= N) { t.show(false); continue; }
      const c = i % cfg.cols, r = Math.floor(i / cfg.cols);
      t.mesh.scale.setScalar(size / 0.3);
      t.mesh.position.set(cxM + (c - (cfg.cols - 1) / 2) * (size + gap), cyM - (r - (cfg.rows - 1) / 2) * (size + gap), 0.02);
      t.mesh.rotation.set(0, 0, 0);
      drawTile(t); t.show(true);
    }
    E.say(flashTitle());
    flashTimer = setInterval(() => {
      if (!flash || current !== 'flashRun') { stopFlashTimer(); return; }
      const el = performance.now() - flash.t0;
      if (el >= flash.dur) {
        if (flash.phase === 'show') {
          flash.phase = 'choose'; flash.t0 = performance.now(); flash.dur = cfg.limit * 1000;
          flash.cell.forEach(c => { c.show = null; c.bshow = false; });
          tiles.forEach(t => t.visible && t.refresh());
          E.say(flashTitle());
        } else if (flash.phase === 'choose' || flash.phase === 'chooseB') {
          flashFinish(true);
          return;
        }
      }
      main.refresh();
    }, 100);
  }
  function flashPick(i) {
    if (!flash) return;
    const c = flash.cell[i];
    if (flash.phase === 'choose') {
      if (c.sel) { c.sel = false; flash.picks = flash.picks.filter(p => p !== i); }
      else { c.sel = true; flash.picks.push(i); }
      tiles[i].refresh(); main.refresh();
      if (flash.picks.length >= flash.cfg.n) {
        if (flash.bcell >= 0) { flash.phase = 'chooseB'; main.refresh(); E.say(flashTitle()); }
        else flashFinish(false);
      }
    } else if (flash.phase === 'chooseB') {
      flash.bpick = i; c.bsel = true; tiles[i].refresh();
      flashFinish(false);
    }
  }
  function flashFinish(timeout) {
    if (!flash || flash.phase === 'reveal') return;
    const f = flash;
    f.phase = 'reveal'; stopFlashTimer();
    const okFlowers = f.picks.length === f.cfg.n && f.picks.every(p => f.answer.includes(p));
    const okB = f.bcell < 0 || f.bpick === f.bcell;
    const ok = !timeout && okFlowers && okB;
    f.answer.forEach((a, k) => { f.cell[a].show = f.kinds[k]; f.cell[a].good = true; });
    if (f.bcell >= 0) { f.cell[f.bcell].bshow = true; if (f.bpick === f.bcell) f.cell[f.bcell].good = true; }
    f.picks.forEach(p => { if (!f.answer.includes(p)) f.cell[p].bad = true; });
    if (f.bpick >= 0 && f.bpick !== f.bcell) f.cell[f.bpick].bad = true;
    tiles.forEach(t => t.visible && t.refresh()); main.refresh();
    if (timeout) E.toast('시간이 다 됐어요. 정답을 확인해 볼까요?', false);
    setTimeout(() => flashResult(ok, timeout), 1800);
  }
  function flashResult(ok, timeout) {
    const lv = flash.level;
    let reward = 0, unlocked = false;
    if (ok) {
      reward = Math.max(0, Math.min(10, 50 - S.trainCoinsToday));
      S.coins += reward; S.trainCoinsToday += reward;
      if (lv === S.flashLevel) { S.flashLevel++; unlocked = true; }
    }
    log('train', { game: 'flash', level: lv, ok, timeout: !!timeout, rec: S.rec === 'flash' }); qev('flash');
    E.save(); E.refreshWatch();
    flash = null;
    open(P => {
      exitBtn(P);
      P.rect(W - 280, 50, 220, 80, 40, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
      P.text(`${lv}단계`, W - 170, 92, { size: 36, weight: 700, color: C.green });
      P.glass(560, 110, 800, 800, 60);
      if (ok) { P.circle(W / 2, 255, 90, C.green); drawGlyph(P.ctx, 'check', W / 2, 255, 110); }
      else { P.circle(W / 2, 255, 90, '#eef4e8'); P.icon('anemone', W / 2, 255, 135); }
      P.text(ok ? '잘 기억했어요!' : timeout ? '시간이 다 됐어요' : '아쉬워요! 다시 해 볼까요?', W / 2, 405, { size: 56, weight: 700 });
      if (ok) {
        const label = reward ? `꽃 코인 +${reward}` : '오늘 보상은 다 받았어요', ts = reward ? 38 : 30;
        P.ctx.font = `700 ${ts}px ${FONT}`;
        const tw = P.ctx.measureText(label).width, pw = tw + 44 + 24 + 64, px = W / 2 - pw / 2;
        P.rect(px, 450, pw, 80, 40, 'rgba(238,244,232,0.75)');
        drawGlyph(P.ctx, 'coin', px + 32 + 22, 490, 44);
        P.text(label, px + 32 + 44 + 24, 492, { size: ts, weight: 700, color: C.greenDark, align: 'left' });
      }
      P.text(ok ? (unlocked ? `${lv + 1}단계가 열렸어요. 틀려도 점수는 깎이지 않아요.` : '틀려도 점수는 깎이지 않아요.') : '초록 표시가 정답 칸이에요. 틀려도 점수는 깎이지 않아요.', W / 2, 580, { size: 30, color: C.sub, maxW: 700 });
      const nextLv = ok ? lv + 1 : lv;
      P.button('next', 660, 650, 600, 95, ok ? '다음 단계로' : '다시 하기', () => { flashSel = nextLv; flashPage = Math.floor((nextLv - 1) / 5); flashRun(nextLv); }, { kind: 'primary', voice: ['다음', '다시'] });
      P.button('home', 660, 765, 600, 95, '정원으로 돌아가기', () => closeAll('정원으로 돌아왔어요'), { voice: ['정원으로', '돌아가기'] });
    }, placeOf('flash'), 'flashResult');
    E.say(ok ? '잘 기억했어요!' : '아쉬워요! 다시 해 볼까요?');
  }

  // ================= 기억 꽃집 =================
  let shopSel = 1, shop = null;
  const shopIcon = (P, id, cx, cy, s) => {
    const it = ITEMS[id];
    P.icon(it.icon, cx, cy, s);
    if (it.kind === 'seed') { P.circle(cx + s * 0.32, cy + s * 0.3, s * 0.24, '#fff'); P.icon(FLOWERS[it.flower].icon, cx + s * 0.32, cy + s * 0.3, s * 0.4); }
  };
  function shopStart() {
    open(P => {
      P.glass(560, 110, 800, 820, 60);
      P.circle(W / 2, 270, 120, '#eef4e8'); P.icon('watering_can', W / 2, 270, 190);
      P.text('기억 꽃집', W / 2, 460, { size: 72, weight: 700 });
      P.text('살 물건을 기억해서 골라요', W / 2, 540, { size: 38, color: C.sub });
      [1, 2, 3].forEach(l => {
        const locked = l > S.shopLevel;
        P.button('lv' + l, 640 + (l - 1) * 220, 600, 200, 80, `${l}단계`, () => { shopSel = l; main.refresh(); }, { kind: shopSel === l ? 'chipOn' : 'secondary', disabled: locked, size: 34, voice: [`${l}단계`] });
        if (locked) { P.circle(640 + (l - 1) * 220 + 180, 606, 20, C.lock); drawGlyph(P.ctx, 'lock', 640 + (l - 1) * 220 + 180, 606, 28); }
      });
      P.button('start', 660, 730, 600, 110, '시작하기', () => shopInstr(), { kind: 'primary', voice: ['시작'] });
      exitBtn(P);
      P.hint('“시작”이라고 말해 보세요', 960, 560);
    }, placeOf('shop'), 'shopStart');
    E.say('기억 꽃집. 살 물건을 기억해서 골라요.');
  }
  // 훈련 없이 사기: 장바구니에 담고 → 장바구니 확인 → 직접 코인을 세어 계산
  let buyTab = 0, cart = {}, cartPay = { tray: [], msg: '', tries: 0 };
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(cart).reduce((a, [id, q]) => a + ITEMS[id].price * q, 0);
  function shopBuy() {
    setTimeout(() => qev('buy'), 2500);
    open(P => {
      exitBtn(P, () => closeAll('기억 꽃집을 나왔어요'));
      P.glass(470, 40, 980, 120, 60);
      P.text('기억 꽃집', W / 2, 88, { size: 54, weight: 700 });
      P.text('필요한 물건을 눌러 장바구니에 담아요', W / 2, 138, { size: 28, color: C.sub });
      P.coinChip(W - 300, 58, S.coins);
      SHOP_TABS.forEach((t, i) => P.button('tab' + i, 400 + i * 380, 200, 350, 84, t, () => { buyTab = i; main.refresh(); }, { kind: buyTab === i ? 'chipOn' : 'secondary', size: 34, voice: [t] }));
      const ids = Object.keys(ITEMS).filter(id => ITEMS[id].tab === buyTab);
      ids.forEach((id, i) => {
        const c = i % 4, r = Math.floor(i / 4);
        const x = 300 + c * 335, y = 310 + r * 300, w = 310, h = 280, it = ITEMS[id], q = cart[id] || 0, hov = P.hover === id;
        P.rect(x, y, w, h, 36, q ? 'rgba(227,239,220,0.9)' : hov ? '#fff' : 'rgba(255,255,255,0.5)', q || hov ? C.green : 'rgba(255,255,255,0.95)', q || hov ? 6 : 3);
        shopIcon(P, id, x + w / 2, y + 100, 150);
        P.text(it.name, x + w / 2, y + 195, { size: 34, weight: 700 });
        P.ctx.font = `700 30px ${FONT}`;
        const pt = String(it.price), pw = P.ctx.measureText(pt).width + 34 + 12;
        drawGlyph(P.ctx, 'coin', x + w / 2 - pw / 2 + 17, y + 244, 32);
        P.text(pt, x + w / 2 - pw / 2 + 46, y + 246, { size: 30, weight: 700, align: 'left', color: C.greenDark });
        if (q) { P.circle(x + w - 40, y + 40, 30, C.green); P.text(String(q), x + w - 40, y + 42, { size: 32, weight: 700, color: '#fff' }); }
        P.hit(id, x, y, w, h, () => { cart[id] = q + 1; E.toast(`${it.name}를 장바구니에 담았어요`, false); main.refresh(); }, { voice: [it.name] });
      });
      const n = cartCount();
      P.button('cart', 1020, 945, 520, 95, n ? `장바구니 보기 (${n}개)` : '장바구니가 비어 있어요', () => cartView(), { kind: 'primary', disabled: !n, size: 36, voice: ['장바구니', '계산'] });
      P.button('train', 380, 945, 600, 95, '기억 훈련으로 사기', () => shopStart(), { size: 32, voice: ['훈련', '기억 훈련'] });
    }, placeOf('shop'), 'shopBuy');
    E.say('기억 꽃집이에요. 필요한 물건을 눌러 장바구니에 담아요.');
  }
  function cartView() {
    open(P => {
      exitBtn(P, () => shopBuy());
      P.glass(460, 40, 1000, 120, 60);
      P.text('장바구니', W / 2, 101, { size: 54, weight: 700 });
      const ent = Object.entries(cart).filter(([, q]) => q > 0);
      P.glass(360, 190, 1200, 700, 50);
      const rowH = ent.length > 5 ? 96 : 116;
      ent.slice(0, 6).forEach(([id, q], i) => {
        const y = 220 + i * (rowH + 10), it = ITEMS[id];
        P.rect(400, y, 1120, rowH, 28, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, 470, y + rowH / 2, rowH * 0.75);
        P.text(it.name, 540, y + rowH / 2, { size: 38, weight: 700, align: 'left' });
        drawGlyph(P.ctx, 'coin', 870, y + rowH / 2, 34);
        P.text(`${it.price}  ×  ${q}`, 900, y + rowH / 2 + 2, { size: 34, weight: 600, align: 'left', color: C.sub });
        P.button('m' + id, 1190, y + rowH / 2 - 36, 90, 72, '−', () => { cart[id]--; if (!cart[id]) delete cart[id]; main.refresh(); }, { size: 44, voice: [] });
        P.text(String(q), 1320, y + rowH / 2 + 2, { size: 40, weight: 700 });
        P.button('p' + id, 1360, y + rowH / 2 - 36, 90, 72, '+', () => { cart[id]++; main.refresh(); }, { size: 44, voice: [] });
        P.roundBtn('x' + id, 1490, y + rowH / 2, 24, 'close', () => { delete cart[id]; main.refresh(); }, []);
      });
      if (!ent.length) P.text('장바구니가 비어 있어요', W / 2, 540, { size: 40, color: C.sub });
      P.text('합계는 직접 더해서 계산할 때 코인으로 내요', W / 2, 860, { size: 28, color: C.sub });
      P.button('more', 460, 930, 480, 100, '더 고르기', () => shopBuy(), { voice: ['더 고르기', '더'] });
      P.button('pay', 980, 930, 480, 100, '계산하기', () => { cartPay = { tray: [], msg: '', tries: 0 }; cartPayView(); }, { kind: 'primary', disabled: !ent.length, voice: ['계산'] });
    }, placeOf('shop'), 'cartView');
    E.say('장바구니예요. 산 물건을 확인해 보세요.');
  }
  function cartPayView() {
    open(P => {
      exitBtn(P, () => cartView());
      P.glass(400, 40, 1120, 120, 60);
      P.text('가격을 모두 더해서 꽃 코인을 내 주세요', W / 2, 101, { size: 46, weight: 700 });
      const ent = Object.entries(cart);
      P.glass(120, 200, 720, 700, 50);
      P.text('장바구니', 170, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      const rowH = ent.length > 4 ? 80 : 100;
      ent.slice(0, 6).forEach(([id, q], i) => {
        const y = 290 + i * (rowH + 12);
        P.rect(160, y, 640, rowH, 24, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, 220, y + rowH / 2, rowH * 0.7);
        P.text(ITEMS[id].name + (q > 1 ? ` ×${q}` : ''), 280, y + rowH / 2 + 2, { size: 34, weight: 700, align: 'left' });
        P.text(`${ITEMS[id].price}코인${q > 1 ? ' × ' + q : ''}`, 780, y + rowH / 2 + 2, { size: 30, align: 'right', color: C.sub });
      });
      P.text('합계', 180, 845, { size: 40, weight: 700, align: 'left' });
      P.rect(600, 805, 180, 80, 20, 'rgba(227,239,220,0.7)', C.green, 3);
      P.text(cartPay.tries >= 2 ? String(cartTotal()) : '?', 690, 847, { size: 44, weight: 700, color: C.greenDark });
      P.glass(880, 200, 920, 700, 50);
      P.text('내 꽃 코인', 930, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      P.text('코인을 눌러 쟁반에 올려 주세요', 930, 295, { size: 28, color: C.sub, align: 'left' });
      [10, 5, 1].forEach((v, i) => {
        const cx = 1060 + i * 280, cy = 420, hov = P.hover === 'c' + v;
        P.circle(cx, cy, hov ? 82 : 76, C.gold, C.goldDark, 6);
        P.text(String(v), cx, cy + 4, { size: 56, weight: 700, color: '#5a4310' });
        P.hit('c' + v, cx - 85, cy - 85, 170, 170, () => { cartPay.tray.push(v); cartPay.msg = ''; main.refresh(); }, { voice: [] });
      });
      P.text('결제 쟁반', 930, 560, { size: 34, weight: 700, align: 'left' });
      P.text('잘못 올린 코인은 눌러서 빼요', 1110, 562, { size: 24, color: C.sub, align: 'left' });
      P.button('undo', 1530, 530, 230, 56, '하나 빼기', () => { cartPay.tray.pop(); cartPay.msg = ''; main.refresh(); }, { size: 26, disabled: !cartPay.tray.length, voice: ['빼기', '하나 빼'] });
      P.rect(920, 590, 840, 200, 36, 'rgba(255,255,255,0.58)');
      cartPay.tray.slice(0, 14).forEach((v, i) => {
        const cx = 980 + (i % 7) * 78, cy = 640 + Math.floor(i / 7) * 90, hov = P.hover === 'tray' + i;
        P.circle(cx, cy, hov ? 40 : 36, C.gold, hov ? C.danger : C.goldDark, hov ? 5 : 4); P.text(String(v), cx, cy + 2, { size: 30, weight: 700, color: '#5a4310' });
        if (hov) { P.circle(cx + 28, cy - 28, 14, C.danger); P.text('×', cx + 28, cy - 29, { size: 22, weight: 700, color: '#fff' }); }
        P.hit('tray' + i, cx - 38, cy - 38, 76, 76, () => { cartPay.tray.splice(i, 1); cartPay.msg = ''; main.refresh(); }, { voice: [] });
      });
      const sum = cartPay.tray.reduce((a, b) => a + b, 0);
      P.text(`올린 코인 ${sum}`, 1730, 750, { size: 36, weight: 700, color: C.green, align: 'right' });
      if (cartPay.msg) P.text(cartPay.msg, 1340, 850, { size: 30, weight: 600, color: C.danger, maxW: 820 });
      P.button('reset', 420, 930, 500, 95, '처음부터 다시', () => { cartPay.tray = []; cartPay.msg = ''; main.refresh(); }, { voice: ['처음부터', '다시'] });
      P.button('pay', 960, 930, 540, 95, '계산하기', () => {
        const total = cartTotal();
        if (sum !== total) {
          cartPay.tries++;
          cartPay.msg = (sum > total ? '조금 많이 올렸어요. 다시 세어 볼까요?' : '조금 모자라요. 가격을 다시 더해 볼까요?') + (cartPay.tries >= 2 ? ` 합계는 ${total}코인이에요.` : '');
          E.say(cartPay.msg); main.refresh(); return;
        }
        if (S.coins < total) { cartPay.msg = `꽃 코인이 ${total - S.coins}개 모자라요. 물건을 조금 빼 볼까요?`; main.refresh(); return; }
        S.coins -= total; Object.entries(cart).forEach(([id, q]) => addInv(id, q));
        log('buy', { items: { ...cart }, total, tries: cartPay.tries }); E.save(); E.refreshWatch();
        const bought = Object.entries(cart); cart = {};
        open(Q => {
          exitBtn(Q, () => closeAll('기억 꽃집을 나왔어요'));
          Q.glass(460, 120, 1000, 820, 60);
          Q.circle(W / 2, 270, 90, C.green); drawGlyph(Q.ctx, 'check', W / 2, 270, 110);
          Q.text('잘 계산했어요!', W / 2, 420, { size: 56, weight: 700 });
          Q.text(`꽃 코인 ${total}개를 냈어요 · 보관함에 넣었어요`, W / 2, 485, { size: 32, color: C.sub });
          bought.slice(0, 6).forEach(([id, q], k) => { const cx = W / 2 + (k - (Math.min(6, bought.length) - 1) / 2) * 150; shopIcon(Q, id, cx, 590, 100); Q.text(`×${q}`, cx, 665, { size: 30, weight: 700 }); });
          Q.button('more', 560, 760, 390, 100, '더 사기', () => shopBuy(), { voice: ['더'] });
          Q.button('home', 970, 760, 390, 100, '정원으로', () => closeAll('정원으로 돌아왔어요'), { kind: 'primary', voice: ['정원'] });
        }, placeOf('shop'), 'cartDone');
        E.say('잘 계산했어요!');
      }, { kind: 'primary', disabled: !sum, voice: ['계산'] });
    }, placeOf('shop'), 'cartPay');
    E.say('가격을 모두 더해서 꽃 코인을 내 주세요');
  }
  function shopInstr() {
    open(P => {
      P.glass(260, 140, 1400, 800, 60);
      P.text('기억 꽃집', W / 2, 230, { size: 64, weight: 700 });
      const st = ['쇼핑 목록 보기', '살 물건 기억하기', '물건을 고르고 계산하기'];
      st.forEach((s, i) => {
        const x = 330 + i * 430, y = 300;
        P.rect(x, y, 400, 300, 40, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3);
        P.circle(x + 40, y + 40, 24, C.green); P.text(String(i + 1), x + 40, y + 42, { size: 30, weight: 700, color: '#fff' });
        if (i === 0) { P.rect(x + 90, y + 60, 220, 180, 24, '#fff'); P.icon('pot', x + 150, y + 110, 70); P.icon('seeds', x + 250, y + 110, 70); P.rect(x + 120, y + 175, 160, 14, 7, '#ddd'); P.rect(x + 120, y + 205, 110, 14, 7, '#ddd'); }
        if (i === 1) { P.circle(x + 200, y + 150, 90, '#eef4e8'); P.text('?', x + 200, y + 156, { size: 110, weight: 700, color: C.green }); }
        if (i === 2) { ['hose', 'pot', 'gloves'].forEach((ic, k) => { P.rect(x + 40 + k * 110, y + 100, 100, 100, 20, '#fff', k === 1 ? C.green : '#e6e6e0', k === 1 ? 6 : 2); P.icon(ic, x + 90 + k * 110, y + 150, 80); }); }
        P.text(s, x + 200, y + 360, { size: 34, weight: 600 });
      });
      P.text('꽃집에 들어가면 목록은 보이지 않아요. 잘못 사도 물건은 보관함에 남아요.', W / 2, 740, { size: 30, color: C.sub });
      P.button('ok', 660, 800, 600, 100, '확인', () => shopList(shopSel), { kind: 'primary', voice: ['확인', '시작'] });
      exitBtn(P);
    }, placeOf('shop'), 'shopInstr');
  }
  function makeList(level) {
    const useful = ['seed_tulip', 'seed_daisy', 'seed_sunflower', 'pot', 'fertilizer', 'soil', 'gloves', 'watering_can', 'labels', 'ribbon', 'basket', 'wrap', 'hand_fork', 'hoe'];
    // 쓸모 있는 물건을 먼저 (씨앗, 비료)
    const pri = shuffle(['seed_tulip', 'seed_daisy', 'seed_sunflower', 'fertilizer']).slice(0, 2);
    const rest = shuffle(useful.filter(x => !pri.includes(x)));
    const n = level === 1 ? 2 : level === 2 ? 3 + rnd(2) : 5;
    const ids = [...pri, ...rest].slice(0, n);
    return shuffle(ids).map(id => ({ id, qty: level === 3 && !ITEMS[id].tool && Math.random() < 0.5 ? 2 : 1 }));
  }
  function shopList(level) {
    shop = { level, list: makeList(level), picked: {}, tab: 0, tray: [], tries: 0 };
    const total = 8000 + shop.list.length * 2500;
    const t0 = performance.now();
    open(P => {
      exitBtn(P, () => { shop = null; closeAll('기억 꽃집을 마쳤어요'); });
      P.glass(560, 40, 800, 120, 60);
      P.text('살 물건 기억하기', W / 2, 101, { size: 50, weight: 700 });
      const n = shop.list.length, rowH = n > 3 ? 104 : 130;
      const ph = 120 + n * (rowH + 16);
      P.glass(560, 200, 800, ph, 50);
      P.text('쇼핑 목록', W / 2, 250, { size: 34, weight: 700, color: C.green });
      shop.list.forEach((l, i) => {
        const y = 290 + i * (rowH + 16);
        P.rect(610, y, 700, rowH, 28, 'rgba(255,255,255,0.58)');
        shopIcon(P, l.id, 700, y + rowH / 2, rowH * 0.72);
        P.text(ITEMS[l.id].name + (l.qty > 1 ? `  ${l.qty}개` : ''), 790, y + rowH / 2 + 2, { size: 44, weight: 700, align: 'left' });
      });
      const left = Math.max(0, 1 - (performance.now() - t0) / total);
      P.rect(660, 230 + ph, 600, 14, 7, 'rgba(255,255,255,0.5)');
      P.rect(660, 230 + ph, 600 * left, 14, 7, C.green);
      P.button('done', 660, 270 + ph, 600, 100, '다 기억했어요', () => shopPick(), { kind: 'primary', voice: ['다 기억', '기억했어요', '다했어요'] });
    }, placeOf('shop'), 'shopList');
    E.say('쇼핑 목록. ' + shop.list.map(l => ITEMS[l.id].name + (l.qty > 1 ? ` ${l.qty}개` : '')).join(', '));
    const timer = setInterval(() => {
      if (!shop || current !== 'shopList') { clearInterval(timer); return; }
      main.refresh();
      if (performance.now() - t0 > total) { clearInterval(timer); shopPick(); }
    }, 250);
  }
  function shopPick() {
    open(P => {
      exitBtn(P, () => { shop = null; closeAll('기억 꽃집을 마쳤어요'); });
      P.glass(470, 40, 980, 120, 60);
      P.text('목록에 있던 물건을 골라 주세요', W / 2, 101, { size: 48, weight: 700 });
      SHOP_TABS.forEach((t, i) => P.button('tab' + i, 400 + i * 380, 200, 350, 84, t, () => { shop.tab = i; main.refresh(); }, { kind: shop.tab === i ? 'chipOn' : 'secondary', size: 34, voice: [t] }));
      const ids = Object.keys(ITEMS).filter(id => ITEMS[id].tab === shop.tab);
      ids.forEach((id, i) => {
        const c = i % 3, r = Math.floor(i / 3);
        const x = 470 + c * 340, y = 320 + r * 300, w = 310, h = 280;
        const q = shop.picked[id] || 0, hov = P.hover === id;
        P.rect(x, y, w, h, 36, q ? 'rgba(227,239,220,0.95)' : (hov ? '#fff' : 'rgba(255,255,255,0.58)'), q || hov ? C.green : 'rgba(255,255,255,0.95)', q || hov ? 7 : 3);
        shopIcon(P, id, x + w / 2, y + 110, 140);
        P.text(ITEMS[id].name, x + w / 2, y + 235, { size: 36, weight: 700 });
        if (q) { P.circle(x + w - 40, y + 40, 28, C.green); if (shop.level === 3 && q > 1) P.text('×' + q, x + w - 40, y + 42, { size: 28, weight: 700, color: '#fff' }); else drawGlyph(P.ctx, 'check', x + w - 40, y + 40, 32); }
        P.hit(id, x, y, w, h, () => {
          const cur = shop.picked[id] || 0;
          const max = shop.level === 3 && !ITEMS[id].tool ? 3 : 1;
          shop.picked[id] = cur >= max ? 0 : cur + 1;
          if (!shop.picked[id]) delete shop.picked[id];
          main.refresh();
        }, { voice: [ITEMS[id].name] });
      });
      const m = Object.keys(shop.picked).length;
      P.rect(470, 940, 420, 90, 45, 'rgba(255,255,255,0.58)');
      P.text(`${shop.list.length}개 중 ${m}개 선택`, 680, 986, { size: 38, weight: 700 });
      P.button('pay', 920, 940, 530, 90, '계산하기', () => shopPay(), { kind: 'primary', disabled: m === 0, voice: ['계산'] });
      if (shop.level === 3) P.text('여러 개가 필요하면 한 번 더 누르세요', W / 2, 300 - 12, { size: 26, color: '#555' });
    }, placeOf('shop'), 'shopPick');
    E.say('목록에 있던 물건을 골라 주세요');
  }
  const shopTotal = () => Object.entries(shop.picked).reduce((a, [id, q]) => a + ITEMS[id].price * q, 0);
  function shopPay() {
    shop.tray = []; shop.msg = '';
    open(P => {
      exitBtn(P, () => { shop = null; closeAll('기억 꽃집을 마쳤어요'); });
      P.glass(400, 40, 1120, 120, 60);
      P.text('가격을 모두 더해서 꽃 코인을 내 주세요', W / 2, 101, { size: 46, weight: 700 });
      // 고른 물건
      const ent = Object.entries(shop.picked);
      P.glass(120, 200, 720, 700, 50);
      P.text('고른 물건', 170, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      const rowH = ent.length > 4 ? 80 : 100;
      ent.forEach(([id, q], i) => {
        const y = 290 + i * (rowH + 12);
        P.rect(160, y, 640, rowH, 24, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, 220, y + rowH / 2, rowH * 0.7);
        P.text(ITEMS[id].name + (q > 1 ? ` ×${q}` : ''), 280, y + rowH / 2 + 2, { size: 36, weight: 700, align: 'left' });
        P.text(`${ITEMS[id].price * q}코인`, 780, y + rowH / 2 + 2, { size: 34, align: 'right', color: C.sub });
      });
      P.rect(160, 790, 640, 3, 1, 'rgba(0,0,0,0.12)');
      P.text('합계', 180, 845, { size: 40, weight: 700, align: 'left' });
      P.rect(600, 805, 180, 80, 20, 'rgba(227,239,220,0.7)', C.green, 3);
      P.text(shop.tries >= 2 ? String(shopTotal()) : '?', 690, 847, { size: 44, weight: 700, color: C.greenDark });
      // 코인
      P.glass(880, 200, 920, 700, 50);
      P.text('내 꽃 코인', 930, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      P.text('코인을 눌러 쟁반에 올려 주세요', 930, 295, { size: 28, color: C.sub, align: 'left' });
      [10, 5, 1].forEach((v, i) => {
        const cx = 1060 + i * 280, cy = 420, hov = P.hover === 'c' + v;
        P.circle(cx, cy, hov ? 82 : 76, C.gold, C.goldDark, 6);
        P.text(String(v), cx, cy + 4, { size: 56, weight: 700, color: '#5a4310' });
        P.hit('c' + v, cx - 85, cy - 85, 170, 170, () => { shop.tray.push(v); shop.msg = ''; main.refresh(); }, { voice: [] });
      });
      P.text('결제 쟁반', 930, 560, { size: 34, weight: 700, align: 'left' });
      P.text('잘못 올린 코인은 눌러서 빼요', 1110, 562, { size: 24, color: C.sub, align: 'left' });
      P.button('undo', 1530, 530, 230, 56, '하나 빼기', () => { shop.tray.pop(); shop.msg = ''; main.refresh(); }, { size: 26, disabled: !shop.tray.length, voice: ['빼기', '하나 빼'] });
      P.rect(920, 590, 840, 200, 36, 'rgba(255,255,255,0.58)');
      shop.tray.slice(0, 14).forEach((v, i) => {
        const cx = 980 + (i % 7) * 78, cy = 640 + Math.floor(i / 7) * 90, hov = P.hover === 'tray' + i;
        P.circle(cx, cy, hov ? 40 : 36, C.gold, hov ? C.danger : C.goldDark, hov ? 5 : 4); P.text(String(v), cx, cy + 2, { size: 30, weight: 700, color: '#5a4310' });
        if (hov) { P.circle(cx + 28, cy - 28, 14, C.danger); P.text('×', cx + 28, cy - 29, { size: 22, weight: 700, color: '#fff' }); }
        P.hit('tray' + i, cx - 38, cy - 38, 76, 76, () => { shop.tray.splice(i, 1); shop.msg = ''; main.refresh(); }, { voice: [] });
      });
      const sum = shop.tray.reduce((a, b) => a + b, 0);
      P.text(`올린 코인 ${sum}`, 1730, 750, { size: 36, weight: 700, color: C.green, align: 'right' });
      if (shop.msg) P.text(shop.msg, 1340, 850, { size: 30, weight: 600, color: C.danger, maxW: 820 });
      P.button('reset', 420, 930, 500, 95, '처음부터 다시', () => { shop.tray = []; shop.msg = ''; main.refresh(); }, { voice: ['처음부터', '다시'] });
      P.button('pay', 960, 930, 540, 95, '계산하기', () => {
        const total = shopTotal();
        if (sum === total) shopResult(total);
        else {
          shop.tries++;
          shop.msg = (sum > total ? '조금 많이 올렸어요. 다시 세어 볼까요?' : '조금 모자라요. 가격을 다시 더해 볼까요?') + (shop.tries >= 2 ? ` 합계는 ${total}코인이에요.` : '');
          E.say(shop.msg); main.refresh();
        }
      }, { kind: 'primary', disabled: !sum, voice: ['계산'] });
      P.hint('“계산”이라고 말해 보세요', 1040, 520);
    }, placeOf('shop'), 'shopPay');
    E.say('가격을 모두 더해서 꽃 코인을 내 주세요');
  }
  function shopResult(total) {
    const want = Object.fromEntries(shop.list.map(l => [l.id, l.qty]));
    const ent = Object.entries(shop.picked);
    let okN = 0;
    shop.list.forEach(l => { if ((shop.picked[l.id] || 0) === l.qty) okN++; });
    const allOk = okN === shop.list.length && ent.length === shop.list.length;
    const missing = shop.list.filter(l => (shop.picked[l.id] || 0) < l.qty).map(l => ITEMS[l.id].name);
    ent.forEach(([id, q]) => addInv(id, q));
    S.coins -= total;
    if (allOk && shop.level === S.shopLevel && S.shopLevel < 3) S.shopLevel++;
    log('train', { game: 'shop', level: shop.level, ok: allOk, correct: okN, of: shop.list.length, rec: S.rec === 'shop' }); qev('shopT');
    E.save(); E.refreshWatch();
    const lv = shop.level, listLen = shop.list.length;
    open(P => {
      exitBtn(P);
      P.glass(460, 70, 1000, 900, 60);
      const show = ent.slice(0, 5);
      show.forEach(([id], i) => {
        const x = W / 2 - show.length * 95 + i * 190;
        P.rect(x, 120, 170, 190, 30, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, x + 85, 195, 100);
        P.text(ITEMS[id].name, x + 85, 285, { size: 26, weight: 700 });
        if (want[id]) { P.circle(x + 150, 128, 24, C.green); drawGlyph(P.ctx, 'check', x + 150, 128, 28); }
      });
      P.text(allOk ? '모두 맞게 샀어요!' : `목록의 ${listLen}개 중 ${okN}개를 샀어요`, W / 2, 420, { size: 60, weight: 700 });
      if (!allOk && missing.length) P.text(`다음에는 ${missing.join(', ')}도 챙겨 봐요`, W / 2, 490, { size: 32, color: C.sub });
      P.rect(W / 2 - 200, 530, 400, 80, 40, '#eef4e8');
      drawGlyph(P.ctx, 'coin', W / 2 - 140, 570, 40);
      P.text(`꽃 코인 ${total}개 사용`, W / 2 + 20, 572, { size: 36, weight: 700, color: C.greenDark });
      P.text('결제가 끝났어요. 산 물건은 보관함에 넣어 두었어요.', W / 2, 660, { size: 30, color: C.sub });
      P.button('again', 660, 730, 600, 95, '다시 하기', () => { shopSel = Math.min(S.shopLevel, allOk && lv < 3 ? lv + 1 : lv); shopList(shopSel); }, { kind: 'primary', voice: ['다시'] });
      P.button('home', 660, 845, 600, 95, '정원으로 돌아가기', () => closeAll('정원으로 돌아왔어요'), { voice: ['정원으로', '돌아가기'] });
    }, placeOf('shop'), 'shopResult');
    E.say(allOk ? '모두 맞게 샀어요!' : `목록의 ${shop.list.length}개 중 ${okN}개를 샀어요`);
    shop = null;
  }

  // ================= 정원 가꾸기 =================
  // 화단의 8줄 이랑 위에 한 줄에 6자리 (Blender 좌표에서 잰 값)
  const ROW_Y = [-6.134, -5.695, -5.257, -4.818, -4.379, -3.941, -3.502, -3.064];
  const PER_ROW = 10;
  const COL_X = Array.from({ length: PER_ROW }, (_, k) => 36.84 + (43.18 - 36.84) * (k + 0.5) / PER_ROW);
  const SOIL_Z = 0.206;
  // 첫 줄은 무료, 둘째 줄 500, 셋째 줄 1000 … 지금은 초급 단계라 둘째 줄(500)까지만 열 수 있어요
  const OPEN_ROWS = 2, SLOT_MAX = OPEN_ROWS * PER_ROW;
  const unlockCost = i => 500 * Math.floor(i / PER_ROW);
  const UNLOCK_TOOLS = 3;
  const slotPos = i => [COL_X[i % PER_ROW], ROW_Y[Math.floor(i / PER_ROW)]];
  // 꽃이 필요로 하는 돌봄: 보관함에서 도구를 꺼내 꽃 위에 놓아요 (햇빛은 표시를 누르면 돼요)
  const NEED = {
    water: { name: '물', item: 'watering_can', bg: '#5a9bd8', glyph: 'water' },
    fert:  { name: '비료', item: 'fertilizer', bg: '#e9a23b', icon: 'fertilizer', use: true },
    pest:  { name: '벌레 잡기', item: 'pesticide', bg: '#e9a23b', glyph: 'bug', use: true },
    prune: { name: '가지치기', item: 'pruners', bg: '#e9a23b', icon: 'pruners' },
    weed:  { name: '잡초 뽑기', item: 'hand_fork', bg: '#e9a23b', icon: 'hand_fork' },
    soil:  { name: '흙 고르기', item: 'hoe', bg: '#e9a23b', icon: 'hoe' },
    sun:   { name: '햇빛', item: null, bg: '#f2c14e', glyph: 'sun' }
  };
  const ITEM_NEED = { watering_can: 'water', fertilizer: 'fert', pesticide: 'pest', pruners: 'prune', hand_fork: 'weed', hoe: 'soil' };
  function genNeeds(stage) {
    const n = { water: 1 };
    const pool = stage === 0 ? ['soil', 'sun', 'fert'] : ['fert', 'pest', 'prune', 'weed', 'soil', 'sun'];
    const picks = shuffle(pool.slice()).slice(0, stage === 0 ? 1 : 1 + rnd(2));
    picks.forEach(k => { n[k] = k === 'fert' ? 1 + rnd(3) : k === 'pest' ? 1 + rnd(2) : 1; });
    return n;
  }
  const needCount = s => s && s.needs ? Object.keys(s.needs).length : 0;
  function migrateSlot(s) {
    if (!s || s.needs) return;
    s.needs = {};
    if (s.stage < 3) { if (!s.watered) s.needs.water = 1; if (s.needFert) s.needs.fert = 1; }
  }
  function startGrowIfReady(s) {
    if (s.stage >= 3 || needCount(s) || s.readyAt) return false;
    s.dur = stageDur(s); s.readyAt = Date.now() + s.dur; s.watered = true; return true;
  }
  // 성장 단계 모델
  const stageModels = {};
  {
    const groups = { seedling: 'Seedling_', tulip_bud: 'Tulip_bud_', tulip_bloom: 'Tulip_bloom_', daisy_bud: 'Daisy_bud_', daisy_bloom: 'Daisy_bloom_', sunflower_bud: 'Sunflower_bud_', sunflower_bloom: 'Sunflower_bloom_' };
    for (const [k, pre] of Object.entries(groups)) {
      const g = new THREE.Group(); let stem = null;
      E.growthScene.traverse(o => {
        if (o.isMesh && o.name.startsWith(pre)) {
          const m = o.clone(); m.matrixAutoUpdate = true;
          o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
          m.material = o.material.clone(); m.material.side = THREE.DoubleSide;
          g.add(m); if (/stem/i.test(o.name)) stem = m;
        }
      });
      const box = new THREE.Box3().setFromObject(stem || g);
      const base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      g.children.forEach(c => c.position.sub(base));
      g.userData.height = new THREE.Box3().setFromObject(g).max.y;
      stageModels[k] = g;
    }
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 1 }));
    mound.scale.y = 0.45;
    const sg = new THREE.Group(); sg.add(mound); sg.userData.height = 0.05; stageModels.seed = sg;
  }
  const slotObjs = [];
  for (let i = 0; i < SLOT_MAX; i++) {
    const [x, y] = slotPos(i);
    const root = new THREE.Group(); root.position.copy(B(x, y, SOIL_Z));
    E.scene.add(root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.18, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.y = 0.015; root.add(ring);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.14, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    fill.position.y = 0.012; root.add(fill);
    const plus = new Bubble(128, 128, 0.09); plus.paint(ctx => { ctx.strokeStyle = '#fff'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(64, 24); ctx.lineTo(64, 104); ctx.moveTo(24, 64); ctx.lineTo(104, 64); ctx.stroke(); });
    plus.sprite.position.y = 0.1; root.add(plus.sprite);
    const plant = new THREE.Group(); root.add(plant);
    const status = new Bubble(560, 150, 1.0); root.add(status.sprite);
    const statusHit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    root.add(statusHit);
    statusHit.userData.onSelect = carried => { if (carried) return slotSelect(i, carried); const q = S.slots[i]; if (q && q.needs && q.needs.sun) return applyNeed(i, 'sun'); slotSelect(i); };
    E.addTarget(statusHit);
    // 누르는 범위: 빈자리는 땅 높이만, 꽃이 있으면 꽃 높이만큼 (뒤쪽 자리를 가리지 않게)
    const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 1.0, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.scale.y = 0.12; hitbox.position.y = 0.06; root.add(hitbox);
    hitbox.userData.onSelect = carried => slotSelect(i, carried);
    hitbox.userData.onHover = on => {
      ring.material.color.set(on ? 0x9fd98a : 0xffffff); fill.material.opacity = on ? 0.5 : 0.25; ring.scale.setScalar(on ? 1.12 : 1);
      // 물건을 들고 꽃 위에 오면 놓을 자리를 보여 줘요
      if (S.slots[i]) { ring.visible = fill.visible = on && !!E.carrying; }
      plant.scale.setScalar(on && E.carrying && S.slots[i] ? 1.06 : 1);
    };
    E.addTarget(hitbox);
    slotObjs.push({ root, ring, fill, plus, plant, status, statusHit, hitbox, key: '', sig: '' });
  }
  // 다음에 열 수 있는 자리: 점선 동그라미
  const lockSlot = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 14; ctx.setLineDash([22, 16]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(128, 128, 96, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const root = new THREE.Group(); E.scene.add(root);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    disc.position.y = 0.015; root.add(disc);
    const tag = new Bubble(300, 110, 0.24);
    const paintTag = cost => tag.paint((c, bb) => {
      c.fillStyle = 'rgba(255,255,255,0.78)'; c.beginPath(); c.roundRect(10, 10, bb.W - 20, 90, 45); c.fill();
      c.font = `700 44px ${FONT}`; const tw = c.measureText(String(cost)).width, x0 = bb.W / 2 - (46 + 14 + tw) / 2;
      drawGlyph(c, 'coin', x0 + 23, 55, 46);
      c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(String(cost), x0 + 60, 57);
    });
    tag.sprite.position.y = 0.2; root.add(tag.sprite);
    const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.3; root.add(hitbox);
    hitbox.userData.onSelect = carried => { if (carried) E.carry(null); activeZone = 'garden'; unlockPanel(); };
    hitbox.userData.onHover = on => { disc.scale.setScalar(on ? 1.12 : 1); disc.material.color.set(on ? 0x9fd98a : 0xffffff); };
    E.addTarget(hitbox);
    return { root, paintTag };
  })();
  function refreshSlots() {
    slotObjs.forEach((o, i) => { o.root.visible = i < S.slots.length; });
    const n = S.slots.length;
    lockSlot.root.visible = n < SLOT_MAX;
    if (n < SLOT_MAX) { const [x, y] = slotPos(n); lockSlot.root.position.copy(B(x, y, SOIL_Z)); lockSlot.paintTag(unlockCost(n)); }
  }
  const digTools = () => inv('hoe') + inv('hand_fork');
  function unlockPanel() {
    const n = S.slots.length;
    if (n >= SLOT_MAX) { E.toast('지금 열 수 있는 자리를 모두 열었어요'); return; }
    const COST = unlockCost(n), okC = S.coins >= COST, okT = digTools() >= UNLOCK_TOOLS;
    open(P => {
      P.glass(460, 150, 1000, 780, 60);
      P.roundBtn('x', 1400, 210, 40, 'close', () => closePopup(), ['닫기', '취소']);
      P.text('새 자리를 열까요?', W / 2, 240, { size: 56, weight: 700 });
      P.text(`지금 ${n}자리 · ${n + 1}번째 자리를 열 수 있어요`, W / 2, 310, { size: 32, color: C.sub });
      const row = (y, draw, label, have, ok) => {
        P.rect(560, y, 800, 130, 36, 'rgba(255,255,255,0.45)', ok ? 'rgba(255,255,255,0.95)' : C.danger, ok ? 3 : 4);
        draw(640, y + 65);
        P.text(label, 720, y + 50, { size: 38, weight: 700, align: 'left' });
        P.text(have, 720, y + 95, { size: 28, color: ok ? C.sub : C.danger, align: 'left' });
        if (ok) { P.circle(1290, y + 65, 30, C.green); drawGlyph(P.ctx, 'check', 1290, y + 65, 36); }
      };
      row(370, (x, y) => drawGlyph(P.ctx, 'coin', x, y, 64), `꽃 코인 ${COST}개`, `내 코인: ${S.coins}개`, okC);
      row(520, (x, y) => P.icon('hoe', x, y, 90), `땅 파는 도구 ${UNLOCK_TOOLS}개`, `호미나 손갈퀴 · 내 도구: ${digTools()}개`, okT);
      P.text(okC && okT ? '열면 코인과 도구를 사용해요' : !okT ? '도구는 기억 꽃집에서 살 수 있어요' : '훈련을 하면 꽃 코인을 모을 수 있어요', W / 2, 700, { size: 30, color: okC && okT ? C.sub : C.danger });
      P.button('no', 560, 770, 390, 100, '취소', () => closePopup(), { voice: ['취소'] });
      P.button('yes', 970, 770, 390, 100, '자리 열기', () => {
        S.coins -= COST;
        let need = UNLOCK_TOOLS;
        for (const id of ['hoe', 'hand_fork']) { const k = Math.min(need, inv(id)); addInv(id, -k); need -= k; }
        S.slots.push(null);
        log('garden', { act: 'unlock', n: S.slots.length });
        E.save(); E.refreshWatch(); refreshSlots(); updateSlot(S.slots.length - 1);
        closePopup(); E.toast(`새 자리가 생겼어요! 이제 ${S.slots.length}자리예요`);
      }, { kind: 'primary', disabled: !(okC && okT), voice: ['열기', '자리 열기'] });
    }, gardenPlace(), 'garden-unlock');
    E.say('새 자리를 열까요?');
  }
  function stageKey(s) {
    if (!s) return '';
    if (s.stage === 0) return 'seed';
    if (s.stage === 1) return 'seedling';
    return `${s.type}_${s.stage === 2 ? 'bud' : 'bloom'}`;
  }
  function updateSlot(i) {
    const s = S.slots[i], o = slotObjs[i];
    if (!o) return;
    const key = stageKey(s) + (s && s.dormant ? '_d' : '');
    if (o.key !== key) {
      o.plant.clear();
      if (s) {
        const m = stageModels[stageKey(s)].clone(true);
        if (s.dormant) m.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.55); } });
        m.scale.setScalar(stageKey(s) === 'seedling' ? 1.5 : 1.15);
        o.plant.add(m);
        o.plant.rotation.y = i * 1.3;
      }
      o.key = key;
    }
    o.ring.visible = o.fill.visible = o.plus.sprite.visible = !s;
    o.status.sprite.visible = !!s; o.statusHit.visible = !!s;
    if (!s) { o.hitbox.scale.y = 0.12; o.hitbox.position.y = 0.06; }
    if (s) {
      migrateSlot(s);
      const show = s.dormant || s.stage >= 3 || needCount(s) > 0; // 필요할 때만 표시
      o.status.sprite.visible = show; o.statusHit.visible = show;
      const h = stageModels[stageKey(s)].userData.height * (stageKey(s) === 'seedling' ? 1.5 : 1.15);
      o.status.sprite.position.y = h + 0.4; o.statusHit.position.y = h + 0.4;
      o.hitbox.scale.y = Math.max(0.12, h * 0.9); o.hitbox.position.y = o.hitbox.scale.y / 2;
      const sig = [s.dormant, s.stage, JSON.stringify(s.needs), s.readyAt ? Math.round((1 - remain(s) / (s.dur || 1)) * 40) : -1].join();
      if (o.sig !== sig) { o.sig = sig; paintStatus(o.status, s); }
    }
  }
  function remain(s) { return Math.max(0, (s.readyAt || 0) - Date.now()); }
  // 꽃 위 상태 표시: 필요한 돌봄은 밝게 켜지고, 여러 번 필요하면 +2, +3 이 붙어요. 마지막은 자라는 정도.
  function paintStatus(b, s) {
    b.paint((ctx, bb) => {
      const keys = s.dormant ? ['sleep'] : s.stage >= 3 ? ['bloom'] : Object.keys(s.needs || {});
      if (!keys.length) return;
      const w = 40 + keys.length * 104;
      ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.beginPath(); ctx.roundRect((bb.W - w) / 2, 18, w, 116, 58); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
      const p = s.readyAt ? 1 - remain(s) / (s.dur || 1) : 0;
      keys.forEach((k, j) => {
        const cx = (bb.W - w) / 2 + 72 + j * 104, cy = 76;
        if (NEED[k]) {
          const nd = NEED[k];
          ctx.fillStyle = nd.bg; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.stroke();
          if (nd.icon) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fill(); drawIcon(ctx, nd.icon, cx, cy, 54); }
          else { ctx.save(); if (nd.glyph === 'water') ctx.filter = 'brightness(10)'; drawGlyph(ctx, nd.glyph, cx, cy, 50); ctx.restore(); }
          const n = s.needs[k];
          if (n > 1) { ctx.fillStyle = C.green; ctx.beginPath(); ctx.roundRect(cx + 14, cy - 58, 58, 38, 19); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`+${n}`, cx + 43, cy - 38); }
        }
        if (k === 'grow') {
          ctx.lineWidth = 8; ctx.strokeStyle = '#dfe6e0'; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
          if (p > 0) { ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p)); ctx.stroke(); }
          ctx.save(); ctx.globalAlpha = s.readyAt ? 0.9 : 0.35; ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore(); drawGlyph(ctx, 'check', cx, cy, 30);
        }
        if (k === 'bloom') { ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.fill(); drawGlyph(ctx, 'check', cx, cy, 52); }
        if (k === 'sleep') { ctx.fillStyle = '#e8ebf6'; ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.fill(); drawGlyph(ctx, 'sleep', cx, cy, 60); }
      });
    });
  }
  // 비료를 준 뒤 떠오르는 "+1"
  const pops = [];
  function popPlus(i, txt = '+1') {
    const o = slotObjs[i]; if (!o) return;
    const bb = new Bubble(160, 100, 0.22);
    bb.paint(c => { c.fillStyle = C.green; c.beginPath(); c.roundRect(10, 10, 140, 80, 40); c.fill(); c.fillStyle = '#fff'; c.font = `700 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 80, 52); });
    bb.sprite.position.copy(o.status.sprite.position).add(new THREE.Vector3(0.1, 0.05, 0));
    o.root.add(bb.sprite); pops.push({ bb, o, t0: performance.now() });
  }
  function popsFrame(now) {
    for (let k = pops.length - 1; k >= 0; k--) {
      const q = pops[k], t = (now - q.t0) / 1400;
      if (t >= 1) { q.o.root.remove(q.bb.sprite); UI_OBJS.delete(q.bb.sprite); pops.splice(k, 1); continue; }
      q.bb.sprite.position.y += 0.0012; q.bb.sprite.material.opacity = 1 - Math.max(0, t - 0.6) / 0.4;
    }
  }
  const stageDur = (s) => S.settings.demo ? [20, 25, 30][Object.keys(FLOWERS).indexOf(s.type)] * 1000 : FLOWERS[s.type].stageH[s.stage] * 3600e3;
  function waterSlot(i) {
    const s = S.slots[i];
    if (!s) { E.toast('먼저 씨앗을 심어 주세요'); return; }
    if (!inv('watering_can')) { E.toast('물뿌리개가 없어요. 기억 꽃집에서 살 수 있어요'); return; }
    if (s.dormant) { s.dormant = false; E.toast(`${FLOWERS[s.type].name}가 다시 깨어났어요!`); }
    else if (s.stage >= 3) { E.toast('꽃이 활짝 피어 있어요. 물은 충분해요'); }
    else if (s.watered) { E.toast('지금은 물이 충분해요. 조금 기다려 주세요'); }
    else {
      s.watered = true; s.dur = stageDur(s); s.readyAt = Date.now() + s.dur * (s.fert ? 0.6 : 1);
      E.toast(`${FLOWERS[s.type].name}에 물을 주었어요`);
    }
    log('garden', { act: 'water', type: s.type }); E.save(); updateSlot(i);
  }
  function applyNeed(i, key, itemId) {
    const s = S.slots[i]; if (!s) { E.toast('먼저 씨앗을 심어 주세요'); return; }
    migrateSlot(s);
    const f = FLOWERS[s.type].name, nd = NEED[key];
    if (key === 'water' && s.dormant) { s.dormant = false; E.toast(`${f}가 다시 깨어났어요!`); E.save(); updateSlot(i); return; }
    if (s.stage >= 3) { E.toast(`${f}는 이미 활짝 피었어요. 꽃을 눌러 잘라 보세요`); return; }
    if (!s.needs[key]) { E.toast(`지금 ${f}에는 ${itemId ? ITEMS[itemId].name : nd.name}이(가) 필요 없어요. 켜진 표시를 확인해 보세요`); return; }
    if (nd.use && !inv(nd.item)) { E.toast(`${ITEMS[nd.item].name}가 없어요. 기억 꽃집에서 살 수 있어요`); return; }
    if (nd.use) addInv(nd.item, -1);
    s.needs[key]--;
    const left = s.needs[key];
    if (!left) delete s.needs[key];
    popPlus(i, left ? `+${left}` : '✓');
    const started = startGrowIfReady(s);
    E.toast(started ? `${f}가 자라기 시작했어요!` : left ? `${nd.name}가 ${left}번 더 필요해요` : `${nd.name} 완료! 다른 표시도 확인해 보세요`, false);
    log('garden', { act: key, type: s.type }); E.save(); updateSlot(i);
  }
  function fertSlot(i) {
    const s = S.slots[i];
    if (!s) { E.toast('먼저 씨앗을 심어 주세요'); return; }
    if (!inv('fertilizer')) { E.toast('비료가 없어요. 비료가 없어도 꽃은 자라요'); return; }
    if (s.stage >= 3) { E.toast('이미 꽃이 피었어요'); return; }
    if (s.fert && !s.needFert) { E.toast('이미 비료를 주었어요'); return; }
    s.fert = true; s.needFert = false; addInv('fertilizer', -1);
    if (s.watered) s.readyAt = Date.now() + remain(s) * 0.6;
    popPlus(i);
    E.toast(`${FLOWERS[s.type].name}가 더 빨리 자라요!`);
    log('garden', { act: 'fert', type: s.type }); E.save(); updateSlot(i);
  }
  function harvest(i) {
    const s = S.slots[i];
    if (!s || s.stage < 3) return;
    S.flowers[s.type] = (S.flowers[s.type] || 0) + 1;
    S.slots[i] = null;
    E.toast(`${FLOWERS[s.type].name}를 잘라 보관함에 넣었어요`);
    log('garden', { act: 'harvest', type: s.type }); E.save(); updateSlot(i);
  }
  function plantSeed(i, type) {
    if (S.slots[i]) return;
    addInv('seed_' + type, -1);
    S.slots[i] = { type, stage: 0, watered: false, readyAt: 0, fert: false, needs: genNeeds(0) };
    log('train', { game: 'garden', act: 'plant', type, rec: S.rec === 'garden' }); setTimeout(() => qev('plant'), 1500);
    E.save(); updateSlot(i);
    E.toast(`${FLOWERS[type].name}를 심었어요! 꽃 위에 켜진 표시를 보고 돌봐 주세요`);
    closePopup();
  }
  function closePopup() { if (current && current.startsWith('garden')) { main.show(false); current = null; } }

  function slotSelect(i, carried) {
    activeZone = 'garden';
    const s = S.slots[i];
    if (carried) {
      E.carry(null);
      if (ITEM_NEED[carried.id]) return applyNeed(i, ITEM_NEED[carried.id], carried.id);
      if (ITEMS[carried.id] && ITEMS[carried.id].kind === 'seed') {
        if (s) { E.toast('여기는 이미 꽃이 있어요. 빈 자리를 골라 주세요'); return; }
        return plantConfirm(i, ITEMS[carried.id].flower);
      }
    }
    if (!s) chooseFlower(i); else plantInfo(i);
  }
  const gardenPlace = () => zoneOf('garden');
  function gardenWelcome() {
    E.toast('빛나는 동그라미를 눌러 꽃을 심어 보세요');
  }
  function chooseFlower(i, page = 0) {
    open(P => {
      P.glass(460, 180, 1000, 700, 60);
      P.text('어떤 꽃을 심을까요?', W / 2, 260, { size: 54, weight: 700 });
      P.roundBtn('x', 1400, 240, 40, 'close', () => closePopup(), ['닫기', '취소']);
      Object.keys(FLOWERS).forEach((t, k) => {
        const x = 520 + k * 300, y = 330, n = inv('seed_' + t), hov = P.hover === t;
        P.rect(x, y, 280, 330, 36, n ? (hov ? '#fff' : 'rgba(255,255,255,0.58)') : 'rgba(240,240,235,0.7)', hov && n ? C.green : 'rgba(255,255,255,0.95)', hov && n ? 7 : 3);
        P.icon(FLOWERS[t].icon, x + 140, y + 130, 160);
        P.text(FLOWERS[t].name, x + 140, y + 250, { size: 42, weight: 700, color: n ? C.ink : '#aaa' });
        P.text(`${n}개`, x + 140, y + 300, { size: 30, color: C.sub });
        P.hit(t, x, y, 280, 330, () => plantConfirm(i, t), { disabled: !n, voice: [FLOWERS[t].name] });
      });
      const none = !Object.keys(FLOWERS).some(t => inv('seed_' + t));
      P.text(none ? '씨앗이 없어요. 기억 꽃집에서 씨앗을 살 수 있어요.' : '심고 싶은 꽃을 눌러 주세요', W / 2, 730, { size: 34, color: none ? C.danger : C.sub });
      P.button('inv', 660, 780, 600, 80, '보관함 보기', () => inventory(), { voice: ['보관함'] });
    }, gardenPlace(), 'garden-choose');
    E.say('어떤 꽃을 심을까요?');
  }
  function plantConfirm(i, t) {
    if (!inv('seed_' + t)) { E.toast(`${FLOWERS[t].name} 씨앗이 없어요`); return; }
    open(P => {
      P.glass(560, 260, 800, 520, 60);
      P.icon(FLOWERS[t].icon, W / 2, 370, 150);
      P.text(`${FLOWERS[t].name}를 심을까요?`, W / 2, 500, { size: 56, weight: 700 });
      P.text(`${FLOWERS[t].name} 씨앗 1개를 사용해요`, W / 2, 570, { size: 32, color: C.sub });
      P.button('no', 620, 640, 330, 100, '취소', () => closePopup(), { voice: ['취소'] });
      P.button('yes', 970, 640, 330, 100, '심기', () => plantSeed(i, t), { kind: 'primary', voice: ['심기', '심어'] });
      P.hint('“심기”라고 말해 보세요', 820, 520);
    }, gardenPlace(), 'garden-confirm');
    E.say(`${FLOWERS[t].name}를 심을까요?`);
  }
  function plantInfo(i) {
    const s = S.slots[i], f = FLOWERS[s.type];
    migrateSlot(s);
    const nk = Object.keys(s.needs || {});
    const stTxt = s.dormant ? '쉬고 있어요. 물을 주면 다시 깨어나요' : s.stage >= 3 ? '꽃이 활짝 피었어요!' : nk.length ? '필요한 것: ' + nk.map(k => NEED[k].name + (s.needs[k] > 1 ? ` ×${s.needs[k]}` : '')).join(' · ') : `자라는 중이에요 · 다음 단계까지 ${fmt(remain(s))}`;
    open(P => {
      P.glass(460, 160, 1000, 760, 60);
      P.roundBtn('x', 1400, 220, 40, 'close', () => closePopup(), ['닫기']);
      P.circle(W / 2, 320, 110, '#eef4e8');
      if (s.stage === 0) P.icon('seeds', W / 2, 320, 150); else if (s.stage === 1) drawGlyph(P.ctx, 'sprout', W / 2, 320, 150); else P.icon(s.stage === 2 && s.type === 'tulip' ? 'tulip_bud' : f.icon, W / 2, 320, 170);
      P.text(`${f.name} · ${STAGE_NAMES[s.stage]}`, W / 2, 490, { size: 54, weight: 700 });
      P.text(stTxt, W / 2, 560, { size: 34, color: nk.length && s.stage < 3 ? '#c27a12' : C.sub, maxW: 900 });
      // 단계 표시
      STAGE_NAMES.forEach((n, k) => {
        const x = 640 + k * 213;
        P.circle(x, 630, 18, k <= s.stage ? C.green : '#ddd');
        if (k < 3) P.rect(x + 18, 627, 177, 6, 3, k < s.stage ? C.green : '#ddd');
        P.text(n, x, 675, { size: 26, color: k <= s.stage ? C.greenDark : '#999' });
      });
      const btns = [];
      if (s.needs && s.needs.sun) btns.push(['sun', '햇빛 쬐기', () => { applyNeed(i, 'sun'); plantInfo(i); }, true, ['햇빛']]);
      if (s.stage < 3 && nk.some(k => k !== 'sun')) btns.push(['inv', '보관함 열기', () => inventory(), true, ['보관함']]);
      if (s.stage >= 3) btns.push(['cut', '꽃 자르기', () => harvest(i) || closePopup(), true, ['자르기', '꽃 자르기']]);
      btns.push(['close', '닫기', () => closePopup(), true, ['닫기']]);
      const bw = (880 - (btns.length - 1) * 20) / btns.length;
      btns.forEach((b, k) => {
        const x = 520 + k * (bw + 20), ic = b[0] === 'cut' ? 'pruners' : null;
        P.button(b[0], x, 740, bw, 100, b[1], b[2], { kind: k === 0 && b[3] ? 'primary' : 'secondary', disabled: !b[3], size: 34, voice: b[4], dx: ic ? 30 : 0 });
        if (ic) { P.ctx.save(); if (!b[3]) P.ctx.globalAlpha = 0.45; P.icon(ic, x + bw / 2 + 30 - P.ctx.measureText(b[1]).width / 2 - 40, 790, 58); P.ctx.restore(); }
      });
    }, gardenPlace(), 'garden-info');
  }
  function fmt(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}초`;
    if (s < 3600) return `${Math.ceil(s / 60)}분`;
    return `${Math.round(s / 3600)}시간`;
  }

  // 보관함
  let invTab = 0;
  function invClose() { }
  function inventory() {
    const tabs = ['씨앗', '재배 용품', '원예 도구', '꽃 · 꽃바구니'];
    open(P => {
      P.glass(260, 120, 1400, 820, 60);
      P.text('보관함', 330, 200, { size: 54, weight: 700, align: 'left' });
      P.roundBtn('x', 1580, 200, 44, 'close', () => { main.show(false); current = null; }, ['닫기']);
      tabs.forEach((t, k) => P.button('tab' + k, 330 + k * 320, 270, 300, 80, t, () => { invTab = k; main.refresh(); }, { kind: invTab === k ? 'chipOn' : 'secondary', size: 32, voice: [t] }));
      let list = [];
      if (invTab === 0) list = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'seed' && inv(id)).map(id => ({ id, n: inv(id) }));
      if (invTab === 1) list = ['fertilizer', 'pesticide', 'soil', 'pot', 'labels'].filter(id => inv(id)).map(id => ({ id, n: inv(id) }));
      if (invTab === 2) list = Object.keys(ITEMS).filter(id => ITEMS[id].tab === 1 && id !== 'labels' && inv(id)).map(id => ({ id, n: inv(id) }));
      if (invTab === 3) list = [...Object.keys(FLOWERS).filter(t => S.flowers[t]).map(t => ({ flower: t, n: S.flowers[t] })), ...['basket', 'ribbon', 'wrap', 'pruners'].filter(id => inv(id)).map(id => ({ id, n: inv(id) }))];
      list.slice(0, 8).forEach((it, k) => {
        const x = 330 + (k % 4) * 320, y = 390 + Math.floor(k / 4) * 260, hov = P.hover === 'i' + k;
        const usable = it.id && (ITEMS[it.id].kind === 'use' || ITEMS[it.id].kind === 'seed' || !!ITEM_NEED[it.id]);
        P.rect(x, y, 300, 240, 32, hov && usable ? '#fff' : 'rgba(255,255,255,0.58)', hov && usable ? C.green : 'rgba(255,255,255,0.95)', hov && usable ? 7 : 3);
        if (it.flower) P.icon(FLOWERS[it.flower].icon, x + 150, y + 95, 120); else shopIcon(P, it.id, x + 150, y + 95, 120);
        P.text(it.flower ? FLOWERS[it.flower].name : ITEMS[it.id].name, x + 150, y + 185, { size: 34, weight: 700 });
        P.text(`${it.n}${it.flower ? '송이' : '개'}`, x + 150, y + 222, { size: 26, color: C.sub });
        if (usable) P.hit('i' + k, x, y, 300, 240, () => {
          main.show(false); current = null;
          E.carry({ id: it.id, icon: ITEMS[it.id].icon, drag: true });
          const need = ITEM_NEED[it.id] ? S.slots.findIndex(q => q && q.needs && q.needs[ITEM_NEED[it.id]]) : -1;
          const who = need >= 0 ? FLOWERS[S.slots[need].type].name : '꽃';
          const msg = ITEMS[it.id].kind === 'seed' ? '누른 채로 빈 동그라미까지 옮겨서 놓아 주세요' : `누른 채로 ${ITEMS[it.id].name}를 ${who} 위에 놓아 주세요`;
          E.toast(msg, true, 8000);
        }, { voice: [it.id ? ITEMS[it.id].name : ''], drag: true });
      });
      if (!list.length) P.text('아직 비어 있어요', W / 2, 560, { size: 38, color: C.sub });
      P.text('쓰고 싶은 물건을 누른 채로 꽃까지 옮겨 주세요', W / 2, 900, { size: 30, color: C.sub });
    }, activeZone === 'garden' ? gardenPlace() : 'front', 'garden-inv');
  }
  // 화단 앞 보관함 버튼
  const gardenBar = new Panel(1000, 260, 1.1, { renderOrder: 60 });
  E.addPanel(gardenBar);
  E.placeAt(gardenBar, B(40.1, -6.95, 0.62), B(40.1, -7.8, 1.2));
  gardenBar.mesh.rotation.x = 0;
  gardenBar.setView(P => {
    P.button('inv', 300, 20, 400, 110, '보관함', () => { activeZone = 'garden'; inventory(); }, { size: 44, voice: ['보관함'], dx: 30 });
    drawGlyph(P.ctx, 'box', 410, 75, 60);
    P.rect(200, 160, 600, 70, 35, 'rgba(255,255,255,0.58)');
    P.text('빛나는 동그라미를 눌러 꽃을 심어 보세요', 500, 196, { size: 28, color: '#555' });
  });

  // 성장 시간 흐름
  let lastTick = 0;
  E.onTick = (dt, now) => {
    if (now - lastTick < 500) return;
    lastTick = now;
    S.slots.forEach((s, i) => {
      if (s) migrateSlot(s);
      if (s && s.stage < 3 && !needCount(s) && !s.readyAt) startGrowIfReady(s);
      if (s && s.stage < 3 && s.readyAt && Date.now() >= s.readyAt) {
        s.stage++; s.readyAt = 0; s.watered = s.stage >= 3; s.fert = false;
        s.needs = s.stage < 3 ? genNeeds(s.stage) : {};
        if (s.stage === 3) E.toast(`${FLOWERS[s.type].name}가 피었어요!`);
        else E.toast(`${FLOWERS[s.type].name} ${s.stage === 1 ? '새싹이 났어요' : '꽃봉오리가 생겼어요'}. 켜진 표시를 보고 돌봐 주세요`, false);
        E.save();
      }
      updateSlot(i);
    });
    if (current === 'garden-info' && main.visible) main.refresh();
    teaTick();
  };
  refreshSlots();
  S.slots.forEach((_, i) => updateSlot(i));
  placeShownBaskets();

  // ================= 정원 티파티 =================
  const NPCS = [
    { k: '박', name: '박 할머니', color: '#f3d0c6', pos: [45.8, -3.3, 1.35] },
    { k: '최', name: '최 할아버지', color: '#d6ead0', pos: [46.6, -2.3, 1.45] },
    { k: '이', name: '이 할머니', color: '#f5e6b8', pos: [48.1, -2.7, 1.4] }
  ];
  const LINES = {
    '내가 좋아하는 꽃': [
      ['박', '저는 튤립을 보면 봄 소풍 가던 날이 떠올라요.'],
      ['최', '나는 해바라기가 좋아요. 고향 집 마당에 많이 피었거든요.'],
      ['이', '데이지는 작아도 참 예뻐요. 손녀가 좋아하는 꽃이에요.']
    ],
    '내 고향': [
      ['이', '제 고향은 바닷가 마을이었어요. 바람 냄새가 아직도 생각나요.'],
      ['박', '저는 산 아래 작은 마을에서 자랐어요.'],
      ['최', '고향 시장에서 먹던 국수가 그립네요.']
    ]
  };
  const REPLIES = ['좋은 이야기네요!', '그렇군요. 더 듣고 싶어요.', '저도 그런 기억이 있어요.', '이야기해 주셔서 고마워요.'];
  const avatars = NPCS.map(n => {
    const b = new Bubble(420, 300, 0.42);
    b.sprite.position.copy(B(...n.pos)); b.sprite.visible = false; E.scene.add(b.sprite);
    return { n, b, say: '' };
  });
  function paintAvatar(a, speaking) {
    a.b.paint((ctx, bb) => {
      ctx.fillStyle = a.n.color; ctx.beginPath(); ctx.arc(210, 100, 86, 0, Math.PI * 2); ctx.fill();
      if (speaking) { ctx.strokeStyle = C.green; ctx.lineWidth = 12; ctx.stroke(); }
      ctx.fillStyle = C.ink; ctx.font = `700 90px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.n.k, 210, 106);
      ctx.fillStyle = 'rgba(255,255,255,0.58)'; ctx.beginPath(); ctx.roundRect(90, 205, 240, 70, 35); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = `600 40px ${FONT}`; ctx.fillText(a.n.name, 210, 242);
    });
  }
  let tea = null;
  function teaStop() { E.openMic(false); if (tea) { avatars.forEach(a => a.b.sprite.visible = false); tea = null; } }
  function teaEntry(toastMsg) {
    setTimeout(() => qev('tea'), 2500);
    open(P => {
      exitBtn(P);
      P.glass(460, 70, 1000, 900, 60);
      P.text('정원 티파티', W / 2, 150, { size: 64, weight: 700 });
      S.parties.slice(0, 3).forEach((p, k) => {
        const y = 220 + k * 210, hl = k === 0;
        P.rect(510, y, 900, 190, 36, hl ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3);
        P.text(p.when, 550, y + 50, { size: hl ? 46 : 38, weight: 700, align: 'left' });
        P.text(`주제: ${p.topic}`, 550, y + 105, { size: 32, align: 'left' });
        p.friends.forEach((f, j) => { const n = NPCS.find(x => x.k === f) || { color: '#e3d9f2' }; P.circle(570 + j * 50, y + 155, 24, n.color, '#fff', 3); P.text(f, 570 + j * 50, y + 157, { size: 24, weight: 700 }); });
        P.text(`${p.friends.map(f => (NPCS.find(x => x.k === f) || { name: f }).name).join(', ')}${p.live ? '가 기다리고 있어요' : '를 초대했어요'}`, 570 + p.friends.length * 50, y + 157, { size: 26, color: C.sub, align: 'left' });
        P.button('join' + k, 1170, y + 60, 210, 80, '참여하기', () => p.live ? teaChat(p) : E.toast('아직 시작 전이에요. 시간이 되면 알려 드릴게요'), { kind: p.live ? 'primary' : 'secondary', size: 34, voice: k === 0 ? ['참여'] : [] });
      });
      P.button('host', 510, 860, 900, 90, '티파티 열기', () => teaHost(), { size: 40, voice: ['티파티 열기', '열기'] });
      P.hint('“참여”라고 말해 보세요', 990, 520);
    }, zoneOf('tea'), 'teaEntry');
    if (toastMsg) E.toast(toastMsg); else E.say('정원 티파티. 참여하기를 눌러 보세요.');
  }
  let host = { time: 0, topic: 0, friends: { '박': true, '최': true, '이': false, '딸': true } };
  const TOPICS = [['내가 좋아하는 꽃', 'anemone'], ['어린 시절의 추억', 'daisy'], ['사계절', 'sunflower'], ['예전에 살던 곳', 'iris'], ['잊지 못할 여행', 'poppy']];
  function teaHost() {
    const times = ['오늘 오후 3시', '오늘 오후 7시', '내일 오전 10시', '다른 시간'];
    open(P => {
      P.glass(100, 100, 1720, 880, 60);
      P.roundBtn('back', 190, 190, 44, 'exit', () => teaEntry(), ['뒤로', '나가기']);
      P.text('티파티 열기', 260, 180, { size: 54, weight: 700, align: 'left' });
      P.text('시간, 주제, 친구만 고르면 돼요', 262, 238, { size: 30, color: C.sub, align: 'left' });
      const col = (x, t) => { P.rect(x, 290, 520, 560, 36, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3); P.text(t, x + 40, 335, { size: 34, weight: 700, align: 'left' }); };
      col(160, '1  시간 선택'); col(700, '2  주제 선택'); col(1240, '3  친구 선택');
      times.forEach((t, k) => P.button('t' + k, 200, 390 + k * 110, 440, 86, t, () => { host.time = k; main.refresh(); }, { kind: host.time === k ? 'chipOn' : 'secondary', size: 32 }));
      P.rect(740, 390, 440, 300, 30, 'rgba(255,255,255,0.58)');
      P.circle(960, 510, 100, '#eef4e8'); P.icon(TOPICS[host.topic][1], 960, 510, 150);
      P.text(TOPICS[host.topic][0], 960, 730, { size: 38, weight: 700 });
      P.button('nt', 740, 770, 440, 70, '다른 주제 보기', () => { host.topic = (host.topic + 1) % TOPICS.length; main.refresh(); }, { size: 30, voice: ['다른 주제'] });
      ['박', '최', '이', '딸'].forEach((f, k) => {
        const y = 390 + k * 110, n = NPCS.find(x => x.k === f) || { name: '딸', color: '#e3d9f2' };
        P.circle(1310, y + 43, 34, n.color); P.text(f, 1310, y + 45, { size: 32, weight: 700 });
        P.text(n.name, 1370, y + 45, { size: 34, align: 'left' });
        const on = host.friends[f];
        P.circle(1680, y + 43, 30, on ? C.green : '#f0f0ec', on ? null : '#ccc', 3); if (on) drawGlyph(P.ctx, 'check', 1680, y + 43, 34);
        P.hit('f' + f, 1280, y, 440, 86, () => { host.friends[f] = !host.friends[f]; main.refresh(); }, { voice: [n.name] });
      });
      const any = Object.values(host.friends).some(Boolean);
      P.button('send', 660, 870, 600, 90, '초대 보내기', () => {
        const fr = Object.keys(host.friends).filter(k => host.friends[k]);
        S.parties.splice(1, 0, { when: times[host.time], topic: TOPICS[host.topic][0], icon: TOPICS[host.topic][1], friends: fr.filter(f => f !== '딸'), live: false });
        S.parties = S.parties.slice(0, 3);
        log('social', { act: 'host', topic: TOPICS[host.topic][0] }); E.save();
        teaEntry('초대를 보냈어요');
      }, { kind: 'primary', disabled: !any, voice: ['초대 보내기', '보내기'] });
    }, zoneOf('tea'), 'teaHost');
  }
  function teaChat(p) {
    const lines = LINES[p.topic] || LINES['내가 좋아하는 꽃'];
    tea = { p, lines, idx: 0, next: performance.now() + 2500, speaker: null, sub: '', start: Date.now(), myTurns: 0, waiting: false, muted: false };
    avatars.forEach(a => { a.b.sprite.visible = true; paintAvatar(a, false); });
    log('social', { act: 'join', topic: p.topic });
    const draw = () => open(P => {
      P.glass(560, 30, 800, 110, 55);
      P.text(`주제: ${p.topic}`, W / 2, 86, { size: 44, weight: 700 });
      exitBtn(P, () => teaEnd());
      P.glass(660, 190, 600, 470, 50);
      P.circle(W / 2, 360, 130, '#eef4e8'); P.icon(p.icon || 'tulip', W / 2, 360, 200);
      P.text('이 꽃을 보면 무엇이 떠오르나요?', W / 2, 580, { size: 36, weight: 600 });
      const muted = tea && tea.muted;
      const st = muted ? '마이크가 꺼져 있어요' : E.userTalking ? '내가 말하는 중이에요' : tea && tea.speaker ? `${tea.speaker}가 말하는 중이에요` : '언제든 자유롭게 말해 보세요';
      P.glass(460, 700, 1000, 100, 50);
      P.text(st, W / 2, 752, { size: 38, weight: 600 });
      if (E.listening && !muted) { // 내 목소리 크기
        const lv = Math.min(1, (E.voiceLevel || 0) * 9);
        for (let k = 0; k < 7; k++) { const h = 16 + 50 * Math.max(0.1, lv * (0.6 + 0.4 * Math.sin(k * 1.7 + performance.now() / 120))); P.rect(1300 + k * 20, 752 - h / 2, 12, h, 6, C.green); }
      }
      if (tea && tea.sub) { P.rect(260, 815, 1400, 90, 45, 'rgba(255,255,255,0.58)'); P.text(tea.sub, W / 2, 861, { size: 34, color: '#333', maxW: 1340 }); }
      // 회의처럼: 마이크는 계속 켜져 있고, 음소거와 끝내기만 있어요
      P.button('mute', 560, 925, 380, 100, muted ? '마이크 켜기' : '마이크 끄기', () => { tea.muted = !tea.muted; E.openMic(!tea.muted); E.toast(tea.muted ? '마이크를 껐어요' : '마이크를 켰어요', false); tea.redraw(); }, { size: 36, voice: [], dx: 24 });
      drawGlyph(P.ctx, muted ? 'micOff' : 'micOn', 625, 975, 46);
      P.button('end', 980, 925, 380, 100, '끝내기', () => teaEnd(), { kind: 'primary', size: 38, voice: ['끝내기', '그만'] });
      P.button('fam', 1400, 935, 260, 80, '가족 초대', () => teaInvite(), { size: 30, voice: ['가족 초대', '가족'] });
    }, zoneOf('tea'), 'teaChat');
    tea.redraw = draw;
    E.openMic(true);
    draw();
    E.say('티파티에 오신 걸 환영해요. 마이크가 켜져 있어요. 편하게 이야기하세요.');
  }
  function teaTick() {
    if (!tea || current !== 'teaChat' || E.userTalking) return;
    const now = performance.now();
    if (now < tea.next) return;
    if (tea.speaker) { // 말 끝
      avatars.forEach(a => paintAvatar(a, false));
      tea.speaker = null; tea.next = now + 9000; tea.redraw(); return;
    }
    const line = tea.reply || tea.lines[tea.idx % tea.lines.length];
    if (!tea.reply) tea.idx++;
    tea.reply = null;
    const a = avatars.find(x => x.n.k === line[0]);
    avatars.forEach(x => paintAvatar(x, x === a));
    tea.speaker = a.n.name; tea.sub = `${a.n.name}: ${line[1]}`;
    E.say(line[1]);
    tea.next = now + 2500 + line[1].length * 140;
    tea.redraw();
  }
  E.onTalkStart = () => { if (tea && current === 'teaChat') { tea.redraw(); } };
  E.onUtterance = text => {
    if (!(tea && current === 'teaChat') || tea.muted) return;
    if (tea.speaker && !text) return; // 친구가 말할 때 들린 소리는 무시
    tea.sub = text ? `나: ${text}` : '나: (이야기를 들려주었어요)'; tea.myTurns++;
    const who = NPCS[rnd(NPCS.length)].k;
    tea.reply = [who, REPLIES[rnd(REPLIES.length)]];
    tea.next = performance.now() + 1500;
    log('social', { act: 'talk', len: (text || '').length });
    tea.redraw();
  };
  E.onVoiceStart = () => { if (tea && current === 'teaChat') { avatars.forEach(a => paintAvatar(a, false)); tea.speaker = null; tea.redraw(); } };
  E.onVoiceInterim = t => { if (tea && current === 'teaChat' && t && !tea.muted) { tea.sub = `나: ${t}`; tea.redraw(); } };
  let teaLvT = 0;
  E.onVoiceEnd = (text, spoke) => {
    if (tea && current === 'teaChat') {
      if (text || spoke) {
        tea.sub = text ? `나: ${text}` : '나: (이야기를 들려주었어요)'; tea.myTurns++;
        const who = NPCS[rnd(NPCS.length)].k;
        tea.reply = [who, REPLIES[rnd(REPLIES.length)]];
        tea.next = performance.now() + 1800;
        log('social', { act: 'talk', len: (text || '').length });
      }
      tea.redraw(); return;
    }
    if (!text) { if (spoke) E.toast('잘 알아듣지 못했어요. 화면의 글자를 천천히 말해 주세요'); return; }
    const panels = [main, gardenBar, ...tiles].filter(p => p.visible);
    if (E.matchVoice(text, panels)) return;
    const t = text.replace(/\s/g, '');
    const cmds = [
      [['메뉴', '처음'], () => mainMenu()], [['정원가꾸기', '꽃심기'], () => guideTo('garden')], [['훈련'], () => trainingArea()],
      [['반짝', '꽃찾기'], () => guideTo('flash')], [['꽃집'], () => guideTo('shop')], [['티파티', '파티'], () => guideTo('tea')],
      [['시장', '팔기'], () => guideTo('market')], [['설정'], () => settings()], [['우편함', '편지', '소원'], () => guideTo('mail')], [['보관함'], () => inventory()]
    ];
    for (const [ks, fn] of cmds) if (ks.some(k => t.includes(k))) { fn(); return; }
    E.toast(`“${text}”라고 들었어요. 화면의 글자를 말해 보세요`);
  };
  function teaInvite() {
    E.openMic(false);
    open(P => {
      P.glass(460, 120, 1000, 820, 60);
      backBtn(P, () => teaChat(tea ? tea.p : S.parties[0]));
      P.text('가족을 초대해 보세요', W / 2, 220, { size: 60, weight: 700 });
      P.text('가족에게 초대 알림이 가요', W / 2, 295, { size: 34, color: C.sub });
      [['딸', '#e3d9f2'], ['아들', '#d6ead0']].forEach(([f, col], k) => {
        const y = 360 + k * 210;
        P.rect(510, y, 900, 180, 36, 'rgba(255,255,255,0.58)');
        P.circle(610, y + 90, 64, col, '#fff', 4); P.text(f, 610, y + 93, { size: f.length > 1 ? 40 : 50, weight: 700 });
        P.text(f, 710, y + 92, { size: 44, weight: 600, align: 'left' });
        const done = S.invited[f];
        P.button('inv' + k, 1110, y + 50, 260, 84, done ? '초대 완료' : '초대하기', () => { S.invited[f] = true; log('social', { act: 'invite', who: f }); E.save(); E.toast(`${f}에게 초대를 보냈어요`); main.refresh(); }, { kind: done ? 'secondary' : 'primary', disabled: done, size: 34, voice: [f] });
      });
      P.button('back2', 660, 820, 600, 90, '티파티로 돌아가기', () => teaChat(tea ? tea.p : S.parties[0]), { voice: ['티파티로', '돌아가기'] });
    }, zoneOf('tea'), 'teaInvite');
  }
  function teaEnd() {
    const mins = tea ? Math.max(1, Math.round((Date.now() - tea.start) / 60000)) : 0;
    if (tea) log('social', { act: 'end', minutes: mins, turns: tea.myTurns });
    E.save(); teaStop();
    open(P => {
      P.glass(560, 160, 800, 760, 60);
      P.circle(W / 2, 320, 110, '#eef4e8'); P.icon('tulip', W / 2, 320, 160);
      P.text('오늘 티파티가 끝났어요', W / 2, 500, { size: 56, weight: 700 });
      P.text('와 주셔서 고마워요!\n다음 티파티에서 또 만나요.', W / 2, 610, { size: 34, color: C.sub, maxW: 700 });
      P.button('home', 660, 760, 600, 100, '정원으로 돌아가기', () => closeAll('정원으로 돌아왔어요'), { kind: 'primary', voice: ['정원으로', '돌아가기'] });
    }, zoneOf('tea'), 'teaEnd');
    E.say('오늘 티파티가 끝났어요. 와 주셔서 고마워요!');
  }

  // ================= 꽃 시장 =================
  function marketScreen() {
    setTimeout(() => qev('market'), 2500);
    const want = S.dailyWish, wf = FLOWERS[want.type];
    const total = sellableTotal();
    const PRICE = FLOWER_PRICE, WISH_PRICE = 25; // 아무 꽃은 15, 정해진 꽃은 25
    open(P => {
      exitBtn(P);
      P.glass(260, 60, 1400, 940, 60);
      P.text('꽃 시장', W / 2, 140, { size: 64, weight: 700 });
      P.text('정원에서 키운 꽃을 팔고 꽃 코인을 받아요', W / 2, 205, { size: 32, color: C.sub });
      P.coinChip(1380, 100, S.coins);
      // 내 꽃
      P.rect(320, 250, 1280, 150, 30, 'rgba(255,255,255,0.58)');
      P.text('내 꽃', 360, 325, { size: 36, weight: 700, align: 'left' });
      Object.keys(FLOWERS).forEach((t, k) => { P.icon(FLOWERS[t].icon, 560 + k * 320, 325, 100); P.text(`${FLOWERS[t].name} ${S.flowers[t] || 0}송이`, 620 + k * 320, 312, { size: 34, align: 'left' }); if (wildOf(t)) P.text(`야외 정원 꽃 ${wildOf(t)}송이`, 620 + k * 320, 356, { size: 24, color: C.sub, align: 'left' }); });
      // 오늘의 주문 1: 아무 꽃
      P.rect(320, 430, 1280, 200, 30, 'rgba(255,255,255,0.58)');
      P.text('오늘은 아무 꽃 3송이를 사요', 360, 495, { size: 42, weight: 700, align: 'left' });
      P.text(`한 송이에 ${PRICE}코인 · 꽃 종류는 상관없어요`, 360, 560, { size: 30, color: C.sub, align: 'left' });
      P.button('any', 1270, 490, 290, 90, '3송이 팔기', () => {
        let n = 3;
        Object.keys(FLOWERS).sort((a, b) => sellableOf(b) - sellableOf(a)).forEach(t => { const k = Math.min(n, sellableOf(t)); if (k > 0) sellFlower(t, k); n -= k; });
        S.coins += 3 * PRICE; log('market', { act: 'any', n: 3 }); E.save(); E.refreshWatch();
        E.toast(`꽃 3송이를 팔았어요. 꽃 코인 +${3 * PRICE}`); marketScreen();
      }, { kind: 'primary', disabled: total < 3, size: 36, voice: ['3송이', '아무 꽃'] });
      // 오늘의 주문 2: 정해진 꽃
      P.rect(320, 660, 1280, 200, 30, 'rgba(255,255,255,0.58)');
      P.icon(wf.icon, 400, 760, 110);
      P.text(`오늘은 ${wf.name} ${want.n}송이를 사요`, 480, 725, { size: 42, weight: 700, align: 'left' });
      P.text(`한 송이에 ${WISH_PRICE}코인 · 보관함에서 ${wf.name}를 찾아 팔아요`, 480, 790, { size: 30, color: C.sub, align: 'left' });
      P.button('want', 1270, 720, 290, 90, `${want.n}송이 팔기`, () => {
        sellFlower(want.type, want.n); S.coins += want.n * WISH_PRICE;
        log('market', { act: 'wish', type: want.type, n: want.n }); E.save(); E.refreshWatch();
        E.toast(`${wf.name} ${want.n}송이를 팔았어요. 꽃 코인 +${want.n * WISH_PRICE}`); marketScreen();
      }, { kind: 'primary', disabled: sellableOf(want.type) < want.n, size: 36, voice: [wf.name] });
      const hasWild = Object.keys(FLOWERS).some(t => wildOf(t));
      P.text(hasWild ? `야외 정원에서 딴 꽃은 하루에 ${WILD_LIMIT}송이까지 팔 수 있어요 · 오늘 남은 수 ${wildLeft()}송이` : (flowerCount() ? '팔고 싶지 않으면 그냥 두어도 괜찮아요' : '아직 꽃이 없어요. 정원에서 핀 꽃을 잘라 오면 팔 수 있어요'), W / 2, 920, { size: 30, color: hasWild && !wildLeft() ? C.danger : C.sub });
    }, zoneOf('market'), 'market');
    E.say('꽃 시장이에요. 키운 꽃을 팔 수 있어요.');
  }

  // ================= 우편함 =================
  function mailScreen() {
    setTimeout(() => qev('mail'), 2500);
    open(P => {
      exitBtn(P);
      P.glass(300, 60, 1320, 950, 60);
      P.icon('ic_mail', 460, 160, 130);
      P.text('우편함', 550, 150, { size: 62, weight: 700, align: 'left' });
      P.text('가족과 친구가 보낸 소원과 편지예요. 마감은 없어요', 552, 215, { size: 30, color: C.sub, align: 'left' });
      P.text('꽃 소원', 360, 300, { size: 36, weight: 700, color: C.green, align: 'left' });
      S.wishes.slice(0, 3).forEach((w, k) => {
        const y = 330 + k * 150, f = FLOWERS[w.type];
        P.rect(350, y, 1220, 132, 32, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
        P.circle(430, y + 66, 46, w.from === '딸' ? '#e3d9f2' : '#d6ead0'); P.text(w.from, 430, y + 69, { size: w.from.length > 1 ? 28 : 34, weight: 700 });
        P.icon(f.icon, 530, y + 66, 80);
        P.text(`“${f.name} ${w.n}송이 받고 싶어요”`, 590, y + 48, { size: 36, weight: 600, align: 'left' });
        P.text(w.done ? '보냈어요. 고맙다는 답장이 왔어요' : `내 ${f.name}: ${S.flowers[w.type] || 0}송이`, 590, y + 98, { size: 28, color: w.done ? C.green : C.sub, align: 'left' });
        P.button('w' + k, 1330, y + 30, 210, 76, w.done ? '완료' : '선물하기', () => {
          useFlower(w.type, w.n); w.done = true; log('wish', { from: w.from, type: w.type });
          S.letters.unshift({ from: w.from, text: `${f.name} 정말 고마워요! 받자마자 꽃병에 꽂아 두었어요.` });
          E.save(); E.toast(`${w.from}에게 ${f.name}를 보냈어요`); main.refresh();
        }, { kind: 'primary', disabled: w.done || (S.flowers[w.type] || 0) < w.n, size: 30, voice: [w.from, '선물'] });
      });
      const ly = 330 + Math.min(3, S.wishes.length) * 150 + 30;
      P.text('편지', 360, ly, { size: 36, weight: 700, color: C.green, align: 'left' });
      S.letters.slice(0, 2).forEach((l, k) => {
        const y = ly + 30 + k * 120;
        P.rect(350, y, 1220, 104, 30, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
        P.text(l.from, 380, y + 52, { size: 30, weight: 700, align: 'left', color: C.greenDark });
        P.text(l.text, 540, y + 52, { size: 28, align: 'left', maxW: 1000 });
      });
      P.text('꽃이 없으면 정원에서 키워서 보낼 수 있어요', W / 2, 985, { size: 28, color: C.sub });
    }, zoneOf('mail'), 'mail');
    E.say('우편함이에요. 가족이 보낸 소원과 편지가 있어요.');
  }

  // ================= 설정 =================
  function settings() {
    const st = S.settings;
    open(P => {
      exitBtn(P, () => closeAll());
      P.glass(460, 50, 1000, 980, 60);
      drawGlyph(P.ctx, 'gear', 590, 130, 80);
      P.text('설정', 660, 130, { size: 60, weight: 700, align: 'left' });
      const row = (y, label, opts, cur, set) => {
        P.text(label, 540, y + 30, { size: 34, weight: 600, align: 'left' });
        const bw = (840 - (opts.length - 1) * 14) / opts.length;
        opts.forEach((o, k) => P.button(label + k, 540 + k * (bw + 14), y + 62, bw, 72, o, () => { set(k); E.save(); main.refresh(); }, { kind: cur === k ? 'chipOn' : 'secondary', size: 30, voice: [o] }));
      };
      row(240, '걷는 속도', ['느리게', '보통', '빠르게'], st.speed, k => st.speed = k);
      row(400, '꽃 자라는 속도', ['시연용 (몇 초)', '실제 (1시간)'], st.demo ? 0 : 1, k => st.demo = !k);
      row(560, '배경 음악', ['켜기', '끄기'], st.bgm ? 0 : 1, k => E.setBgm(!k));
      row(720, '음성 안내 (글자를 읽어 줘요)', ['켜기', '끄기'], st.tts ? 0 : 1, k => { st.tts = !k; if (k && window.speechSynthesis) speechSynthesis.cancel(); else E.say('음성 안내를 켰어요'); });
      P.button('reset', 540, 920, 840, 64, '처음 상태로 되돌리기', () => resetConfirm(), { size: 28 });
    }, 'front', 'settings');
  }
  function resetConfirm() {
    open(P => {
      P.glass(560, 300, 800, 460, 60);
      P.text('처음 상태로 되돌릴까요?', W / 2, 420, { size: 52, weight: 700 });
      P.text('꽃, 코인, 보관함이 모두 처음으로 돌아가요', W / 2, 500, { size: 32, color: C.sub });
      P.button('no', 620, 600, 330, 100, '취소', () => settings(), { voice: ['취소'] });
      P.button('yes', 970, 600, 330, 100, '되돌리기', () => { clearState(); location.reload(); }, { kind: 'primary' });
    }, 'front', 'reset');
  }

  // ================= 활동 입구 아이콘 =================
  // 각 활동 장소 위에 같은 모양의 아이콘(배경 없음)을 띄우고, 누르면 바로 시작
  const ENTRANCES = [
    { id: 'shop',   label: '기억 꽃집', icon: 'watering_can', pos: [43.0, -0.1, 2.55], free: true },
    { id: 'market', label: '꽃 시장', icon: 'ic_market', pos: [34.4, -2.3, 2.55] },
    { id: 'tea',    label: '정원 티파티', icon: 'ic_tea', pos: [47.0, -3.2, 2.3] },
    { id: 'mail',   label: '우편함', icon: 'ic_mail', pos: [36.0, -6.2, 2.75] },
    { id: 'mr',     label: '야외 정원', icon: 'poppy', pos: [40.0, 6.0, 2.75] }
  ];
  const entranceObjs = ENTRANCES.map(en => {
    const CW = 300, CH = 380;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68 * CH / CW), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 12;
    UI_OBJS.add(mesh);
    const base = B(...en.pos);
    mesh.position.copy(base);
    const paint = hov => {
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, CW, CH);
      // 뒤에 반투명 유리 틀
      ctx.save(); ctx.shadowColor = 'rgba(40,50,30,0.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
      ctx.fillStyle = hov ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.26)';
      ctx.beginPath(); ctx.roundRect(20, 14, CW - 40, 250, 56); ctx.fill(); ctx.restore();
      ctx.strokeStyle = hov ? C.green : 'rgba(255,255,255,0.95)'; ctx.lineWidth = hov ? 7 : 4;
      ctx.beginPath(); ctx.roundRect(20, 14, CW - 40, 250, 56); ctx.stroke();
      drawIcon(ctx, en.icon, CW / 2, 139, 190);
      ctx.font = `700 40px ${FONT}`; const w = ctx.measureText(en.label).width + 48;
      ctx.fillStyle = hov ? C.green : 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(CW / 2 - w / 2, 288, w, 70, 35); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = hov ? '#fff' : C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(en.label, CW / 2, 324);
      tex.needsUpdate = true;
    };
    paint(false);
    mesh.userData.onHover = on => { paint(on); mesh.scale.setScalar(on ? 1.1 : 1); };
    mesh.userData.onSelect = carried => {
      if (carried) E.carry(null);
      const z = zoneOf(en.id), hb = E.headB();
      if (Math.hypot(hb.x - z.stand[0], hb.y - z.stand[1]) > 3.2) {
        E.beacon(z); E.toast(`초록 빛기둥을 따라 ${en.label}(으)로 걸어가세요`); return;
      }
      E.beacon(null);
      if (en.free) { activeZone = z.id; shopBuy(); } else arrive(z);
    };
    E.scene.add(mesh); E.addTarget(mesh);
    return { en, mesh, base, near: false };
  });
  const _cam = new THREE.Vector3();
  function entrancesFrame(now) {
    E.camera.getWorldPosition(_cam);
    entranceObjs.forEach((o, k) => {
      o.mesh.visible = !(main.visible && activeZone === o.en.id);
      o.mesh.position.y = o.base.y + Math.sin(now / 700 + k) * 0.04;
      o.mesh.lookAt(_cam.x, o.mesh.position.y, _cam.z);
      // 가까이 오면 한 번 알려 주기
      const z = zoneOf(o.en.id);
      const d = Math.hypot(_cam.x - z.stand[0], -_cam.z - z.stand[1]);
      if (d < 1.3 && !o.near && !main.visible) { o.near = true; E.toast(`여기는 ${o.en.label}예요. 아이콘을 누르면 시작해요`); }
      if (d > 3) o.near = false;
    });
  }

  // ================= 새로 온 분을 위한 사용 방법 =================
  const TUT = ['hello', 'walk', 'turn', 'menu', 'voice', 'places', 'care', 'end'];
  let tut = null;
  function drawController(ctx, cx, cy, side, hl, sc = 1) {
    const sg = side === 'L' ? 1 : -1;
    const glow = (x, y, r) => { ctx.save(); ctx.shadowColor = C.green; ctx.shadowBlur = 34; ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc * sg, sc);
    ctx.fillStyle = '#f6f6f3'; ctx.strokeStyle = '#c3c9bd'; ctx.lineWidth = 5;
    // 손잡이
    ctx.beginPath(); ctx.moveTo(-48, 40); ctx.bezierCurveTo(-52, 140, -40, 235, 0, 240); ctx.bezierCurveTo(42, 238, 52, 140, 52, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 윗부분
    ctx.beginPath(); ctx.ellipse(0, 0, 110, 82, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 스틱
    if (hl === 'stick') glow(-38, -8, 44);
    ctx.fillStyle = hl === 'stick' ? '#fff' : '#dde1d8'; ctx.beginPath(); ctx.arc(-38, -8, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f988a'; ctx.beginPath(); ctx.arc(-38, -8, 15, 0, Math.PI * 2); ctx.fill();
    // 버튼
    const btn = (x, y, on, label) => {
      if (on) glow(x, y, 32);
      ctx.fillStyle = on ? '#fff' : '#dde1d8'; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.scale(sg, 1); ctx.fillStyle = on ? C.greenDark : '#7c8576'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1); ctx.restore();
    };
    btn(42, 28, hl === 'x', side === 'L' ? 'X' : 'A');
    btn(62, -30, hl === 'b', side === 'L' ? 'Y' : 'B');
    if (hl === 'trigger') glow(-30, 78, 26);
    if (hl === 'grip') glow(44, 150, 26);
    ctx.restore();
    // 설명 이름표 (거울처럼 뒤집히지 않게 밖에서 그림)
    const spot = { stick: [-38, -8], x: [42, 28], trigger: [-30, 78], grip: [44, 150] }[hl];
    const name = { stick: '스틱', x: 'X 버튼', trigger: '방아쇠', grip: '쥐기 버튼' }[hl];
    if (spot) {
      const px = cx + sg * sc * spot[0], py = cy + sc * spot[1], dir = (px >= cx ? 1 : -1);
      const lx = cx + dir * sc * 200;
      ctx.strokeStyle = C.green; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, py); ctx.stroke();
      ctx.font = `700 34px ${FONT}`; const tw = ctx.measureText(name).width + 40;
      const bx = dir > 0 ? lx : lx - tw;
      ctx.fillStyle = C.green; ctx.beginPath(); ctx.roundRect(bx, py - 28, tw, 56, 28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, bx + tw / 2, py + 1);
    }
  }
  function drawNeed(ctx, k, cx, cy, r = 44) {
    const nd = NEED[k];
    ctx.fillStyle = nd.bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.stroke();
    if (nd.icon) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.73, 0, Math.PI * 2); ctx.fill(); drawIcon(ctx, nd.icon, cx, cy, r * 1.2); }
    else { ctx.save(); if (nd.glyph === 'water') ctx.filter = 'brightness(10)'; drawGlyph(ctx, nd.glyph, cx, cy, r * 1.1); ctx.restore(); }
  }
  function tutorial(step) {
    const key = TUT[step];
    const h = E.headWorld();
    tut = { step, key, done: false, x0: h.x, z0: h.z, yaw0: E.headYaw() };
    const vr = E.inXR();
    const T = {
      hello: ['기억정원에 오신 것을 환영해요', vr ? '천천히 하나씩 배워 볼게요. 손에 든 컨트롤러로 화면의 버튼을 가리키고, 검지 쪽 방아쇠를 당기면 눌러져요. “다음” 버튼을 눌러 보세요.' : '천천히 하나씩 배워 볼게요. 화면의 버튼은 마우스로 누르면 돼요. “다음” 버튼을 눌러 보세요.', 'trigger', 'R'],
      walk: ['걸어 보기', vr ? '왼손 스틱을 앞으로 살짝 밀어 보세요. 미는 방향으로 천천히 걸어가요.' : 'W 키를 누르면 앞으로 걸어가요. A, S, D 키로 다른 방향으로도 걸을 수 있어요.', 'stick', 'L'],
      turn: ['둘러보기', vr ? '오른손 스틱을 왼쪽이나 오른쪽으로 밀면 몸이 돌아가요. 고개를 돌려서 둘러봐도 돼요.' : 'Q, E 키를 누르거나 마우스를 끌면 몸을 돌려 둘러볼 수 있어요.', 'stick', 'R'],
      menu: ['메뉴 열기', vr ? '왼손의 X 버튼을 눌러 보세요. 메뉴가 열려요. 화면을 닫고 싶을 때는 B나 Y 버튼을 누르면 돼요.' : 'M 키를 누르면 메뉴가 열리고 닫혀요. 지금 M 키를 눌러 보세요.', 'x', 'L'],
      voice: ['말로 고르기', vr ? '손잡이 옆의 쥐기 버튼을 누른 채로 말하면, 말로도 고를 수 있어요. 예를 들어 “훈련 공간”이라고 말해 보세요.' : 'V 키를 누른 채로 말하면, 말로도 고를 수 있어요. 예를 들어 “훈련 공간”이라고 말해 보세요.', 'grip', 'R'],
      places: ['정원 안의 장소', '떠 있는 아이콘을 누르거나 메뉴에서 고르면, 초록 빛기둥이 길을 알려 줘요. 빛기둥을 따라 걸어가면 돼요.'],
      care: ['꽃 돌보기', '꽃 위에 아이콘이 뜨면 꽃이 그것을 필요로 한다는 뜻이에요. 보관함에서 도구를 꺼내 꽃 위로 가져다 놓아 주세요. 햇빛 아이콘은 그냥 누르면 돼요.'],
      end: ['준비가 끝났어요!', '이제 “처음 안내”를 따라 정원을 한 바퀴 돌아볼까요? 안내가 하나씩 알려 줄 거예요. 조작 방법은 메뉴의 “사용 방법”에서 다시 볼 수 있어요.']
    }[key];
    open(P => {
      P.glass(260, 70, 1400, 940, 60);
      // 진행 표시
      TUT.forEach((_, k) => { P.ctx.fillStyle = k === step ? C.green : k < step ? 'rgba(94,138,80,0.45)' : 'rgba(255,255,255,0.8)'; P.ctx.beginPath(); P.ctx.arc(W / 2 + (k - (TUT.length - 1) / 2) * 44, 130, k === step ? 13 : 10, 0, Math.PI * 2); P.ctx.fill(); });
      P.text(`${step + 1} / ${TUT.length}`, 1560, 132, { size: 28, color: C.sub, align: 'right' });
      P.text(T[0], W / 2, 220, { size: 60, weight: 700 });
      if (key === 'places') {
        const L = [['ic_flowers', '정원 가꾸기', '꽃을 심고 키워요'], ['anemone', '훈련 공간', '기억 훈련을 해요'], ['ic_market', '꽃 시장', '키운 꽃을 팔아요'], ['watering_can', '기억 꽃집', '씨앗과 도구를 사요'], ['ic_tea', '정원 티파티', '가족과 이야기해요'], ['poppy', '야외 정원', '내 방에서 꽃 따기']];
        L.forEach((it, k) => { const x = 560 + (k % 3) * 450, y = 360 + Math.floor(k / 3) * 220;
          P.circle(x - 130, y, 70, '#f8f6ef'); P.icon(it[0], x - 130, y, 110);
          P.text(it[1], x - 40, y - 24, { size: 38, weight: 700, align: 'left' }); P.text(it[2], x - 40, y + 30, { size: 30, color: C.sub, align: 'left' }); });
        P.text(T[1], W / 2, 770, { size: 36, color: C.ink, maxW: 1240 });
      } else if (key === 'care') {
        ['water', 'fert', 'pest', 'sun'].forEach((k, j) => { const x = W / 2 + (j - 1.5) * 260; drawNeed(P.ctx, k, x, 380, 70); P.text(NEED[k].name, x, 500, { size: 36, weight: 700 }); });
        P.text(T[1], W / 2, 660, { size: 40, color: C.ink, maxW: 1240 });
      } else if (key === 'hello' || key === 'end') {
        const ix = vr && key === 'hello' ? W / 2 - 260 : W / 2;
        P.circle(ix, 410, 120, '#f8f6ef'); P.icon(key === 'end' ? 'ic_flowers' : 'anemone', ix, 410, 190);
        if (vr && key === 'hello') drawController(P.ctx, W / 2 + 150, 360, 'R', 'trigger', 0.85);
        P.text(T[1], W / 2, 660, { size: 40, color: C.ink, maxW: 1240 });
      } else {
        if (vr) drawController(P.ctx, W / 2, 330, T[3], T[2], 0.95);
        else { P.ctx.save(); const keys = { walk: ['W', 'A', 'S', 'D'], turn: ['Q', 'E'], menu: ['M'], voice: ['V'] }[key];
          keys.forEach((kk, j) => { const x = W / 2 + (j - (keys.length - 1) / 2) * 130; P.rect(x - 52, 300, 104, 104, 22, 'rgba(255,255,255,0.9)'); P.text(kk, x, 354, { size: 52, weight: 700, color: C.greenDark }); }); P.ctx.restore(); }
        P.text(T[1], W / 2, 660, { size: 40, color: C.ink, maxW: 1240 });
        if (tut.done) { P.circle(W / 2 - 90, 770, 40, C.green); drawGlyph(P.ctx, 'check', W / 2 - 90, 770, 50); P.text('잘했어요!', W / 2 - 30, 772, { size: 40, weight: 700, color: C.greenDark, align: 'left' }); }
      }
      if (step > 0) P.button('prev', 360, 860, 300, 110, '이전', () => tutorial(step - 1), { size: 38, voice: ['이전', '뒤로'] });
      if (key === 'end') {
        P.button('go', 700, 860, 520, 110, '처음 안내 시작하기', () => { S.tutorialDone = true; E.save(); tut = null; questStart(); }, { kind: 'primary', size: 40, voice: ['처음 안내', '시작'] });
        P.button('later', 1260, 860, 300, 110, '나중에', () => { S.tutorialDone = true; E.save(); tut = null; mainMenu(); }, { size: 34, voice: ['나중에'] });
      }
      else {
        P.button('next', 760, 860, 400, 110, '다음', () => tutorial(step + 1), { kind: 'primary', size: 42, voice: ['다음'] });
        P.button('skip', 1260, 860, 300, 110, '건너뛰기', () => { S.tutorialDone = true; E.save(); tut = null; mainMenu(); }, { size: 34, voice: ['건너뛰기'] });
      }
    }, 'front', 'tut');
    E.say(T[0] + '. ' + T[1]);
  }
  function tutFrame() {
    if (!tut || current !== 'tut' || tut.done) return;
    const h = E.headWorld();
    let ok = false;
    if (tut.key === 'walk') ok = Math.hypot(h.x - tut.x0, h.z - tut.z0) > 0.8;
    if (tut.key === 'turn') { let d = Math.abs(E.headYaw() - tut.yaw0) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; ok = d > 0.45; }
    if (ok) { tut.done = true; main.refresh(); E.say('잘했어요!'); const st = tut.step; setTimeout(() => { if (tut && tut.step === st && current === 'tut') tutorial(st + 1); }, 1800); }
  }
  // ================= 화면이 고개를 따라오게 =================
  const FOLLOW = new Set(['market', 'shop', 'tea', 'mail', 'garden']);
  const _fp = new THREE.Vector3(), _fq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _tq = new THREE.Quaternion();
  let following = false;
  function followFrame(dt) {
    const on = main.visible && !E.inMR() && !E.carrying && (FOLLOW.has(activeZone) || current === 'tut');
    if (!on) { following = false; return; }
    _fp.copy(main.mesh.position); _fq.copy(main.mesh.quaternion);
    E.placeInFront(main); _tp.copy(main.mesh.position); _tq.copy(main.mesh.quaternion);
    main.mesh.position.copy(_fp); main.mesh.quaternion.copy(_fq);
    const h = E.headWorld();
    const a1 = Math.atan2(_fp.x - h.x, _fp.z - h.z), a2 = Math.atan2(_tp.x - h.x, _tp.z - h.z);
    let da = Math.abs(a1 - a2) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > 0.45 || _fp.distanceTo(_tp) > 1.0) following = true;
    if (following) {
      const k = 1 - Math.exp(-(dt || 0.016) * 3.5);
      main.mesh.position.lerp(_tp, k); main.mesh.quaternion.slerp(_tq, k);
      if (main.mesh.position.distanceTo(_tp) < 0.03) following = false;
    }
  }

  // ================= 처음 안내 (따라 하며 배우기) =================
  const QUEST = [
    { k: 'flash', title: '반짝 꽃 찾기 해 보기', text: '훈련 공간에서 “반짝 꽃 찾기”를 한 번 해 보세요. 잠깐 나타난 꽃의 위치를 기억하는 훈련이에요.', btn: '훈련 공간 열기', go: () => trainingArea() },
    { k: 'shopT', title: '기억 꽃집 훈련 해 보기', text: '이번에는 훈련 공간의 “기억 꽃집”을 해 보세요. 살 물건을 기억했다가 꽃집에서 고르는 훈련이에요.', btn: '훈련 공간 열기', go: () => trainingArea() },
    { k: 'plant', title: '꽃 심기', text: '정원으로 가서 빈 동그라미를 누르고 씨앗을 심어 보세요. 꽃 위에 뜨는 아이콘을 보고 돌봐 주면 꽃이 자라요.', btn: '정원으로 가기', go: () => guideTo('garden') },
    { k: 'tea', title: '정원 티파티', text: '티파티 자리로 가 보세요. 가족이나 친구와 자유롭게 이야기를 나누는 곳이에요.', btn: '티파티로 가기', go: () => guideTo('tea') },
    { k: 'buy', title: '기억 꽃집', text: '기억 꽃집을 열어 보세요. 꽃 코인으로 씨앗, 비료, 꽃바구니 재료를 사는 곳이에요.', btn: '기억 꽃집 열기', go: () => { activeZone = 'shop'; shopBuy(); } },
    { k: 'mr', title: '야외 정원 (MR)', text: '야외 정원에서는 내 방 바닥에 피어난 꽃을 기억해서 딸 수 있어요. Quest 헤드셋에서 해 보세요.', btn: '야외 정원 열기', go: () => mrInfo() },
    { k: 'market', title: '꽃 시장', text: '꽃 시장에 가 보세요. 키운 꽃을 팔아서 꽃 코인을 모으는 곳이에요.', btn: '꽃 시장으로 가기', go: () => guideTo('market') },
    { k: 'mail', title: '우편함', text: '마지막으로 우편함을 열어 보세요. 가족과 친구가 보낸 꽃 소원과 편지를 볼 수 있어요.', btn: '우편함으로 가기', go: () => guideTo('mail') }
  ];
  let quest = null;
  const guideCard = new Panel(1200, 330, 1.0, { renderOrder: 70 });
  E.addPanel(guideCard);
  guideCard.show(false);
  function questStart() {
    quest = { i: 0 }; S.questStep = 0; E.save();
    closeAll();
    questShow(true);
  }
  function questStop() { quest = null; S.questStep = null; E.save(); guideCard.show(false); E.toast('처음 안내를 멈췄어요. 메뉴에서 다시 시작할 수 있어요'); }
  function questShow(speak) {
    if (!quest) { guideCard.show(false); return; }
    const q = QUEST[quest.i];
    guideCard.setView(P => {
      P.glass(10, 10, 1180, 310, 50, 'rgba(255,255,255,0.55)');
      P.ctx.fillStyle = C.green; P.ctx.beginPath(); P.ctx.roundRect(40, 34, 250, 54, 27); P.ctx.fill();
      P.text(`처음 안내 ${quest.i + 1} / ${QUEST.length}`, 165, 62, { size: 28, weight: 700, color: '#fff' });
      P.text(q.title, 320, 62, { size: 44, weight: 700, align: 'left' });
      P.text(q.text, 600, 160, { size: 32, color: C.ink, maxW: 1100 });
      P.button('go', 330, 222, 480, 84, q.btn, () => q.go(), { kind: 'primary', size: 34, voice: [q.btn] });
      P.button('stop', 850, 222, 300, 84, '안내 그만하기', () => questStop(), { size: 30, voice: ['안내 그만'] });
    });
    if (!main.visible) { guideCard.show(true); placeGuide(true); if (speak) E.say(q.title + '. ' + q.text); }
    else if (speak) quest.pendingSay = true;
  }
  function qev(key) {
    if (!quest || QUEST[quest.i].k !== key) return;
    quest.i++; S.questStep = quest.i; E.save();
    if (quest.i >= QUEST.length) {
      quest = null; S.questStep = null; S.questDone = true; E.save(); guideCard.show(false);
      E.toast('처음 안내를 모두 마쳤어요! 이제 정원을 자유롭게 즐겨 보세요', true, 6000);
      return;
    }
    E.toast('잘했어요! 다음 안내를 볼까요?', false, 2500);
    setTimeout(() => questShow(true), 2600);
  }
  // 안내 카드는 눈앞 아래쪽에 두고, 고개를 크게 돌리면 따라옴
  const _gp = new THREE.Vector3(), _gt = new THREE.Vector3();
  let guideMove = false;
  function guideTarget(out) {
    const h = E.headWorld(), yaw = E.headYaw(), d = E.inXR() ? 1.55 : 1.15;
    out.set(h.x - Math.sin(yaw) * d, Math.max(0.55, h.y - (E.inXR() ? 0.78 : 0.55)), h.z - Math.cos(yaw) * d);
    return h;
  }
  function placeGuide(now) {
    const h = guideTarget(_gt);
    if (now) { guideCard.mesh.position.copy(_gt); guideCard.mesh.lookAt(h.x, h.y, h.z); }
  }
  function guideFrame(dt) {
    // 큰 화면이 열려 있을 때는 그 화면을 따라 하면 되니까 안내 카드는 잠시 숨김
    const want = !!quest && !E.inMR() && !main.visible;
    if (guideCard.visible !== want) {
      guideCard.show(want);
      if (want) { placeGuide(true); if (quest.pendingSay) { quest.pendingSay = false; const q = QUEST[quest.i]; E.say(q.title + '. ' + q.text); } }
    }
    if (!want) return;
    const h = guideTarget(_gt);
    _gp.copy(guideCard.mesh.position);
    const a1 = Math.atan2(_gp.x - h.x, _gp.z - h.z), a2 = Math.atan2(_gt.x - h.x, _gt.z - h.z);
    let da = Math.abs(a1 - a2) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > 0.5 || _gp.distanceTo(_gt) > 0.9) guideMove = true;
    if (guideMove) {
      const k = 1 - Math.exp(-(dt || 0.016) * 3.5);
      guideCard.mesh.position.lerp(_gt, k); guideCard.mesh.lookAt(h.x, h.y, h.z);
      if (guideCard.mesh.position.distanceTo(_gt) < 0.03) guideMove = false;
    }
  }

  // 안내 중: 지금 화면에서 눌러야 할 버튼을 알려 주기
  const PRESS = '여기를 누르세요';
  function questHint() {
    if (!quest || !main.visible || E.inMR()) return null;
    const k = QUEST[quest.i].k, c = current;
    const back = ['home', '“정원으로 돌아가기”를 누르세요. 그다음 아래 안내 카드를 보세요'];
    const leave = (txt) => ['exit', txt + ' 다 둘러보면 왼쪽 위의 나가기 버튼을 누르세요'];
    const M = {
      flashResult: back, shopResult: back, teaEnd: back, mrDone: back,
      flashStart: ['start', '“시작하기”를 누르세요'], flashInstr: ['ok', '설명을 읽고 “확인”을 누르세요'], flashRun: [null, '반짝인 꽃의 자리를 기억해서 눌러 주세요'],
      shopStart: ['start', '“시작하기”를 누르세요'], shopInstr: ['ok', '설명을 읽고 “확인”을 누르세요'], shopList: ['done', '살 물건을 잘 기억한 다음 “다 기억했어요”를 누르세요'],
      shopPick: ['pay', '기억한 물건을 모두 고른 다음 “계산하기”를 누르세요'], shopPay: ['pay', '동전을 올려 값을 맞춘 다음 “계산하기”를 누르세요'],
      guide: ['walk', '“걸어서 가기”를 누르고 초록 빛기둥을 따라 걸어가세요'],
      'garden-choose': [null, '심고 싶은 씨앗을 골라 주세요'], 'garden-confirm': ['yes', '“심기”를 누르세요'],
      mr: ['go', '“MR 시작하기”를 누르세요'], mrNo: ['ok', '“확인”을 누르면 다음 안내로 넘어가요'],
      teaEntry: leave('가족, 친구와 이야기하는 곳이에요. “참여하기”를 누르면 대화에 들어가요.'),
      shopBuy: leave('물건을 골라 장바구니에 담고 계산할 수 있어요.'),
      market: leave('키운 꽃을 팔아 꽃 코인을 받을 수 있어요.'),
      mail: leave('가족이 보낸 꽃 소원을 보고 꽃을 선물할 수 있어요.')
    };
    if (c === 'menu') {
      const t = { flash: 'train', shopT: 'train', plant: 'garden', tea: 'tea', market: 'market', mail: 'mail' }[k];
      return t ? [t, '이 버튼을 누르세요'] : ['close', '메뉴를 닫고 아래 안내 카드를 보세요'];
    }
    if (c === 'training') {
      if (k === 'flash') return ['flash', '“반짝 꽃 찾기”를 누르세요'];
      if (k === 'shopT') return ['shop', '“기억 꽃집”을 누르세요'];
      return ['exit', '나가기 버튼을 누르고 아래 안내 카드를 보세요'];
    }
    return M[c] || null;
  }
  let qhKey = '', qhT = 0;
  function questHintFrame(now) {
    const h = questHint();
    const key = h ? current + '|' + h[0] + '|' + h[1] : '';
    if (key !== qhKey) {
      qhKey = key;
      main.guideId = h ? h[0] : null; main.guideText = h && h[0] ? PRESS : '';
      main.refresh();
      if (h) { if (h[0]) E.toast(h[1], false, 5000); E.say(h[1]); }
    }
    if (main.guideId && now - qhT > 120) { qhT = now; main.refresh(); }
  }
  const _tick = E.onTick;
  E.onTick = (dt, now) => {
    followFrame(dt); tutFrame(); guideFrame(dt); questHintFrame(now);
    if (now - (E._bonusT || 0) > 60000) { E._bonusT = now; if (loginBonus()) E.toast('출석 보상으로 꽃 코인 200개를 받았어요'); }
    // 눈앞에 큰 화면이 열려 있으면 정원 보관함 버튼은 잠시 숨김
    const gbOn = !E.inMR() && (!main.visible || activeZone === 'garden');
    if (gardenBar.visible !== gbOn) gardenBar.show(gbOn);
    if (!E.inMR()) entrancesFrame(now);
    popsFrame(now); mrFrame(now);
    if (tea && current === 'teaChat' && E.listening && now - teaLvT > 150) { teaLvT = now; tea.redraw(); }
    _tick(dt, now);
  };

  // ================= 버튼 / 시작 =================
  E.onMenuButton = () => {
    if (tut && tut.key === 'menu' && current === 'tut') { tut.done = true; main.refresh(); E.say('잘했어요!'); setTimeout(() => { if (tut && tut.key === 'menu') tutorial(tut.step + 1); }, 1500); return; }
    if (E.inMR()) { if (mr && mr.phase === 'pick') mrHud(); return; }
    if (E.carrying) { E.carry(null); return; }
    if (main.visible && current === 'menu') closeAll(); else { teaStop(); flash = null; shop = null; mainMenu(); }
  };
  E.onBackButton = () => {
    if (E.inMR()) return;
    if (E.carrying) { E.carry(null); E.toast('내려놓았어요', false); return; }
    if (main.visible) { if (current === 'teaChat') teaEnd(); else closeAll(); }
  };
  const startPose = () => E.setPose(40.1, -10.5, 0);
  if (typeof S.questStep === 'number' && S.questStep < QUEST.length) quest = { i: S.questStep };
  E.onEnterDesktop = () => { startPose(); setTimeout(() => { if (!S.tutorialDone) tutorial(0); else { mainMenu(); if (quest) questShow(true); } if (dailyMsg) setTimeout(() => E.toast(dailyMsg), 600); }, 100); };
  E.onEnterVR = () => { startPose(); if (mrReturn) { const f = mrReturn; mrReturn = null; setTimeout(f, 300); return; } setTimeout(() => { if (!S.tutorialDone) tutorial(0); else { mainMenu(); if (quest) questShow(true); } if (dailyMsg) setTimeout(() => E.toast(dailyMsg), 600); dailyMsg = null; }, 200); };
  startPose();
  E.refreshWatch();
  window.MG_game = { questStart, _quest: () => quest, qev: k => qev(k), tutorial, _tut: () => tut, trainingArea, flashStart, shopStart, _cur: () => current, _sell: { sellableTotal, sellFlower, wildLeft, sellableOf, loginBonus }, mrInfo, mrBegin, _mr: () => mr, _mrPick: k => mrPick(mr.items[k]), customSetup, cartView, _sel: (i, c) => slotSelect(i, c), _apply: (i, k, it) => applyNeed(i, k, it), plantInfo, _b3slot: k => basketSlot(k), _bk: () => bk, basketStart, basketCheck, basketMake, basketDone, shopBuy, unlockPanel, plantInfo, _flashResult: (ok) => { flash = { level: 3 }; flashResult(ok, false); }, mainMenu, trainingArea, flashStart, shopStart, teaEntry, marketScreen, settings, mailScreen, inventory, guideTo, arrive: id => arrive(ZONES[id]), ZONES };
}
