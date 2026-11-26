// 기억정원 · 게임 화면과 규칙 (한국어)
import * as THREE from 'three';
import { Panel, Bubble, C, drawGlyph, drawIcon, FONT, B, yawOf, UI_OBJS } from './ui.js?v=32';
import { ITEMS, BASKETS, FLOWER_PRICE, basketPrice, SHOP_TABS, FLOWERS, STAGE_NAMES, FLASH_POOL, flashCfg, todayStr, clearState } from './data.js?v=32';

const W = 1920, H = 1080;
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 활동 구역 (Blender 좌표)
const ZONES = {
  garden: { id: 'garden', name: '照料花园', stand: [40.1, -7.8], face: [0, 1], panel: [40.1, -5.9, 1.25] },
  flash:  { id: 'flash',  name: '闪光找花', stand: [39.0, 1.0], face: [0, 1], panel: [39.0, 3.0, 1.45] },
  shop:   { id: 'shop',   name: '记忆花店', stand: [41.4, -1.7], face: [0.7071, 0.7071] },
  tea:    { id: 'tea',    name: '花园茶话会', stand: [47.0, -6.4], face: [0, 1], panel: [47.0, -4.6, 1.4] },
  market: { id: 'market', name: '花市场', stand: [34.2, -3.9], face: [0, 1], panel: [34.2, -2.4, 1.45] },
  mr:     { id: 'mr',     name: '户外花园', stand: [40.0, 4.4], face: [0, 1], panel: [40.0, 5.8, 1.5] },
  mail:   { id: 'mail',   name: '信箱', stand: [34.9, -7.9], face: [0.7071, 0.7071] }
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
  if (loginBonus()) dailyMsg = '签到奖励：获得 200 花币';
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

  const FOLLOW_Z = ['market', 'shop', 'tea', 'mail', 'garden'];
  function open(view, place = 'front', name = '') {
    if (!/^basket(Make|Done)/.test(name) && typeof b3Hide === 'function') b3Hide();
    // 같은 화면을 다시 그리거나 고개를 따라오는 화면이면 자리를 옮기지 않음 (화면이 튀지 않게)
    const keep = main.visible && (name === current || FOLLOW_Z.includes(activeZone) || current === 'tut');
    current = name;
    main.setView(view);
    if (keep) { }
    else if (place === 'front') E.placeInFront(main);
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
  const exitBtn = (P, cb = () => closeAll('随时可以按 X 键打开菜单')) => P.roundBtn('exit', 90, 90, 48, 'exit', cb, ['离开', '结束', '停']);
  const backBtn = (P, cb) => P.roundBtn('back', 90, 90, 48, 'exit', cb, ['后退', '返回', '离开']);
  const greet = () => { const h = new Date().getHours(); return h < 11 ? '早上好！' : h < 17 ? '下午好！' : '晚上好！'; };

  // ================= 메인 메뉴 =================
  function mainMenu() {
    const need = S.slots.filter(s => s && (needCount(s) || s.dormant)).length;
    const bloom = S.slots.filter(s => s && s.stage === 3 && !s.dormant).length;
    const msg = need ? `${greet()}有${need}朵花在等你照顾` : bloom ? `${greet()}花园里开着花呢` : `${greet()}今天想做什么呢？`;
    open(P => {
      P.coinChip(60, 50, S.coins);
      P.glass(470, 40, 980, 120, 60);
      P.text(msg, W / 2, 101, { size: 48, weight: 700 });
      P.roundBtn('close', W - 90, 92, 46, 'close', () => closeAll(), ['关闭']);
      P.button('help', 1480, 48, 300, 96, '使用方法', () => tutorial(0), { size: 34, voice: ['使用方法', '帮助', '说明'] });
      P.glass(90, 380, 1740, 300, 60, 'rgba(255,255,255,0.35)');
      const items = [
        ['garden', '照料花园', 'ic_flowers', () => guideTo('garden'), ['照料花园', '花园', '种花']],
        ['train', '训练空间', 'anemone', () => trainingArea(), ['训练空间', '训练']],
        ['mail', '信箱', 'ic_mail', () => guideTo('mail'), ['信箱', '信', '心愿']],
        ['set', '设置', 'gear', () => settings(), ['设置']]
      ];
      items.forEach((it, i) => {
        const n = items.length, w = 265, gap = 30, x = 90 + (1740 - (n * w + (n - 1) * gap)) / 2 + i * (w + gap), y = 440, h = 190;
        const isRec = it[0] === 'train' && (S.rec === 'flash' || S.rec === 'shop') || it[0] === 'garden' && S.rec === 'garden';
        P.button(it[0], x, y, w, h, it[1], it[3], { kind: isRec ? 'primary' : 'secondary', r: 36, size: 38, dy: 52, voice: it[4] });
        const cx = x + w / 2, cy = y + 68;
        if (it[2] === 'gear') drawGlyph(P.ctx, 'gear', cx, cy, 80);
        else P.icon(it[2], cx, cy, 100);
        if (isRec) P.badge('今日推荐', cx, y - 6);
      });
      P.hint('说出想去的地方（例如：“训练空间”）', 730, 900);
      P.text(E.inXR() ? '用左手 X 键打开或关闭菜单 · 用左摇杆走路' : '按 M 键打开或关闭菜单 · 用 W A S D 走路 · 用 Q E 转身', W / 2, 850, { size: 30, color: '#555' });
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
      P.text(`要去${z.name}吗？`, W / 2, 360, { size: 60, weight: 700 });
      P.text('跟着绿色光柱慢慢走过去吧。', W / 2, 450, { size: 36, color: C.sub });
      P.button('walk', 560, 560, 800, 110, '走过去', () => { closeAll(); E.beacon(z); E.toast(`跟着绿色光柱走到${z.name}`); }, { kind: 'primary', voice: ['走', '走路', '去'] });
      P.button('cancel', 560, 690, 800, 90, '取消', () => mainMenu(), { voice: ['取消'] });
    }, 'front', 'guide');
  }
  E.onArrive = z => arrive(z);
  function arrive(z) {
    activeZone = z.id;
    if (z.id === 'garden') gardenWelcome();
    else if (z.id === 'flash') flashStart();
    else if (z.id === 'shop') { if (quest && QUEST[quest.i] && QUEST[quest.i].k === 'buy') shopBuy(); else shopStart(); }
    else if (z.id === 'tea') teaEntry();
    else if (z.id === 'market') marketScreen();
    else if (z.id === 'mr') mrInfo();
    else if (z.id === 'mail') mailScreen();
  }

  // ================= 훈련 공간 =================
  function trainingArea() {
    open(P => {
      P.glass(560, 50, 800, 160, 60);
      P.text('训练空间', W / 2, 108, { size: 60, weight: 700 });
      P.text('今天想做什么训练？', W / 2, 170, { size: 34, color: C.sub });
      backBtn(P, () => mainMenu());
      const cards = [
        ['flash', '闪光找花', '记住刚才出现的\n花的位置', 'anemone', () => { activeZone = 'flash'; flashStart(); }, ['闪光', '找花']],
        ['shop', '记忆花店', '记住要买的东西\n在花店挑选', 'watering_can', () => { activeZone = 'shop'; shopStart(); }, ['记忆花店', '花店']],
        ['mr', '摘花', '记住花\n在房间里摘', 'poppy', () => mrInfo(), ['摘花']],
        ['basket', '制作花篮', '用我的花\n做花篮', 'ic_basket', () => basketStart(), ['花篮']]
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
        if (rec) P.badge('今日推荐', x + w / 2, y - 2, C.green, '#fff');
        if (c[0] === 'mr') { P.rect(x + w - 100, y + 24, 76, 48, 24, '#4f6b45'); P.text('MR', x + w - 62, y + 49, { size: 28, weight: 700, color: '#fff' }); }
        P.hit(c[0], x, y, w, h, c[4], { voice: c[5] });
      });
      P.hint('今日推荐只是参考，做别的训练也可以。', 880, 1000);
      P.text(S.rec === 'garden' ? '今日推荐：照料花园' : `试着说“${S.rec === 'flash' ? '闪光找花' : '记忆花店'}”`, W / 2, 1000, { size: 30, color: '#555' });
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
      P.text('摘花 (MR)', W / 2, 390, { size: 60, weight: 700 });
      P.text(forBasket ? '还记得花篮缺哪些花吗？花田里不会显示清单。只摘你记住的那些花吧。' : '房间的地板上会开出花来。先记住要摘哪些花，然后只摘这些花。', W / 2, 490, { size: 34, color: C.sub, maxW: 1000 });
      P.text('用手柄指着花，按扳机就能摘下来。开始前请看看周围，确认没有会碰到的东西。', W / 2, 610, { size: 30, color: C.sub, maxW: 1000 });
      if (!forBasket) P.text(`现在是第${mrLevel()}级`, W / 2, 700, { size: 34, weight: 700, color: C.green });
      P.button('go', 560, 760, 800, 110, '开始 MR', () => mrBegin(forBasket), { kind: 'primary', size: 42, voice: ['开始', 'MR'] });
    }, activeZone === 'mr' ? zoneOf('mr') : 'front', 'mr');
  }
  async function mrBegin(forBasket) {
    if (!(await E.mrSupported())) {
      open(P => {
        exitBtn(P);
        P.glass(460, 240, 1000, 600, 60);
        P.text('这里用不了 MR', W / 2, 380, { size: 52, weight: 700 });
        P.text('混合现实（MR）只有在 Quest 头显的浏览器里打开时才能用。电脑屏幕上和连接电脑的 VR 里都用不了。', W / 2, 500, { size: 32, color: C.sub, maxW: 860 });
        P.button('ok', 610, 660, 700, 100, '确认', () => { if (quest) { qev('mr'); closeAll(); } else mrInfo(); }, { kind: 'primary' });
      }, 'front', 'mrNo');
      return;
    }
    const lv = mrLevel();
    const target = forBasket ? (mrFlowerNeed() || mrTarget(lv)) : mrTarget(lv);
    mr = { lv, target, picked: {}, wrong: 0, hints: 0, forBasket, items: [], phase: 'wait' };
    main.show(false); current = null; tilesHide();
    E.toast('马上就能看到你的房间了', false, 2500);
    E.enterMR();
  }
  E.onMRCancel = () => { mr = null; };
  E.onEnterMR = () => {
    qev('mr');
    if (!mr) { const lv = mrLevel(); mr = { lv, target: mrTarget(lv), picked: {}, wrong: 0, hints: 0, forBasket: false, items: [], phase: 'wait' }; }
    mrSpawn();
    if (mr.forBasket) { mr.phase = 'pick'; mrHud(); E.toast('只摘你记住的那些花吧', true, 4000); }
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
      E.toast(`${FLOWERS[t].name} +1 · 已放进鲜花仓库`, false, 1500);
      mrHud();
      if (Object.keys(mr.target).every(k => (mr.picked[k] || 0) >= mr.target[k])) { mr.phase = 'done'; setTimeout(mrDone, 900); }
    } else {
      mr.wrong++; it.shake = performance.now();
      E.toast(mr.target[t] ? '这种花已经摘够了' : '不是这朵花。再想一想吧？', false, 2200);
    }
  }
  function mrShowTarget(isHint) {
    if (!mr) return;
    mr.phase = 'show';
    if (isHint) mr.hints++;
    const sec = isHint ? 3 : [0, 6, 6, 7, 7, 6][mr.lv] || 6, t0 = performance.now();
    open(P => {
      P.glass(360, 110, 1200, 760, 60);
      P.text(isHint ? '再看一次吧' : (mr.forBasket ? '这些是花篮需要的花' : '请记住这些花'), W / 2, 200, { size: 54, weight: 700 });
      const list = Object.entries(mr.target), n = list.length;
      list.forEach(([t, c], k) => {
        const x = W / 2 + (k - (n - 1) / 2) * 340;
        P.circle(x, 400, 120, '#f8f6ef'); P.icon(FLOWERS[t].icon, x, 400, 180);
        P.text(`${FLOWERS[t].name} ${c}朵`, x, 575, { size: 42, weight: 700 });
      });
      const left = Math.max(0, sec - (performance.now() - t0) / 1000);
      P.rect(560, 660, 800, 26, 13, 'rgba(255,255,255,0.7)');
      P.rect(560, 660, Math.max(26, 800 * left / sec), 26, 13, C.green);
      P.text('一会儿就会消失，然后只摘这些花', W / 2, 760, { size: 32, color: C.sub });
    }, 'front', 'mrShow');
    clearInterval(mrTimer);
    mrTimer = setInterval(() => {
      if (!mr || current !== 'mrShow') { clearInterval(mrTimer); return; }
      if (performance.now() - t0 >= sec * 1000) { clearInterval(mrTimer); mr.phase = 'pick'; mrHud(); E.toast('现在去摘你记住的花吧', true, 3000); return; }
      main.refresh();
    }, 200);
  }
  function mrHud() {
    if (!mr) return;
    const total = sumv(mr.target), got = sumv(mr.picked);
    open(P => {
      P.glass(400, 30, 1120, 170, 50);
      P.text(`已摘 ${got} / ${total} 朵`, 640, 115, { size: 44, weight: 700 });
      P.button('hint', 900, 60, 300, 110, '再看一次', () => mrShowTarget(true), { size: 34, voice: ['再看一次'] });
      P.button('end', 1220, 60, 270, 110, '结束', () => mrQuit(), { size: 34, voice: ['结束', '停'] });
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
      P.text(perfect ? '全都记住并摘对了！' : '花都摘好了！', W / 2, 360, { size: 54, weight: 700 });
      const label = reward ? `花币 +${reward}` : '今天的奖励已经领完了', ts = reward ? 38 : 30;
      P.ctx.font = `700 ${ts}px ${FONT}`;
      const tw = P.ctx.measureText(label).width, pw = tw + 44 + 24 + 64, px = W / 2 - pw / 2;
      P.rect(px, 410, pw, 80, 40, 'rgba(238,244,232,0.85)');
      drawGlyph(P.ctx, 'coin', px + 32 + 22, 450, 44);
      P.text(label, px + 32 + 44 + 24, 452, { size: ts, weight: 700, color: C.greenDark, align: 'left' });
      P.text(`摘错 ${wrong} 次 · 再看 ${hints} 次`, W / 2, 540, { size: 32, color: C.sub });
      P.text(unlocked ? `第${lv + 1}级已经解锁。摘的花已经放进鲜花仓库了。` : '摘的花已经放进鲜花仓库了，可以拿到花市场去卖。', W / 2, 595, { size: 32, color: C.sub, maxW: 900 });
      if (fb) P.button('basket', 560, 650, 800, 105, '去做花篮', () => { const id = bk.style; mrReturn = () => basketCheck(id); E.exitMR(true); }, { kind: 'primary', voice: ['花篮', '去做'] });
      else P.button('again', 560, 650, 800, 105, '再玩一次', () => mrAgain(), { kind: 'primary', voice: ['再玩一次', '再'] });
      P.button('home', 560, 775, 800, 105, '回到花园', () => { mrReturn = null; E.exitMR(true); }, { voice: ['回花园', '返回'] });
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
      P.text('制作花篮', W / 2, 92, { size: 54, weight: 700 });
      P.text('请选一个喜欢的花篮', W / 2, 145, { size: 30, color: C.sub });
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
        drawGlyph(P.ctx, 'coin', x + w / 2 - 70, y + 610, 30); P.text(`卖价 ${basketPrice(st)}`, x + w / 2 + 14, y + 612, { size: 28, weight: 700, color: C.greenDark });
        P.hit(st.id, x, y, w, h, () => basketCheck(st.id), { voice: [st.name, st.name.split(' ')[0]] });
      });
      { // 내 마음대로 만들기
        const x = 130 + 3 * 420, y = 230, w = 390, h = 640, hov = P.hover === 'custom';
        P.rect(x, y, w, h, 44, hov ? '#fff' : 'rgba(255,255,255,0.5)', hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 7 : 3);
        P.circle(x + w / 2, y + 185, 120, 'rgba(255,255,255,0.7)', C.green, 4);
        P.icon('ic_basket', x + w / 2, y + 175, 170);
        P.circle(x + w / 2 + 85, y + 255, 34, C.green); P.text('+', x + w / 2 + 85, y + 252, { size: 52, weight: 700, color: '#fff' });
        P.text('自由制作', x + w / 2, y + 380, { size: 42, weight: 700 });
        P.text('自己挑选花和\n装饰材料来制作', x + w / 2, y + 450, { size: 28, color: C.sub, maxW: w - 40 });
        P.text('价格由选的材料决定', x + w / 2, y + 590, { size: 24, color: C.sub, maxW: w - 30 });
        P.hit('custom', x, y, w, h, () => customSetup(), { voice: ['自由', '自由制作', '自己'] });
      }
      const made = (S.baskets || []).length;
      P.hint(made ? `到现在做了${made}个花篮` : '点花篮就会显示需要的材料', 920, 900);
    }, 'front', 'basketStart');
    E.say('制作花篮。请选一个喜欢的花篮。');
  }
  // 내 마음대로: 꽃 종류·수와 꾸미기 재료를 직접 고르기
  let cust = { flowers: { tulip: 1, daisy: 1, sunflower: 1 }, ribbon: 1, wrap: 0 };
  function customStyle() {
    const flowers = Object.fromEntries(Object.entries(cust.flowers).filter(([, n]) => n > 0));
    const use = { basket: 1 }; if (cust.ribbon) use.ribbon = cust.ribbon; if (cust.wrap) use.wrap = cust.wrap;
    return { id: 'custom', name: '我的专属花篮', desc: '用我选的花做的花篮', flowers, tools: ['pruners'], use };
  }
  function customSetup() {
    open(P => {
      exitBtn(P, () => basketStart());
      P.glass(460, 40, 1000, 130, 60);
      P.text('自由制作花篮', W / 2, 92, { size: 52, weight: 700 });
      P.text('最多可以放9朵花', W / 2, 145, { size: 28, color: C.sub });
      const total = Object.values(cust.flowers).reduce((a, b) => a + b, 0);
      P.glass(200, 200, 900, 680, 50, 'rgba(255,255,255,0.32)');
      P.text('花', 650, 250, { size: 38, weight: 700 });
      Object.keys(FLOWERS).forEach((t, k) => {
        const y = 300 + k * 180, n = cust.flowers[t];
        P.rect(240, y, 820, 160, 32, 'rgba(255,255,255,0.55)');
        P.icon(FLOWERS[t].icon, 330, y + 80, 110);
        P.text(FLOWERS[t].name, 420, y + 60, { size: 38, weight: 700, align: 'left' });
        P.text(`我的${FLOWERS[t].name}：${S.flowers[t] || 0}朵`, 420, y + 110, { size: 26, color: C.sub, align: 'left' });
        P.button('m' + t, 750, y + 40, 90, 80, '−', () => { cust.flowers[t] = Math.max(0, n - 1); main.refresh(); }, { size: 46, disabled: !n, voice: [] });
        P.text(String(n), 885, y + 82, { size: 44, weight: 700 });
        P.button('p' + t, 930, y + 40, 90, 80, '+', () => { cust.flowers[t] = n + 1; main.refresh(); }, { size: 46, disabled: total >= 9, voice: [] });
      });
      P.glass(1140, 200, 580, 680, 50, 'rgba(255,255,255,0.32)');
      P.text('装饰材料', 1430, 250, { size: 38, weight: 700 });
      const opt = (y, id, val, max, set) => {
        P.rect(1170, y, 520, 150, 32, 'rgba(255,255,255,0.55)');
        shopIcon(P, id, 1250, y + 75, 100);
        P.text(ITEMS[id].name, 1320, y + 55, { size: 34, weight: 700, align: 'left' });
        P.text(`我的${ITEMS[id].name}：${inv(id)}个`, 1320, y + 105, { size: 24, color: C.sub, align: 'left' });
        if (max) {
          P.button('m' + id, 1480, y + 40, 70, 70, '−', () => { set(Math.max(0, val - 1)); main.refresh(); }, { size: 40, disabled: !val, voice: [] });
          P.text(String(val), 1580, y + 77, { size: 40, weight: 700 });
          P.button('p' + id, 1610, y + 40, 70, 70, '+', () => { set(Math.min(max, val + 1)); main.refresh(); }, { size: 40, disabled: val >= max, voice: [] });
        } else P.text('1个（必须）', 1680, y + 78, { size: 26, color: C.greenDark, align: 'right' });
      };
      opt(300, 'basket', 1, 0, () => {});
      opt(470, 'ribbon', cust.ribbon, 3, v => cust.ribbon = v);
      opt(640, 'wrap', cust.wrap, 2, v => cust.wrap = v);
      const st = customStyle();
      drawGlyph(P.ctx, 'coin', 760, 945, 40);
      P.text(`做好后可以卖${total ? basketPrice(st) : 0}花币`, 790, 947, { size: 32, weight: 700, color: C.greenDark, align: 'left' });
      P.button('next', 1300, 900, 420, 100, '检查材料', () => { CUSTOM = customStyle(); basketCheck('custom'); }, { kind: 'primary', disabled: !total, voice: ['确认', '下一个'] });
    }, 'front', 'customSetup');
    E.say('请选择花和装饰材料');
  }
  // 2~3. 필요한 재료와 보관함 확인
  function basketCheck(id) {
    const st = bStyle(id), miss = basketNeeds(st);
    open(P => {
      exitBtn(P, () => basketStart());
      P.glass(200, 40, 1520, 130, 60);
      P.text(st.name, W / 2, 92, { size: 50, weight: 700 });
      P.text('需要的材料。绿色标记是已经有的，红色标记是缺少的', W / 2, 145, { size: 28, color: C.sub });
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
      col(220, '花', '在 MR 花田摘，或在花园里种', Object.entries(st.flowers).map(([t, n]) => ({ name: `${FLOWERS[t].name} ${n}朵`, line: `我的${FLOWERS[t].name}：${S.flowers[t] || 0}朵`, ok: (S.flowers[t] || 0) >= n, draw: (x, y) => P.icon(FLOWERS[t].icon, x, y, 90) })));
      col(720, '工具', '买一次就能一直用', st.tools.map(id => ({ name: ITEMS[id].name, line: inv(id) ? '已经有了' : '没有', ok: !!inv(id), draw: (x, y) => shopIcon(P, id, x, y, 90) })));
      col(1220, '装饰材料', '每次做花篮都要用', Object.entries(st.use).map(([id, n]) => ({ name: `${ITEMS[id].name} ${n}个`, line: `我的${ITEMS[id].name}：${inv(id)}个`, ok: inv(id) >= n, draw: (x, y) => shopIcon(P, id, x, y, 90) })));
      if (!miss.length) {
        P.button('make', 560, 840, 800, 110, '材料都齐了 · 开始制作', () => basketMode(id), { kind: 'primary', size: 40, voice: ['制作', '开始'] });
      } else {
        const needShop = miss.some(m => m.kind !== 'flower'), needFlower = miss.some(m => m.kind === 'flower');
        P.text('请记住缺少的东西。在商店和花田里不会再显示清单', W / 2, 838, { size: 30, weight: 600, color: C.greenDark });
        const btns = [];
        if (needShop) btns.push(['shop', '去记忆花店买', () => { bk = { style: id }; guideTo('shop'); }, ['花店', '去买']]);
        if (needFlower) btns.push(['mr', '去 MR 花田摘花', () => { bk = { style: id }; guideTo('mr'); }, ['花田', '摘花']]);
        btns.push(['again', id === 'custom' ? '重新选材料' : '重新选花篮', () => id === 'custom' ? customSetup() : basketStart(), ['再']]);
        const bw = (1300 - (btns.length - 1) * 20) / btns.length;
        btns.forEach((b, k) => P.button(b[0], 310 + k * (bw + 20), 880, bw, 100, b[1], b[2], { kind: k === 0 ? 'primary' : 'secondary', size: 34, voice: b[3] }));
      }
    }, 'front', 'basketCheck');
    E.say(miss.length ? `缺少${miss.length}样材料，请好好记住。` : '材料都齐了，来做花篮吧？');
  }
  // 6. 따라 꽂기 / 자유롭게 꽂기
  function basketMode(id) {
    const st = bStyle(id);
    open(P => {
      exitBtn(P, () => basketCheck(id));
      P.glass(460, 120, 1000, 820, 60);
      P.text('要怎么插呢？', W / 2, 220, { size: 56, weight: 700 });
      [['guide', '引导插花', '在发光的位置\n插上提示的花'], ['free', '自由插花', '插在我想要的\n任何位置']].forEach(([m, t, d], k) => {
        const x = 520 + k * 450, y = 290, w = 430, h = 460, hov = P.hover === m;
        P.rect(x, y, w, h, 40, hov ? '#fff' : 'rgba(255,255,255,0.5)', hov ? C.green : 'rgba(255,255,255,0.95)', hov ? 7 : 3);
        drawBasket(P, x + w / 2, y + 170, 0.5, m === 'guide' ? ['tulip', null, 'daisy', null] : ['daisy', 'tulip', null, 'sunflower'], m === 'guide' ? 1 : -1);
        P.text(t, x + w / 2, y + 330, { size: 44, weight: 700 });
        P.text(d, x + w / 2, y + 400, { size: 28, color: C.sub, maxW: w - 40 });
        P.hit(m, x, y, w, h, () => basketMake(id, m), { voice: [t, t.split(' ')[0]] });
      });
      P.hint('也可以说“引导插花”或“自由”', 810);
    }, 'front', 'basketMode');
  }
  function basketMake(id, mode) {
    const st = bStyle(id);
    const order = shuffle(Object.entries(st.flowers).flatMap(([t, n]) => Array(n).fill(t)));
    bk = { style: id, mode, slots: Array(order.length).fill(null), order, pick: null, left: { ...st.flowers } };
    b3Show(order.length);
    basketDraw();
    E.say(mode === 'guide' ? '请在发光的位置插上提示的花。' : '先选花，再点花篮里的空位插进去。');
  }
  function basketDraw() {
    const st = bStyle(bk.style), n = bk.slots.length;
    const next = bk.slots.indexOf(null);
    open(P => {
      exitBtn(P, () => { bk = null; basketCheck(st.id); });
      P.glass(470, 30, 980, 110, 55);
      const done = next < 0;
      P.text(done ? '全部插好了！' : bk.mode === 'guide' ? `请在发光的位置插上${FLOWERS[bk.order[next]].name}` : (bk.pick ? `请点要插${FLOWERS[bk.pick].name}的位置` : '请在右边选花'), W / 2, 86, { size: 42, weight: 700 });
      // 가운데는 비워 두고, 앞에 놓인 3D 바구니에 꽃을 꽂아요
      b3Update(bk.slots, bk.mode === 'guide' && !done ? next : -1, bk.mode === 'guide' && !done ? bk.order[next] : null);
      if (bk.mode === 'free' && !done) P.text(bk.pick ? '点花篮里的白色圆圈插花 · 点已插的花可以拔出来' : '', W / 2, 160, { size: 28, color: '#444' });
      // 꽃 고르는 칸
      const types = Object.keys(st.flowers);
      types.forEach((t, k) => {
        const x = 1560, y = 200 + k * 220, sel = bk.pick === t, left = bk.left[t];
        P.rect(x, y, 230, 200, 36, sel ? '#fff' : 'rgba(255,255,255,0.5)', sel ? C.green : 'rgba(255,255,255,0.95)', sel ? 7 : 3);
        P.ctx.save(); if (!left) P.ctx.globalAlpha = 0.35; P.icon(FLOWERS[t].icon, x + 115, y + 80, 110); P.ctx.restore();
        P.text(`${FLOWERS[t].name} ${left}`, x + 115, y + 170, { size: 30, weight: 700, color: left ? C.ink : '#999' });
        P.hit('f' + t, x, y, 230, 200, () => basketPick(t), { disabled: !left || done, voice: [FLOWERS[t].name] });
      });
      if (done) P.button('finish', 1500, 880, 360, 110, '完成', () => basketFinish(), { kind: 'primary', size: 40, voice: ['完成', '做好了'] });
    }, 'front', 'basketMake');
  }
  function basketPick(t) {
    if (bk.mode === 'guide') {
      const next = bk.slots.indexOf(null);
      if (bk.order[next] !== t) { E.toast(`这次插${FLOWERS[bk.order[next]].name}试试吧？`, false); return; }
      bk.slots[next] = t; bk.left[t]--; basketDraw(); return;
    }
    bk.pick = bk.pick === t ? null : t; basketDraw();
  }
  function basketSlot(k) {
    if (bk.mode === 'guide') { const nx = bk.slots.indexOf(null); if (nx >= 0) E.toast(`请在右边选${FLOWERS[bk.order[nx]].name}`, false); return; }
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
      exitBtn(P, () => closeAll('做好了花篮'));
      if (!B3.group) { b3Show(b.slots.length); b3Update(b.slots, -1, null); B3.slots.forEach(s => { s.mk.visible = false; s.hb.visible = false; }); }
      P.glass(560, 40, 800, 150, 60);
      P.text('花篮做好了！', W / 2, 100, { size: 54, weight: 700 });
      P.text(st.name, W / 2, 158, { size: 30, color: C.sub });
      P.glass(1420, 220, 460, 720, 50);
      if (b.state === 'new') {
        P.text('这个花篮', 1650, 300, { size: 34, weight: 600 }); P.text('要怎么处理？', 1650, 345, { size: 34, weight: 600 });
        P.button('show', 1470, 410, 360, 110, '展示', () => { b.state = 'shown'; E.save(); placeShownBaskets(); E.toast('已展示在茶话会桌旁'); basketDone(idx); }, { size: 36, voice: ['展示'] });
        P.button('gift', 1470, 545, 360, 110, '送礼物', () => {
          b.state = 'gift'; S.letters.unshift({ from: '女儿', text: `妈妈做的${st.name}真好看！谢谢妈妈。` });
          log('wish', { from: '女儿', type: 'basket' }); E.save(); E.toast('把花篮寄给女儿了，信箱里收到了回信'); basketDone(idx);
        }, { size: 36, voice: ['礼物'] });
        P.button('sell', 1470, 680, 360, 110, `卖掉（+${basketPrice(st)}）`, () => { b.state = 'sold'; S.coins += basketPrice(st); E.save(); E.refreshWatch(); E.toast(`收到了${basketPrice(st)}个花币`); basketDone(idx); }, { size: 34, voice: ['卖', '卖掉'] });
      } else {
        P.text(b.state === 'shown' ? '已展示在\n茶话会桌旁' : b.state === 'gift' ? '送给女儿了。\n去信箱看看吧' : `收到了\n${basketPrice(st)}个花币`, 1650, 360, { size: 32, weight: 600, color: C.greenDark, maxW: 400 });
        P.button('more', 1470, 560, 360, 100, '再做一个', () => basketStart(), { kind: 'primary', voice: ['再', '再'] });
        P.button('home', 1470, 690, 360, 100, '回花园', () => closeAll('回到花园了'), { voice: ['花园'] });
      }
    }, 'front', 'basketDone');
    E.say('花篮做好了！');
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
      P.text('闪光找花', W / 2, 425, { size: 72, weight: 700 });
      P.text('记住花的位置', W / 2, 500, { size: 38, color: C.sub });
      const first = flashPage * 5 + 1;
      P.button('prev', 585, 560, 64, 80, '‹', () => { flashPage = Math.max(0, flashPage - 1); main.refresh(); }, { disabled: flashPage === 0, size: 50, voice: ['上一个'] });
      P.button('nextp', 1271, 560, 64, 80, '›', () => { flashPage++; main.refresh(); }, { disabled: first + 5 > S.flashLevel + 1, size: 50, voice: ['下一步'] });
      for (let k = 0; k < 5; k++) {
        const l = first + k, x = 660 + k * 122, locked = l > S.flashLevel;
        P.button('lv' + l, x, 560, 112, 80, `第${l}关`, () => { flashSel = l; main.refresh(); }, { kind: flashSel === l ? 'chipOn' : 'secondary', disabled: locked, size: 27, voice: [`第${l}关`] });
        if (locked) { P.circle(x + 100, 566, 18, C.lock); drawGlyph(P.ctx, 'lock', x + 100, 566, 25); }
      }
      const cf = flashCfg(flashSel);
      P.text(`${cf.cols}×${cf.rows}格 · 花${cf.n}朵${cf.bfly ? ' · 蝴蝶' : ''} · 回答时间${cf.limit}秒`, W / 2, 685, { size: 30, color: C.greenDark, weight: 600 });
      P.button('start', 660, 740, 600, 110, '开始', () => flashInstr(), { kind: 'primary', voice: ['开始'] });
      P.hint('试着说“开始”', 970, 560);
    }, placeOf('flash'), 'flashStart');
    E.say('闪光找花。请记住花的位置。');
  }
  function flashInstr() {
    open(P => {
      exitBtn(P, () => flashStart());
      P.glass(260, 140, 1400, 800, 60);
      P.text('闪光找花', W / 2, 230, { size: 64, weight: 700 });
      const steps = ['花会出现几秒钟', '请记住它在哪一格', '在时间内指向那个格子'];
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
      P.text('关卡越高，格子和花越多，时间越短。第4关开始还会出现蝴蝶。', W / 2, 740, { size: 30, color: C.sub });
      P.button('ok', 660, 800, 600, 100, '确认', () => flashRun(flashSel), { kind: 'primary', voice: ['确认', '开始'] });
    }, placeOf('flash'), 'flashInstr');
    E.say('花会出现几秒钟。请记住它在哪一格。');
  }
  function flashTitle() {
    const f = flash, cf = f.cfg;
    if (f.phase === 'show') return cf.n > 1 ? `记住${cf.n}朵花的位置` : '记住花的位置';
    if (f.phase === 'chooseB') return '蝴蝶停在哪里了？';
    if (f.phase === 'choose') return cf.n > 1 ? `${cf.n}朵花刚才在哪里？` : '花刚才在哪里？';
    return '看正确答案';
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
      exitBtn(P, () => { stopFlashTimer(); flash = null; closeAll('闪光找花结束了'); });
      P.rect(W - 280, 50, 220, 80, 40, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
      P.text(`第${level}关`, W - 170, 92, { size: 36, weight: 700, color: C.green });
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
        P.text(flash.phase === 'show' ? '记忆时间' : '剩余时间', cx, cy + 62, { size: 28, weight: 600, color: C.sub });
      }
      const tip = flash.phase === 'choose' ? (cfg.n > 1 ? `指向格子\n再按按钮（${flash.picks.length}/${cfg.n}）` : '指向格子\n再按按钮') : flash.phase === 'chooseB' ? '请选出蝴蝶\n停过的格子' : '';
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
    if (timeout) E.toast('时间到了，来看看正确答案吧？', false);
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
      P.text(`第${lv}关`, W - 170, 92, { size: 36, weight: 700, color: C.green });
      P.glass(560, 110, 800, 800, 60);
      if (ok) { P.circle(W / 2, 255, 90, C.green); drawGlyph(P.ctx, 'check', W / 2, 255, 110); }
      else { P.circle(W / 2, 255, 90, '#eef4e8'); P.icon('anemone', W / 2, 255, 135); }
      P.text(ok ? '记得真好！' : timeout ? '时间到了' : '好可惜！再试一次吧？', W / 2, 405, { size: 56, weight: 700 });
      if (ok) {
        const label = reward ? `花币 +${reward}` : '今天的奖励已经领完了', ts = reward ? 38 : 30;
        P.ctx.font = `700 ${ts}px ${FONT}`;
        const tw = P.ctx.measureText(label).width, pw = tw + 44 + 24 + 64, px = W / 2 - pw / 2;
        P.rect(px, 450, pw, 80, 40, 'rgba(238,244,232,0.75)');
        drawGlyph(P.ctx, 'coin', px + 32 + 22, 490, 44);
        P.text(label, px + 32 + 44 + 24, 492, { size: ts, weight: 700, color: C.greenDark, align: 'left' });
      }
      P.text(ok ? (unlocked ? `第${lv + 1}关开放了。答错也不会扣分。` : '答错也不会扣分。') : '绿色标记是正确的格子。答错也不会扣分。', W / 2, 580, { size: 30, color: C.sub, maxW: 700 });
      const nextLv = ok ? lv + 1 : lv;
      P.button('next', 660, 650, 600, 95, ok ? '进入下一关' : '再来一次', () => { flashSel = nextLv; flashPage = Math.floor((nextLv - 1) / 5); flashRun(nextLv); }, { kind: 'primary', voice: ['下一个', '再'] });
      P.button('home', 660, 765, 600, 95, '回到花园', () => closeAll('回到花园了'), { voice: ['回花园', '返回'] });
    }, placeOf('flash'), 'flashResult');
    E.say(ok ? '记得真好！' : '好可惜！再试一次吧？');
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
      P.text('记忆花店', W / 2, 460, { size: 72, weight: 700 });
      P.text('记住要买的东西再挑选', W / 2, 540, { size: 38, color: C.sub });
      [1, 2, 3].forEach(l => {
        const locked = l > S.shopLevel;
        P.button('lv' + l, 640 + (l - 1) * 220, 600, 200, 80, `第${l}关`, () => { shopSel = l; main.refresh(); }, { kind: shopSel === l ? 'chipOn' : 'secondary', disabled: locked, size: 34, voice: [`第${l}关`] });
        if (locked) { P.circle(640 + (l - 1) * 220 + 180, 606, 20, C.lock); drawGlyph(P.ctx, 'lock', 640 + (l - 1) * 220 + 180, 606, 28); }
      });
      P.button('start', 660, 730, 600, 110, '开始', () => shopInstr(), { kind: 'primary', voice: ['开始'] });
      exitBtn(P);
      P.hint('试着说“开始”', 960, 560);
    }, placeOf('shop'), 'shopStart');
    E.say('记忆花店。记住要买的东西再挑选。');
  }
  // 훈련 없이 사기: 장바구니에 담고 → 장바구니 확인 → 직접 코인을 세어 계산
  let buyTab = 0, cart = {}, cartPay = { tray: [], msg: '', tries: 0 };
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(cart).reduce((a, [id, q]) => a + ITEMS[id].price * q, 0);
  function shopBuy() {
    open(P => {
      exitBtn(P, () => closeAll('离开了记忆花店'));
      P.glass(470, 40, 980, 120, 60);
      P.text('记忆花店', W / 2, 88, { size: 54, weight: 700 });
      P.text('点需要的东西放进购物车', W / 2, 138, { size: 28, color: C.sub });
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
        P.hit(id, x, y, w, h, () => { cart[id] = q + 1; E.toast(`把${it.name}放进购物车了`, false); main.refresh(); }, { voice: [it.name] });
      });
      const n = cartCount();
      P.button('cart', 1020, 945, 520, 95, n ? `查看购物车（${n}个）` : '购物车是空的', () => cartView(), { kind: 'primary', disabled: !n, size: 36, voice: ['购物车', '结算'] });
      P.button('train', 380, 945, 600, 95, '用记忆训练来买', () => shopStart(), { size: 32, voice: ['训练', '记忆训练'] });
    }, placeOf('shop'), 'shopBuy');
    E.say('这里是记忆花店。点想要的东西放进购物车。');
  }
  function cartView() {
    open(P => {
      exitBtn(P, () => shopBuy());
      P.glass(460, 40, 1000, 120, 60);
      P.text('购物车', W / 2, 101, { size: 54, weight: 700 });
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
      if (!ent.length) P.text('购物车是空的', W / 2, 540, { size: 40, color: C.sub });
      P.text('合计要自己加起来，结算时用花币付', W / 2, 860, { size: 28, color: C.sub });
      P.button('more', 460, 930, 480, 100, '再选一些', () => shopBuy(), { voice: ['再选一些', '更多'] });
      P.button('pay', 980, 930, 480, 100, '结算', () => { cartPay = { tray: [], msg: '', tries: 0 }; cartPayView(); }, { kind: 'primary', disabled: !ent.length, voice: ['结算'] });
    }, placeOf('shop'), 'cartView');
    E.say('这里是购物车，看看你买了什么。');
  }
  function cartPayView() {
    open(P => {
      exitBtn(P, () => cartView());
      P.glass(400, 40, 1120, 120, 60);
      P.text('把价格全部加起来，付花币吧', W / 2, 101, { size: 46, weight: 700 });
      const ent = Object.entries(cart);
      P.glass(120, 200, 720, 700, 50);
      P.text('购物车', 170, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      const rowH = ent.length > 4 ? 80 : 100;
      ent.slice(0, 6).forEach(([id, q], i) => {
        const y = 290 + i * (rowH + 12);
        P.rect(160, y, 640, rowH, 24, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, 220, y + rowH / 2, rowH * 0.7);
        P.text(ITEMS[id].name + (q > 1 ? ` ×${q}` : ''), 280, y + rowH / 2 + 2, { size: 34, weight: 700, align: 'left' });
        P.text(`${ITEMS[id].price}花币${q > 1 ? ' × ' + q : ''}`, 780, y + rowH / 2 + 2, { size: 30, align: 'right', color: C.sub });
      });
      P.text('合计', 180, 845, { size: 40, weight: 700, align: 'left' });
      P.rect(600, 805, 180, 80, 20, 'rgba(227,239,220,0.7)', C.green, 3);
      P.text(cartPay.tries >= 2 ? String(cartTotal()) : '?', 690, 847, { size: 44, weight: 700, color: C.greenDark });
      P.glass(880, 200, 920, 700, 50);
      P.text('我的花币', 930, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      P.text('点硬币放到托盘上', 930, 295, { size: 28, color: C.sub, align: 'left' });
      [10, 5, 1].forEach((v, i) => {
        const cx = 1060 + i * 280, cy = 420, hov = P.hover === 'c' + v;
        P.circle(cx, cy, hov ? 82 : 76, C.gold, C.goldDark, 6);
        P.text(String(v), cx, cy + 4, { size: 56, weight: 700, color: '#5a4310' });
        P.hit('c' + v, cx - 85, cy - 85, 170, 170, () => { cartPay.tray.push(v); cartPay.msg = ''; main.refresh(); }, { voice: [] });
      });
      P.text('付款托盘', 930, 560, { size: 34, weight: 700, align: 'left' });
      P.text('放错的硬币点一下就能拿掉', 1110, 562, { size: 24, color: C.sub, align: 'left' });
      P.button('undo', 1530, 530, 230, 56, '拿掉一个', () => { cartPay.tray.pop(); cartPay.msg = ''; main.refresh(); }, { size: 26, disabled: !cartPay.tray.length, voice: ['拿掉', '拿掉一个'] });
      P.rect(920, 590, 840, 200, 36, 'rgba(255,255,255,0.58)');
      cartPay.tray.slice(0, 14).forEach((v, i) => {
        const cx = 980 + (i % 7) * 78, cy = 640 + Math.floor(i / 7) * 90, hov = P.hover === 'tray' + i;
        P.circle(cx, cy, hov ? 40 : 36, C.gold, hov ? C.danger : C.goldDark, hov ? 5 : 4); P.text(String(v), cx, cy + 2, { size: 30, weight: 700, color: '#5a4310' });
        if (hov) { P.circle(cx + 28, cy - 28, 14, C.danger); P.text('×', cx + 28, cy - 29, { size: 22, weight: 700, color: '#fff' }); }
        P.hit('tray' + i, cx - 38, cy - 38, 76, 76, () => { cartPay.tray.splice(i, 1); cartPay.msg = ''; main.refresh(); }, { voice: [] });
      });
      const sum = cartPay.tray.reduce((a, b) => a + b, 0);
      P.text(`放上的花币 ${sum}`, 1730, 750, { size: 36, weight: 700, color: C.green, align: 'right' });
      if (cartPay.msg) P.text(cartPay.msg, 1340, 850, { size: 30, weight: 600, color: C.danger, maxW: 820 });
      P.button('reset', 420, 930, 500, 95, '重新开始', () => { cartPay.tray = []; cartPay.msg = ''; main.refresh(); }, { voice: ['从头', '再'] });
      P.button('pay', 960, 930, 540, 95, '结算', () => {
        const total = cartTotal();
        if (sum !== total) {
          cartPay.tries++;
          cartPay.msg = (sum > total ? '放多了，再数一数吧？' : '还差一点，再把价格加一加吧？') + (cartPay.tries >= 2 ? ` 合计是${total}个花币。` : '');
          E.say(cartPay.msg); main.refresh(); return;
        }
        if (S.coins < total) { cartPay.msg = `花币还差${total - S.coins}个，拿掉一些东西吧？`; main.refresh(); return; }
        S.coins -= total; Object.entries(cart).forEach(([id, q]) => addInv(id, q));
        log('buy', { items: { ...cart }, total, tries: cartPay.tries }); E.save(); E.refreshWatch();
        const bought = Object.entries(cart); cart = {};
        open(Q => {
          exitBtn(Q, () => closeAll('离开了记忆花店'));
          Q.glass(460, 120, 1000, 820, 60);
          Q.circle(W / 2, 270, 90, C.green); drawGlyph(Q.ctx, 'check', W / 2, 270, 110);
          Q.text('算对了！', W / 2, 420, { size: 56, weight: 700 });
          Q.text(`付了${total}个花币 · 已放进保管箱`, W / 2, 485, { size: 32, color: C.sub });
          bought.slice(0, 6).forEach(([id, q], k) => { const cx = W / 2 + (k - (Math.min(6, bought.length) - 1) / 2) * 150; shopIcon(Q, id, cx, 590, 100); Q.text(`×${q}`, cx, 665, { size: 30, weight: 700 }); });
          Q.button('more', 560, 760, 390, 100, '再买一些', () => shopBuy(), { voice: ['更多'] });
          Q.button('home', 970, 760, 390, 100, '回花园', () => closeAll('回到花园了'), { kind: 'primary', voice: ['花园'] });
        }, placeOf('shop'), 'cartDone');
        qev('buy');
        E.say('算对了！');
      }, { kind: 'primary', disabled: !sum, voice: ['结算'] });
    }, placeOf('shop'), 'cartPay');
    E.say('把价格全部加起来，付花币吧');
  }
  function shopInstr() {
    open(P => {
      P.glass(260, 140, 1400, 800, 60);
      P.text('记忆花店', W / 2, 230, { size: 64, weight: 700 });
      const st = ['查看购物清单', '记住要买的东西', '挑选物品并结算'];
      st.forEach((s, i) => {
        const x = 330 + i * 430, y = 300;
        P.rect(x, y, 400, 300, 40, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3);
        P.circle(x + 40, y + 40, 24, C.green); P.text(String(i + 1), x + 40, y + 42, { size: 30, weight: 700, color: '#fff' });
        if (i === 0) { P.rect(x + 90, y + 60, 220, 180, 24, '#fff'); P.icon('pot', x + 150, y + 110, 70); P.icon('seeds', x + 250, y + 110, 70); P.rect(x + 120, y + 175, 160, 14, 7, '#ddd'); P.rect(x + 120, y + 205, 110, 14, 7, '#ddd'); }
        if (i === 1) { P.circle(x + 200, y + 150, 90, '#eef4e8'); P.text('?', x + 200, y + 156, { size: 110, weight: 700, color: C.green }); }
        if (i === 2) { ['hose', 'pot', 'gloves'].forEach((ic, k) => { P.rect(x + 40 + k * 110, y + 100, 100, 100, 20, '#fff', k === 1 ? C.green : '#e6e6e0', k === 1 ? 6 : 2); P.icon(ic, x + 90 + k * 110, y + 150, 80); }); }
        P.text(s, x + 200, y + 360, { size: 34, weight: 600 });
      });
      P.text('进了花店就看不到清单了。买错了东西也会留在保管箱里。', W / 2, 740, { size: 30, color: C.sub });
      P.button('ok', 660, 800, 600, 100, '确认', () => shopList(shopSel), { kind: 'primary', voice: ['确认', '开始'] });
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
      exitBtn(P, () => { shop = null; closeAll('记忆花店结束了'); });
      P.glass(560, 40, 800, 120, 60);
      P.text('记住要买的东西', W / 2, 101, { size: 50, weight: 700 });
      const n = shop.list.length, rowH = n > 3 ? 104 : 130;
      const ph = 120 + n * (rowH + 16);
      P.glass(560, 200, 800, ph, 50);
      P.text('购物清单', W / 2, 250, { size: 34, weight: 700, color: C.green });
      shop.list.forEach((l, i) => {
        const y = 290 + i * (rowH + 16);
        P.rect(610, y, 700, rowH, 28, 'rgba(255,255,255,0.58)');
        shopIcon(P, l.id, 700, y + rowH / 2, rowH * 0.72);
        P.text(ITEMS[l.id].name + (l.qty > 1 ? `  ${l.qty}个` : ''), 790, y + rowH / 2 + 2, { size: 44, weight: 700, align: 'left' });
      });
      const left = Math.max(0, 1 - (performance.now() - t0) / total);
      P.rect(660, 230 + ph, 600, 14, 7, 'rgba(255,255,255,0.5)');
      P.rect(660, 230 + ph, 600 * left, 14, 7, C.green);
      P.button('done', 660, 270 + ph, 600, 100, '都记住了', () => shopPick(), { kind: 'primary', voice: ['都记住', '我记住了', '做好了'] });
    }, placeOf('shop'), 'shopList');
    E.say('购物清单。' + shop.list.map(l => ITEMS[l.id].name + (l.qty > 1 ? ` ${l.qty}个` : '')).join(', '));
    const timer = setInterval(() => {
      if (!shop || current !== 'shopList') { clearInterval(timer); return; }
      main.refresh();
      if (performance.now() - t0 > total) { clearInterval(timer); shopPick(); }
    }, 250);
  }
  function shopPick() {
    open(P => {
      exitBtn(P, () => { shop = null; closeAll('记忆花店结束了'); });
      P.glass(470, 40, 980, 120, 60);
      P.text('请选清单上的东西', W / 2, 101, { size: 48, weight: 700 });
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
      P.text(`${shop.list.length}个中选了${m}个`, 680, 986, { size: 38, weight: 700 });
      P.button('pay', 920, 940, 530, 90, '结算', () => shopPay(), { kind: 'primary', disabled: m === 0, voice: ['结算'] });
      if (shop.level === 3) P.text('需要好几个的话就多按几次', W / 2, 300 - 12, { size: 26, color: '#555' });
    }, placeOf('shop'), 'shopPick');
    E.say('请选清单上的东西');
  }
  const shopTotal = () => Object.entries(shop.picked).reduce((a, [id, q]) => a + ITEMS[id].price * q, 0);
  function shopPay() {
    shop.tray = []; shop.msg = '';
    open(P => {
      exitBtn(P, () => { shop = null; closeAll('记忆花店结束了'); });
      P.glass(400, 40, 1120, 120, 60);
      P.text('把价格全部加起来，付花币吧', W / 2, 101, { size: 46, weight: 700 });
      // 고른 물건
      const ent = Object.entries(shop.picked);
      P.glass(120, 200, 720, 700, 50);
      P.text('选好的东西', 170, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      const rowH = ent.length > 4 ? 80 : 100;
      ent.forEach(([id, q], i) => {
        const y = 290 + i * (rowH + 12);
        P.rect(160, y, 640, rowH, 24, 'rgba(255,255,255,0.58)');
        shopIcon(P, id, 220, y + rowH / 2, rowH * 0.7);
        P.text(ITEMS[id].name + (q > 1 ? ` ×${q}` : ''), 280, y + rowH / 2 + 2, { size: 36, weight: 700, align: 'left' });
        P.text(`${ITEMS[id].price * q}花币`, 780, y + rowH / 2 + 2, { size: 34, align: 'right', color: C.sub });
      });
      P.rect(160, 790, 640, 3, 1, 'rgba(0,0,0,0.12)');
      P.text('合计', 180, 845, { size: 40, weight: 700, align: 'left' });
      P.rect(600, 805, 180, 80, 20, 'rgba(227,239,220,0.7)', C.green, 3);
      P.text(shop.tries >= 2 ? String(shopTotal()) : '?', 690, 847, { size: 44, weight: 700, color: C.greenDark });
      // 코인
      P.glass(880, 200, 920, 700, 50);
      P.text('我的花币', 930, 250, { size: 34, weight: 700, color: C.green, align: 'left' });
      P.text('点硬币放到托盘上', 930, 295, { size: 28, color: C.sub, align: 'left' });
      [10, 5, 1].forEach((v, i) => {
        const cx = 1060 + i * 280, cy = 420, hov = P.hover === 'c' + v;
        P.circle(cx, cy, hov ? 82 : 76, C.gold, C.goldDark, 6);
        P.text(String(v), cx, cy + 4, { size: 56, weight: 700, color: '#5a4310' });
        P.hit('c' + v, cx - 85, cy - 85, 170, 170, () => { shop.tray.push(v); shop.msg = ''; main.refresh(); }, { voice: [] });
      });
      P.text('付款托盘', 930, 560, { size: 34, weight: 700, align: 'left' });
      P.text('放错的硬币点一下就能拿掉', 1110, 562, { size: 24, color: C.sub, align: 'left' });
      P.button('undo', 1530, 530, 230, 56, '拿掉一个', () => { shop.tray.pop(); shop.msg = ''; main.refresh(); }, { size: 26, disabled: !shop.tray.length, voice: ['拿掉', '拿掉一个'] });
      P.rect(920, 590, 840, 200, 36, 'rgba(255,255,255,0.58)');
      shop.tray.slice(0, 14).forEach((v, i) => {
        const cx = 980 + (i % 7) * 78, cy = 640 + Math.floor(i / 7) * 90, hov = P.hover === 'tray' + i;
        P.circle(cx, cy, hov ? 40 : 36, C.gold, hov ? C.danger : C.goldDark, hov ? 5 : 4); P.text(String(v), cx, cy + 2, { size: 30, weight: 700, color: '#5a4310' });
        if (hov) { P.circle(cx + 28, cy - 28, 14, C.danger); P.text('×', cx + 28, cy - 29, { size: 22, weight: 700, color: '#fff' }); }
        P.hit('tray' + i, cx - 38, cy - 38, 76, 76, () => { shop.tray.splice(i, 1); shop.msg = ''; main.refresh(); }, { voice: [] });
      });
      const sum = shop.tray.reduce((a, b) => a + b, 0);
      P.text(`放上的花币 ${sum}`, 1730, 750, { size: 36, weight: 700, color: C.green, align: 'right' });
      if (shop.msg) P.text(shop.msg, 1340, 850, { size: 30, weight: 600, color: C.danger, maxW: 820 });
      P.button('reset', 420, 930, 500, 95, '重新开始', () => { shop.tray = []; shop.msg = ''; main.refresh(); }, { voice: ['从头', '再'] });
      P.button('pay', 960, 930, 540, 95, '结算', () => {
        const total = shopTotal();
        if (sum === total) shopResult(total);
        else {
          shop.tries++;
          shop.msg = (sum > total ? '放多了，再数一数吧？' : '还差一点，再把价格加一加吧？') + (shop.tries >= 2 ? ` 合计是${total}个花币。` : '');
          E.say(shop.msg); main.refresh();
        }
      }, { kind: 'primary', disabled: !sum, voice: ['结算'] });
      P.hint('试着说“结算”', 1040, 520);
    }, placeOf('shop'), 'shopPay');
    E.say('把价格全部加起来，付花币吧');
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
      P.text(allOk ? '全部买对了！' : `清单上${listLen}个里买对了${okN}个`, W / 2, 420, { size: 60, weight: 700 });
      if (!allOk && missing.length) P.text(`下次也带上${missing.join('、')}吧`, W / 2, 490, { size: 32, color: C.sub });
      P.rect(W / 2 - 200, 530, 400, 80, 40, '#eef4e8');
      drawGlyph(P.ctx, 'coin', W / 2 - 140, 570, 40);
      P.text(`用了${total}个花币`, W / 2 + 20, 572, { size: 36, weight: 700, color: C.greenDark });
      P.text('付款完成了。买的东西已经放进保管箱。', W / 2, 660, { size: 30, color: C.sub });
      P.button('again', 660, 730, 600, 95, '再来一次', () => { shopSel = Math.min(S.shopLevel, allOk && lv < 3 ? lv + 1 : lv); shopList(shopSel); }, { kind: 'primary', voice: ['再'] });
      P.button('home', 660, 845, 600, 95, '回到花园', () => closeAll('回到花园了'), { voice: ['回花园', '返回'] });
    }, placeOf('shop'), 'shopResult');
    E.say(allOk ? '全部买对了！' : `清单上${shop.list.length}个里买对了${okN}个`);
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
    water: { name: '水', item: 'watering_can', bg: '#5a9bd8', glyph: 'water' },
    fert:  { name: '肥料', item: 'fertilizer', bg: '#e9a23b', icon: 'fertilizer', use: true },
    pest:  { name: '除虫', item: 'pesticide', bg: '#e9a23b', glyph: 'bug', use: true },
    prune: { name: '修剪', item: 'pruners', bg: '#e9a23b', icon: 'pruners' },
    weed:  { name: '除草', item: 'hand_fork', bg: '#e9a23b', icon: 'hand_fork' },
    soil:  { name: '松土', item: 'hoe', bg: '#e9a23b', icon: 'hoe' },
    sun:   { name: '阳光', item: null, bg: '#f2c14e', glyph: 'sun' }
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
    if (n >= SLOT_MAX) { E.toast('现在能开的坑位都开完了'); return; }
    const COST = unlockCost(n), okC = S.coins >= COST, okT = digTools() >= UNLOCK_TOOLS;
    open(P => {
      P.glass(460, 150, 1000, 780, 60);
      P.roundBtn('x', 1400, 210, 40, 'close', () => closePopup(), ['关闭', '取消']);
      P.text('要开新的坑位吗？', W / 2, 240, { size: 56, weight: 700 });
      P.text(`现在有${n}个坑位 · 可以开第${n + 1}个`, W / 2, 310, { size: 32, color: C.sub });
      const row = (y, draw, label, have, ok) => {
        P.rect(560, y, 800, 130, 36, 'rgba(255,255,255,0.45)', ok ? 'rgba(255,255,255,0.95)' : C.danger, ok ? 3 : 4);
        draw(640, y + 65);
        P.text(label, 720, y + 50, { size: 38, weight: 700, align: 'left' });
        P.text(have, 720, y + 95, { size: 28, color: ok ? C.sub : C.danger, align: 'left' });
        if (ok) { P.circle(1290, y + 65, 30, C.green); drawGlyph(P.ctx, 'check', 1290, y + 65, 36); }
      };
      row(370, (x, y) => drawGlyph(P.ctx, 'coin', x, y, 64), `花币${COST}个`, `我的花币：${S.coins}个`, okC);
      row(520, (x, y) => P.icon('hoe', x, y, 90), `翻土工具${UNLOCK_TOOLS}个`, `锄头或手耙 · 我的工具：${digTools()}个`, okT);
      P.text(okC && okT ? '打开后会用掉花币和工具' : !okT ? '工具可以在记忆花店买到' : '做训练可以攒花币', W / 2, 700, { size: 30, color: okC && okT ? C.sub : C.danger });
      P.button('no', 560, 770, 390, 100, '取消', () => closePopup(), { voice: ['取消'] });
      P.button('yes', 970, 770, 390, 100, '开新坑位', () => {
        S.coins -= COST;
        let need = UNLOCK_TOOLS;
        for (const id of ['hoe', 'hand_fork']) { const k = Math.min(need, inv(id)); addInv(id, -k); need -= k; }
        S.slots.push(null);
        log('garden', { act: 'unlock', n: S.slots.length });
        E.save(); E.refreshWatch(); refreshSlots(); updateSlot(S.slots.length - 1);
        closePopup(); E.toast(`多了一个新坑位！现在有${S.slots.length}个了`);
      }, { kind: 'primary', disabled: !(okC && okT), voice: ['开', '开新坑位'] });
    }, gardenPlace(), 'garden-unlock');
    E.say('要开新的坑位吗？');
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
    if (!s) { E.toast('请先种下种子'); return; }
    if (!inv('watering_can')) { E.toast('没有洒水壶，可以在记忆花店买到'); return; }
    if (s.dormant) { s.dormant = false; E.toast(`${FLOWERS[s.type].name}又醒过来了！`); }
    else if (s.stage >= 3) { E.toast('花开得很好，水也够了'); }
    else if (s.watered) { E.toast('现在水够了，请稍等一下'); }
    else {
      s.watered = true; s.dur = stageDur(s); s.readyAt = Date.now() + s.dur * (s.fert ? 0.6 : 1);
      E.toast(`给${FLOWERS[s.type].name}浇水了`);
    }
    log('garden', { act: 'water', type: s.type }); E.save(); updateSlot(i);
  }
  function applyNeed(i, key, itemId) {
    const s = S.slots[i]; if (!s) { E.toast('请先种下种子'); return; }
    migrateSlot(s);
    const f = FLOWERS[s.type].name, nd = NEED[key];
    if (key === 'water' && s.dormant) { s.dormant = false; E.toast(`${f}又醒过来了！`); E.save(); updateSlot(i); return; }
    if (s.stage >= 3) { E.toast(`${f}已经开好了，点花把它剪下来吧`); return; }
    if (!s.needs[key]) { E.toast(`现在${f}不需要${itemId ? ITEMS[itemId].name : nd.name}，看看亮起的提示吧`); return; }
    if (nd.use && !inv(nd.item)) { E.toast(`没有${ITEMS[nd.item].name}，可以在记忆花店买到`); return; }
    if (nd.use) addInv(nd.item, -1);
    s.needs[key]--;
    const left = s.needs[key];
    if (!left) delete s.needs[key];
    popPlus(i, left ? `+${left}` : '✓');
    const started = startGrowIfReady(s);
    E.toast(started ? `${f}开始长了！` : left ? `还需要${nd.name}${left}次` : `${nd.name}完成！也看看其他提示吧`, false);
    log('garden', { act: key, type: s.type }); E.save(); updateSlot(i);
    if (quest) { quest.did = quest.did || {}; quest.did[key] = true; setTimeout(() => qev(key), 600); }
  }
  function fertSlot(i) {
    const s = S.slots[i];
    if (!s) { E.toast('请先种下种子'); return; }
    if (!inv('fertilizer')) { E.toast('没有肥料。没有肥料花也会长'); return; }
    if (s.stage >= 3) { E.toast('花已经开了'); return; }
    if (s.fert && !s.needFert) { E.toast('已经施过肥了'); return; }
    s.fert = true; s.needFert = false; addInv('fertilizer', -1);
    if (s.watered) s.readyAt = Date.now() + remain(s) * 0.6;
    popPlus(i);
    E.toast(`${FLOWERS[s.type].name}长得更快了！`);
    log('garden', { act: 'fert', type: s.type }); E.save(); updateSlot(i);
  }
  function harvest(i) {
    const s = S.slots[i];
    if (!s || s.stage < 3) return;
    S.flowers[s.type] = (S.flowers[s.type] || 0) + 1;
    S.slots[i] = null;
    E.toast(`剪下${FLOWERS[s.type].name}放进保管箱了`);
    log('garden', { act: 'harvest', type: s.type }); E.save(); updateSlot(i);
  }
  function plantSeed(i, type) {
    if (S.slots[i]) return;
    addInv('seed_' + type, -1);
    S.slots[i] = { type, stage: 0, watered: false, readyAt: 0, fert: false, needs: genNeeds(0) };
    log('train', { game: 'garden', act: 'plant', type, rec: S.rec === 'garden' });
    if (quest) { S.slots[i].needs = { water: 1, fert: 1, sun: 1 }; quest.slot = i; E.save(); updateSlot(i); setTimeout(() => qev('plant'), 1200); }
    E.save(); updateSlot(i);
    E.toast(`种下了${FLOWERS[type].name}！看看花上亮起的提示来照顾它吧`);
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
        if (s) { E.toast('这里已经有花了，请选一个空位'); return; }
        return plantConfirm(i, ITEMS[carried.id].flower);
      }
    }
    if (!s) chooseFlower(i); else plantInfo(i);
  }
  const gardenPlace = () => zoneOf('garden');
  function gardenWelcome() {
    E.toast('点发光的圆圈来种花吧');
  }
  function chooseFlower(i, page = 0) {
    open(P => {
      P.glass(460, 180, 1000, 700, 60);
      P.text('要种什么花？', W / 2, 260, { size: 54, weight: 700 });
      P.roundBtn('x', 1400, 240, 40, 'close', () => closePopup(), ['关闭', '取消']);
      Object.keys(FLOWERS).forEach((t, k) => {
        const x = 520 + k * 300, y = 330, n = inv('seed_' + t), hov = P.hover === t;
        P.rect(x, y, 280, 330, 36, n ? (hov ? '#fff' : 'rgba(255,255,255,0.58)') : 'rgba(240,240,235,0.7)', hov && n ? C.green : 'rgba(255,255,255,0.95)', hov && n ? 7 : 3);
        P.icon(FLOWERS[t].icon, x + 140, y + 130, 160);
        P.text(FLOWERS[t].name, x + 140, y + 250, { size: 42, weight: 700, color: n ? C.ink : '#aaa' });
        P.text(`${n}个`, x + 140, y + 300, { size: 30, color: C.sub });
        P.hit(t, x, y, 280, 330, () => plantConfirm(i, t), { disabled: !n, voice: [FLOWERS[t].name] });
      });
      const none = !Object.keys(FLOWERS).some(t => inv('seed_' + t));
      P.text(none ? '没有种子。可以在记忆花店买种子。' : '请点想种的花', W / 2, 730, { size: 34, color: none ? C.danger : C.sub });
      P.button('inv', 660, 780, 600, 80, '查看保管箱', () => inventory(), { voice: ['保管箱'] });
    }, gardenPlace(), 'garden-choose');
    E.say('要种什么花？');
  }
  function plantConfirm(i, t) {
    if (!inv('seed_' + t)) { E.toast(`没有${FLOWERS[t].name}种子`); return; }
    open(P => {
      P.glass(560, 260, 800, 520, 60);
      P.icon(FLOWERS[t].icon, W / 2, 370, 150);
      P.text(`要种${FLOWERS[t].name}吗？`, W / 2, 500, { size: 56, weight: 700 });
      P.text(`用1颗${FLOWERS[t].name}种子`, W / 2, 570, { size: 32, color: C.sub });
      P.button('no', 620, 640, 330, 100, '取消', () => closePopup(), { voice: ['取消'] });
      P.button('yes', 970, 640, 330, 100, '种', () => plantSeed(i, t), { kind: 'primary', voice: ['种', '种下'] });
      P.hint('试着说“种”', 820, 520);
    }, gardenPlace(), 'garden-confirm');
    E.say(`要种${FLOWERS[t].name}吗？`);
  }
  function plantInfo(i) {
    const s = S.slots[i], f = FLOWERS[s.type];
    migrateSlot(s);
    const nk = Object.keys(s.needs || {});
    const stTxt = s.dormant ? '正在休息，浇水后会醒来' : s.stage >= 3 ? '花开了！' : nk.length ? '需要：' + nk.map(k => NEED[k].name + (s.needs[k] > 1 ? ` ×${s.needs[k]}` : '')).join(' · ') : `正在长 · 离下一阶段还有${fmt(remain(s))}`;
    open(P => {
      P.glass(460, 160, 1000, 760, 60);
      P.roundBtn('x', 1400, 220, 40, 'close', () => closePopup(), ['关闭']);
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
      if (s.needs && s.needs.sun) btns.push(['sun', '晒太阳', () => { applyNeed(i, 'sun'); plantInfo(i); }, true, ['阳光']]);
      if (s.stage < 3 && nk.some(k => k !== 'sun')) btns.push(['inv', '打开保管箱', () => inventory(), true, ['保管箱']]);
      if (s.stage >= 3) btns.push(['cut', '剪花', () => harvest(i) || closePopup(), true, ['剪', '剪花']]);
      btns.push(['close', '关闭', () => closePopup(), true, ['关闭']]);
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
    if (s < 60) return `${s}秒`;
    if (s < 3600) return `${Math.ceil(s / 60)}分钟`;
    return `${Math.round(s / 3600)}小时`;
  }

  // 보관함
  let invTab = 0;
  function invClose() { }
  function inventory() {
    const tabs = ['种子', '种植用品', '园艺工具', '花 · 花篮'];
    open(P => {
      P.glass(260, 120, 1400, 820, 60);
      P.text('保管箱', 330, 200, { size: 54, weight: 700, align: 'left' });
      P.roundBtn('x', 1580, 200, 44, 'close', () => { main.show(false); current = null; }, ['关闭']);
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
        P.text(`${it.n}${it.flower ? '朵' : '个'}`, x + 150, y + 222, { size: 26, color: C.sub });
        if (usable) P.hit('i' + k, x, y, 300, 240, () => {
          main.show(false); current = null;
          E.carry({ id: it.id, icon: ITEMS[it.id].icon, drag: true });
          const need = ITEM_NEED[it.id] ? S.slots.findIndex(q => q && q.needs && q.needs[ITEM_NEED[it.id]]) : -1;
          const who = need >= 0 ? FLOWERS[S.slots[need].type].name : '花';
          const msg = ITEMS[it.id].kind === 'seed' ? '按住拖到空圆圈上再松开' : `按住，把${ITEMS[it.id].name}放到${who}上`;
          E.toast(msg, true, 8000);
        }, { voice: [it.id ? ITEMS[it.id].name : ''], drag: true, item: it.id });
      });
      if (!list.length) P.text('还是空的', W / 2, 560, { size: 38, color: C.sub });
      P.text('按住想用的东西，拖到花上', W / 2, 900, { size: 30, color: C.sub });
    }, activeZone === 'garden' ? gardenPlace() : 'front', 'garden-inv');
  }
  // 화단 앞 보관함 버튼
  const gardenBar = new Panel(1000, 260, 1.1, { renderOrder: 60 });
  E.addPanel(gardenBar);
  E.placeAt(gardenBar, B(40.1, -6.95, 0.62), B(40.1, -7.8, 1.2));
  gardenBar.mesh.rotation.x = 0;
  gardenBar.setView(P => {
    P.button('inv', 300, 20, 400, 110, '保管箱', () => { activeZone = 'garden'; inventory(); }, { size: 44, voice: ['保管箱'], dx: 30 });
    P.icon('storage', 400, 75, 86);
    P.rect(200, 160, 600, 70, 35, 'rgba(255,255,255,0.58)');
    P.text('点发光的圆圈来种花吧', 500, 196, { size: 28, color: '#555' });
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
        if (s.stage === 3) E.toast(`${FLOWERS[s.type].name}开花了！`);
        else E.toast(`${FLOWERS[s.type].name}${s.stage === 1 ? '发芽了' : '长出花苞了'}。看看亮起的提示来照顾它吧`, false);
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
    { k: '朴', name: '朴奶奶', color: '#f3d0c6', pos: [45.8, -3.3, 1.35] },
    { k: '崔', name: '崔爷爷', color: '#d6ead0', pos: [46.6, -2.3, 1.45] },
    { k: '李', name: '李奶奶', color: '#f5e6b8', pos: [48.1, -2.7, 1.4] }
  ];
  const LINES = {
    '我喜欢的花': [
      ['朴', '我看到郁金香就会想起春游的那天。'],
      ['崔', '我喜欢向日葵，老家院子里开了好多。'],
      ['李', '雏菊虽然小，但真好看，是我孙女喜欢的花。']
    ],
    '我的老家': [
      ['李', '我的老家是海边的村子，现在还记得海风的味道。'],
      ['朴', '我在山脚下的小村子长大。'],
      ['崔', '好想念老家集市上吃的面条啊。']
    ]
  };
  const REPLIES = ['真是好故事！', '原来是这样，我还想多听听。', '我也有那样的回忆。', '谢谢你的分享。'];
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
    open(P => {
      exitBtn(P);
      P.glass(460, 70, 1000, 900, 60);
      P.text('花园茶话会', W / 2, 150, { size: 64, weight: 700 });
      S.parties.slice(0, 3).forEach((p, k) => {
        const y = 220 + k * 210, hl = k === 0;
        P.rect(510, y, 900, 190, 36, hl ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3);
        P.text(p.when, 550, y + 50, { size: hl ? 46 : 38, weight: 700, align: 'left' });
        P.text(`主题：${p.topic}`, 550, y + 105, { size: 32, align: 'left' });
        p.friends.forEach((f, j) => { const n = NPCS.find(x => x.k === f) || { color: '#e3d9f2' }; P.circle(570 + j * 50, y + 155, 24, n.color, '#fff', 3); P.text(f, 570 + j * 50, y + 157, { size: 24, weight: 700 }); });
        P.text(`${p.friends.map(f => (NPCS.find(x => x.k === f) || { name: f }).name).join('、')}${p.live ? '在等你' : '已受邀'}`, 570 + p.friends.length * 50, y + 157, { size: 26, color: C.sub, align: 'left' });
        P.button('join' + k, 1170, y + 60, 210, 80, '参加', () => p.live ? teaChat(p) : E.toast('还没开始，到时间会通知你'), { kind: p.live ? 'primary' : 'secondary', size: 34, voice: k === 0 ? ['参加'] : [] });
      });
      P.button('host', 510, 860, 900, 90, '开茶话会', () => teaHost(), { size: 40, voice: ['开茶话会', '开'] });
      P.hint('试着说“参加”', 990, 520);
    }, zoneOf('tea'), 'teaEntry');
    if (toastMsg) E.toast(toastMsg); else E.say('花园茶话会。点“参加”试试看。');
  }
  let host = { time: 0, topic: 0, friends: { '朴': true, '崔': true, '李': false, '女儿': true } };
  const TOPICS = [['我喜欢的花', 'anemone'], ['童年的回忆', 'daisy'], ['四季', 'sunflower'], ['以前住过的地方', 'iris'], ['难忘的旅行', 'poppy']];
  function teaHost() {
    const times = ['今天下午3点', '今天下午7点', '明天上午10点', '换个时间'];
    open(P => {
      P.glass(100, 100, 1720, 880, 60);
      P.roundBtn('back', 190, 190, 44, 'exit', () => teaEntry(), ['后退', '离开']);
      P.text('开茶话会', 260, 180, { size: 54, weight: 700, align: 'left' });
      P.text('只要选时间、主题和朋友就可以了', 262, 238, { size: 30, color: C.sub, align: 'left' });
      const col = (x, t) => { P.rect(x, 290, 520, 560, 36, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.95)', 3); P.text(t, x + 40, 335, { size: 34, weight: 700, align: 'left' }); };
      col(160, '1  选择时间'); col(700, '2  选择主题'); col(1240, '3  选择朋友');
      times.forEach((t, k) => P.button('t' + k, 200, 390 + k * 110, 440, 86, t, () => { host.time = k; main.refresh(); }, { kind: host.time === k ? 'chipOn' : 'secondary', size: 32 }));
      P.rect(740, 390, 440, 300, 30, 'rgba(255,255,255,0.58)');
      P.circle(960, 510, 100, '#eef4e8'); P.icon(TOPICS[host.topic][1], 960, 510, 150);
      P.text(TOPICS[host.topic][0], 960, 730, { size: 38, weight: 700 });
      P.button('nt', 740, 770, 440, 70, '看看别的主题', () => { host.topic = (host.topic + 1) % TOPICS.length; main.refresh(); }, { size: 30, voice: ['别的主题'] });
      ['朴', '崔', '李', '女儿'].forEach((f, k) => {
        const y = 390 + k * 110, n = NPCS.find(x => x.k === f) || { name: '女儿', color: '#e3d9f2' };
        P.circle(1310, y + 43, 34, n.color); P.text(f, 1310, y + 45, { size: 32, weight: 700 });
        P.text(n.name, 1370, y + 45, { size: 34, align: 'left' });
        const on = host.friends[f];
        P.circle(1680, y + 43, 30, on ? C.green : '#f0f0ec', on ? null : '#ccc', 3); if (on) drawGlyph(P.ctx, 'check', 1680, y + 43, 34);
        P.hit('f' + f, 1280, y, 440, 86, () => { host.friends[f] = !host.friends[f]; main.refresh(); }, { voice: [n.name] });
      });
      const any = Object.values(host.friends).some(Boolean);
      P.button('send', 660, 870, 600, 90, '发送邀请', () => {
        const fr = Object.keys(host.friends).filter(k => host.friends[k]);
        S.parties.splice(1, 0, { when: times[host.time], topic: TOPICS[host.topic][0], icon: TOPICS[host.topic][1], friends: fr.filter(f => f !== '女儿'), live: false });
        S.parties = S.parties.slice(0, 3);
        log('social', { act: 'host', topic: TOPICS[host.topic][0] }); E.save();
        teaEntry('已发送邀请');
      }, { kind: 'primary', disabled: !any, voice: ['发送邀请', '寄出'] });
    }, zoneOf('tea'), 'teaHost');
  }
  function teaChat(p) {
    const lines = LINES[p.topic] || LINES['我喜欢的花'];
    tea = { p, lines, idx: 0, next: performance.now() + 2500, speaker: null, sub: '', start: Date.now(), myTurns: 0, waiting: false, muted: false };
    avatars.forEach(a => { a.b.sprite.visible = true; paintAvatar(a, false); });
    log('social', { act: 'join', topic: p.topic });
    const draw = () => open(P => {
      P.glass(560, 30, 800, 110, 55);
      P.text(`主题：${p.topic}`, W / 2, 86, { size: 44, weight: 700 });
      exitBtn(P, () => teaEnd());
      P.glass(660, 190, 600, 470, 50);
      P.circle(W / 2, 360, 130, '#eef4e8'); P.icon(p.icon || 'tulip', W / 2, 360, 200);
      P.text('看到这朵花，你会想起什么？', W / 2, 580, { size: 36, weight: 600 });
      const muted = tea && tea.muted;
      const st = muted ? '麦克风已关闭' : E.userTalking ? '我正在说话' : tea && tea.speaker ? `${tea.speaker}正在说话` : '随时都可以自由说话';
      P.glass(460, 700, 1000, 100, 50);
      P.text(st, W / 2, 752, { size: 38, weight: 600 });
      if (E.listening && !muted) { // 내 목소리 크기
        const lv = Math.min(1, (E.voiceLevel || 0) * 9);
        for (let k = 0; k < 7; k++) { const h = 16 + 50 * Math.max(0.1, lv * (0.6 + 0.4 * Math.sin(k * 1.7 + performance.now() / 120))); P.rect(1300 + k * 20, 752 - h / 2, 12, h, 6, C.green); }
      }
      if (tea && tea.sub) { P.rect(260, 815, 1400, 90, 45, 'rgba(255,255,255,0.58)'); P.text(tea.sub, W / 2, 861, { size: 34, color: '#333', maxW: 1340 }); }
      // 회의처럼: 마이크는 계속 켜져 있고, 음소거와 끝내기만 있어요
      P.button('mute', 560, 925, 380, 100, muted ? '打开麦克风' : '关闭麦克风', () => { tea.muted = !tea.muted; E.openMic(!tea.muted); E.toast(tea.muted ? '已关闭麦克风' : '已打开麦克风', false); tea.redraw(); }, { size: 36, voice: [], dx: 24 });
      drawGlyph(P.ctx, muted ? 'micOff' : 'micOn', 625, 975, 46);
      P.button('end', 980, 925, 380, 100, '结束', () => teaEnd(), { kind: 'primary', size: 38, voice: ['结束', '停'] });
      P.button('fam', 1400, 935, 260, 80, '邀请家人', () => teaInvite(), { size: 30, voice: ['邀请家人', '家人'] });
    }, zoneOf('tea'), 'teaChat');
    tea.redraw = draw;
    E.openMic(true);
    draw();
    E.say('欢迎来到茶话会。麦克风已打开，请随意聊天。');
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
    tea.sub = text ? `我：${text}` : '我：（讲了一段故事）'; tea.myTurns++;
    const who = NPCS[rnd(NPCS.length)].k;
    tea.reply = [who, REPLIES[rnd(REPLIES.length)]];
    tea.next = performance.now() + 1500;
    log('social', { act: 'talk', len: (text || '').length });
    tea.redraw();
  };
  E.onVoiceStart = () => { if (tea && current === 'teaChat') { avatars.forEach(a => paintAvatar(a, false)); tea.speaker = null; tea.redraw(); } };
  E.onVoiceInterim = t => { if (tea && current === 'teaChat' && t && !tea.muted) { tea.sub = `我：${t}`; tea.redraw(); } };
  let teaLvT = 0;
  E.onVoiceEnd = (text, spoke) => {
    if (tea && current === 'teaChat') {
      if (text || spoke) {
        tea.sub = text ? `我：${text}` : '我：（讲了一段故事）'; tea.myTurns++;
        const who = NPCS[rnd(NPCS.length)].k;
        tea.reply = [who, REPLIES[rnd(REPLIES.length)]];
        tea.next = performance.now() + 1800;
        log('social', { act: 'talk', len: (text || '').length });
      }
      tea.redraw(); return;
    }
    if (!text) { if (spoke) E.toast('没有听清楚，请慢慢说出屏幕上的字'); return; }
    const panels = [main, gardenBar, ...tiles].filter(p => p.visible);
    if (E.matchVoice(text, panels)) return;
    const t = text.replace(/\s/g, '');
    const cmds = [
      [['菜单', '最初'], () => mainMenu()], [['照料花园', '种花'], () => guideTo('garden')], [['训练'], () => trainingArea()],
      [['闪光', '找花'], () => guideTo('flash')], [['花店'], () => guideTo('shop')], [['茶话会', '聚会'], () => guideTo('tea')],
      [['市场', '卖'], () => guideTo('market')], [['设置'], () => settings()], [['信箱', '信', '心愿'], () => guideTo('mail')], [['保管箱'], () => inventory()]
    ];
    for (const [ks, fn] of cmds) if (ks.some(k => t.includes(k))) { fn(); return; }
    E.toast(`听到的是“${text}”。请说出屏幕上的字`);
  };
  function teaInvite() {
    E.openMic(false);
    open(P => {
      P.glass(460, 120, 1000, 820, 60);
      backBtn(P, () => teaChat(tea ? tea.p : S.parties[0]));
      P.text('邀请家人一起来吧', W / 2, 220, { size: 60, weight: 700 });
      P.text('会给家人发送邀请通知', W / 2, 295, { size: 34, color: C.sub });
      [['女儿', '#e3d9f2'], ['儿子', '#d6ead0']].forEach(([f, col], k) => {
        const y = 360 + k * 210;
        P.rect(510, y, 900, 180, 36, 'rgba(255,255,255,0.58)');
        P.circle(610, y + 90, 64, col, '#fff', 4); P.text(f, 610, y + 93, { size: f.length > 1 ? 40 : 50, weight: 700 });
        P.text(f, 710, y + 92, { size: 44, weight: 600, align: 'left' });
        const done = S.invited[f];
        P.button('inv' + k, 1110, y + 50, 260, 84, done ? '邀请完成' : '邀请', () => { S.invited[f] = true; log('social', { act: 'invite', who: f }); E.save(); E.toast(`已给${f}发送邀请`); main.refresh(); }, { kind: done ? 'secondary' : 'primary', disabled: done, size: 34, voice: [f] });
      });
      P.button('back2', 660, 820, 600, 90, '回到茶话会', () => teaChat(tea ? tea.p : S.parties[0]), { voice: ['去茶话会', '返回'] });
    }, zoneOf('tea'), 'teaInvite');
  }
  function teaEnd() {
    setTimeout(() => qev('tea'), 300);
    const mins = tea ? Math.max(1, Math.round((Date.now() - tea.start) / 60000)) : 0;
    if (tea) log('social', { act: 'end', minutes: mins, turns: tea.myTurns });
    E.save(); teaStop();
    open(P => {
      P.glass(560, 160, 800, 760, 60);
      P.circle(W / 2, 320, 110, '#eef4e8'); P.icon('tulip', W / 2, 320, 160);
      P.text('今天的茶话会结束了', W / 2, 500, { size: 56, weight: 700 });
      P.text('谢谢你来！\n下次茶话会再见。', W / 2, 610, { size: 34, color: C.sub, maxW: 700 });
      P.button('home', 660, 760, 600, 100, '回到花园', () => closeAll('回到花园了'), { kind: 'primary', voice: ['回花园', '返回'] });
    }, zoneOf('tea'), 'teaEnd');
    E.say('今天的茶话会结束了，谢谢你来！');
  }

  // ================= 꽃 시장 =================
  function marketScreen() {
    const want = S.dailyWish, wf = FLOWERS[want.type];
    const total = sellableTotal();
    const PRICE = FLOWER_PRICE, WISH_PRICE = 25; // 아무 꽃은 15, 정해진 꽃은 25
    open(P => {
      exitBtn(P);
      P.glass(260, 60, 1400, 940, 60);
      P.text('花市场', W / 2, 140, { size: 64, weight: 700 });
      P.text('卖掉花园里种的花，换花币', W / 2, 205, { size: 32, color: C.sub });
      P.coinChip(1380, 100, S.coins);
      // 내 꽃
      P.rect(320, 250, 1280, 150, 30, 'rgba(255,255,255,0.58)');
      P.text('我的花', 360, 325, { size: 36, weight: 700, align: 'left' });
      Object.keys(FLOWERS).forEach((t, k) => { P.icon(FLOWERS[t].icon, 560 + k * 320, 325, 100); P.text(`${FLOWERS[t].name} ${S.flowers[t] || 0}朵`, 620 + k * 320, 312, { size: 34, align: 'left' }); if (wildOf(t)) P.text(`户外花园的花 ${wildOf(t)} 朵`, 620 + k * 320, 356, { size: 24, color: C.sub, align: 'left' }); });
      // 오늘의 주문 1: 아무 꽃
      P.rect(320, 430, 1280, 200, 30, 'rgba(255,255,255,0.58)');
      P.text('今天收任意花3朵', 360, 495, { size: 42, weight: 700, align: 'left' });
      P.text(`每朵${PRICE}花币 · 什么花都可以`, 360, 560, { size: 30, color: C.sub, align: 'left' });
      P.button('any', 1270, 490, 290, 90, '卖3朵', () => {
        let n = 3;
        Object.keys(FLOWERS).sort((a, b) => sellableOf(b) - sellableOf(a)).forEach(t => { const k = Math.min(n, sellableOf(t)); if (k > 0) sellFlower(t, k); n -= k; });
        S.coins += 3 * PRICE; log('market', { act: 'any', n: 3 }); E.save(); E.refreshWatch();
        E.toast(`卖了3朵花，花币 +${3 * PRICE}`); marketScreen(); if (quest) { quest.did = quest.did || {}; quest.did.sold = true; } qev('market');
      }, { kind: 'primary', disabled: total < 3, size: 36, voice: ['3朵', '任意花'] });
      // 오늘의 주문 2: 정해진 꽃
      P.rect(320, 660, 1280, 200, 30, 'rgba(255,255,255,0.58)');
      P.icon(wf.icon, 400, 760, 110);
      P.text(`今天收${wf.name}${want.n}朵`, 480, 725, { size: 42, weight: 700, align: 'left' });
      P.text(`每朵${WISH_PRICE}花币 · 在保管箱里找${wf.name}来卖`, 480, 790, { size: 30, color: C.sub, align: 'left' });
      P.button('want', 1270, 720, 290, 90, `卖${want.n}朵`, () => {
        sellFlower(want.type, want.n); S.coins += want.n * WISH_PRICE;
        log('market', { act: 'wish', type: want.type, n: want.n }); E.save(); E.refreshWatch();
        E.toast(`卖了${wf.name}${want.n}朵，花币 +${want.n * WISH_PRICE}`); marketScreen();
      }, { kind: 'primary', disabled: sellableOf(want.type) < want.n, size: 36, voice: [wf.name] });
      const hasWild = Object.keys(FLOWERS).some(t => wildOf(t));
      P.text(hasWild ? `户外花园摘的花每天最多卖 ${WILD_LIMIT} 朵 · 今天还能卖 ${wildLeft()} 朵` : (flowerCount() ? '不想卖的话放着也没关系' : '还没有花。把花园里开的花剪下来就可以卖了'), W / 2, 920, { size: 30, color: hasWild && !wildLeft() ? C.danger : C.sub });
    }, zoneOf('market'), 'market');
    E.say('这里是花市场，可以卖自己种的花。');
  }

  // ================= 우편함 =================
  function mailScreen() {
    open(P => {
      exitBtn(P);
      P.glass(300, 60, 1320, 950, 60);
      P.icon('ic_mail', 460, 160, 130);
      P.text('信箱', 550, 150, { size: 62, weight: 700, align: 'left' });
      P.text('家人和朋友寄来的心愿和信，没有截止时间', 552, 215, { size: 30, color: C.sub, align: 'left' });
      P.text('花的心愿', 360, 300, { size: 36, weight: 700, color: C.green, align: 'left' });
      S.wishes.slice(0, 3).forEach((w, k) => {
        const y = 330 + k * 150, f = FLOWERS[w.type];
        P.rect(350, y, 1220, 132, 32, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
        P.circle(430, y + 66, 46, w.from === '女儿' ? '#e3d9f2' : '#d6ead0'); P.text(w.from, 430, y + 69, { size: w.from.length > 1 ? 28 : 34, weight: 700 });
        P.icon(f.icon, 530, y + 66, 80);
        P.text(`“想要${w.n}朵${f.name}”`, 590, y + 48, { size: 36, weight: 600, align: 'left' });
        P.text(w.done ? '寄出了，收到了感谢的回信' : `我的${f.name}：${S.flowers[w.type] || 0}朵`, 590, y + 98, { size: 28, color: w.done ? C.green : C.sub, align: 'left' });
        P.button('w' + k, 1330, y + 30, 210, 76, w.done ? '完成' : '送礼物', () => {
          useFlower(w.type, w.n); w.done = true; log('wish', { from: w.from, type: w.type });
          S.letters.unshift({ from: w.from, text: `${f.name}真是谢谢你！一收到就插进花瓶里了。` });
          E.save(); E.toast(`把${f.name}寄给了${w.from}`); main.refresh(); qev('mail');
        }, { kind: 'primary', disabled: w.done || (S.flowers[w.type] || 0) < w.n, size: 30, voice: [w.from, '礼物'] });
      });
      const ly = 330 + Math.min(3, S.wishes.length) * 150 + 30;
      P.text('信', 360, ly, { size: 36, weight: 700, color: C.green, align: 'left' });
      S.letters.slice(0, 2).forEach((l, k) => {
        const y = ly + 30 + k * 120;
        P.rect(350, y, 1220, 104, 30, 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.95)', 3);
        P.text(l.from, 380, y + 52, { size: 30, weight: 700, align: 'left', color: C.greenDark });
        P.text(l.text, 540, y + 52, { size: 28, align: 'left', maxW: 1000 });
      });
      P.text('没有花的话，可以在花园里种好再寄', W / 2, 985, { size: 28, color: C.sub });
    }, zoneOf('mail'), 'mail');
    E.say('这里是信箱，有家人寄来的心愿和信。');
  }

  // ================= 설정 =================
  function settings() {
    const st = S.settings;
    open(P => {
      exitBtn(P, () => closeAll());
      P.glass(460, 50, 1000, 980, 60);
      drawGlyph(P.ctx, 'gear', 590, 130, 80);
      P.text('设置', 660, 130, { size: 60, weight: 700, align: 'left' });
      const row = (y, label, opts, cur, set) => {
        P.text(label, 540, y + 30, { size: 34, weight: 600, align: 'left' });
        const bw = (840 - (opts.length - 1) * 14) / opts.length;
        opts.forEach((o, k) => P.button(label + k, 540 + k * (bw + 14), y + 62, bw, 72, o, () => { set(k); E.save(); main.refresh(); }, { kind: cur === k ? 'chipOn' : 'secondary', size: 30, voice: [o] }));
      };
      row(240, '走路速度', ['慢', '普通', '快'], st.speed, k => st.speed = k);
      row(400, '花生长速度', ['演示用（几秒）', '实际（1小时）'], st.demo ? 0 : 1, k => st.demo = !k);
      row(560, '背景音乐', ['开', '关'], st.bgm ? 0 : 1, k => E.setBgm(!k));
      row(720, '语音提示（会读出文字）', ['开', '关'], st.tts ? 0 : 1, k => { st.tts = !k; if (k && window.speechSynthesis) speechSynthesis.cancel(); else E.say('已打开语音提示'); });
      P.button('reset', 540, 920, 840, 64, '恢复到最初状态', () => resetConfirm(), { size: 28 });
    }, 'front', 'settings');
  }
  function resetConfirm() {
    open(P => {
      P.glass(560, 300, 800, 460, 60);
      P.text('要恢复到最初状态吗？', W / 2, 420, { size: 52, weight: 700 });
      P.text('花、花币和保管箱都会回到最开始的样子', W / 2, 500, { size: 32, color: C.sub });
      P.button('no', 620, 600, 330, 100, '取消', () => settings(), { voice: ['取消'] });
      P.button('yes', 970, 600, 330, 100, '撤销', () => { clearState(); location.reload(); }, { kind: 'primary' });
    }, 'front', 'reset');
  }

  // ================= 활동 입구 아이콘 =================
  // 각 활동 장소 위에 같은 모양의 아이콘(배경 없음)을 띄우고, 누르면 바로 시작
  const ENTRANCES = [
    { id: 'shop',   label: '记忆花店', icon: 'watering_can', pos: [43.0, -0.1, 2.55], free: true },
    { id: 'market', label: '花市场', icon: 'ic_market', pos: [34.4, -2.3, 2.55] },
    { id: 'tea',    label: '花园茶话会', icon: 'ic_tea', pos: [47.0, -3.2, 2.3] },
    { id: 'mail',   label: '信箱', icon: 'ic_mail', pos: [36.0, -6.2, 2.75] },
    { id: 'mr',     label: '户外花园', icon: 'poppy', pos: [40.0, 6.0, 2.75] }
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
        E.beacon(z); E.toast(`跟着绿色光柱走到${en.label}`); return;
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
      if (d < 1.3 && !o.near && !main.visible) { o.near = true; E.toast(`这里是${o.en.label}，点图标就开始`); }
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
    const name = { stick: '摇杆', x: 'X 键', trigger: '扳机', grip: '握持键' }[hl];
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
      hello: ['欢迎来到记忆花园', vr ? '我们一步一步慢慢学。用手里的手柄指着画面上的按钮，扣一下食指那边的扳机，按钮就按下去了。试着按一下“下一个”按钮吧。' : '我们一步一步慢慢学。画面上的按钮用鼠标点就可以。试着按一下“下一个”按钮吧。', 'trigger', 'R'],
      walk: ['走一走', vr ? '把左手摇杆轻轻往前推一推，就会朝推的方向慢慢走。' : '按 W 键会往前走。按 A、S、D 键可以往其他方向走。', 'stick', 'L'],
      turn: ['四处看看', vr ? '把右手摇杆往左或往右推，身体就会转过去。也可以直接转头看看。' : '按 Q、E 键，或者拖动鼠标，就能转身四处看看。', 'stick', 'R'],
      menu: ['打开菜单', vr ? '按一下左手的 X 键，菜单就会打开。想关掉画面时，按 B 或 Y 键就可以。' : '按 M 键可以打开和关闭菜单。现在按一下 M 键试试。', 'x', 'L'],
      voice: ['用语音选择', vr ? '按住手柄侧面的握持键说话，也可以用语音来选择。比如说一声“训练空间”试试。' : '按住 V 键说话，也可以用语音来选择。比如说一声“训练空间”试试。', 'grip', 'R'],
      places: ['花园里的地方', '点一下飘着的图标，或者在菜单里选择，绿色的光柱就会给你指路。跟着光柱走过去就可以了。'],
      care: ['照顾花朵', '花的上方出现图标，就表示花需要这个东西。从保管箱里拿出工具，放到花上就可以了。太阳图标直接点一下就行。'],
      end: ['准备好了！', '现在跟着“新手指南”在花园里转一圈吧，指南会一步一步告诉你。操作方法可以在菜单的“使用方法”里再看。']
    }[key];
    open(P => {
      P.glass(260, 70, 1400, 940, 60);
      // 진행 표시
      TUT.forEach((_, k) => { P.ctx.fillStyle = k === step ? C.green : k < step ? 'rgba(94,138,80,0.45)' : 'rgba(255,255,255,0.8)'; P.ctx.beginPath(); P.ctx.arc(W / 2 + (k - (TUT.length - 1) / 2) * 44, 130, k === step ? 13 : 10, 0, Math.PI * 2); P.ctx.fill(); });
      P.text(`${step + 1} / ${TUT.length}`, 1560, 132, { size: 28, color: C.sub, align: 'right' });
      P.text(T[0], W / 2, 220, { size: 60, weight: 700 });
      if (key === 'places') {
        const L = [['ic_flowers', '照料花园', '种花、养花'], ['anemone', '训练空间', '做记忆训练'], ['ic_market', '花市场', '卖自己种的花'], ['watering_can', '记忆花店', '买种子和工具'], ['ic_tea', '花园茶话会', '和家人聊聊天'], ['poppy', '户外花园', '在房间里摘花']];
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
        if (tut.done) { P.circle(W / 2 - 90, 770, 40, C.green); drawGlyph(P.ctx, 'check', W / 2 - 90, 770, 50); P.text('做得好！', W / 2 - 30, 772, { size: 40, weight: 700, color: C.greenDark, align: 'left' }); }
      }
      if (step > 0) P.button('prev', 360, 860, 300, 110, '上一个', () => tutorial(step - 1), { size: 38, voice: ['上一个', '后退'] });
      if (key === 'end') {
        P.button('go', 700, 860, 520, 110, '开始新手指南', () => { S.tutorialDone = true; E.save(); tut = null; questStart(); }, { kind: 'primary', size: 40, voice: ['新手指南', '开始'] });
        P.button('later', 1260, 860, 300, 110, '以后再说', () => { S.tutorialDone = true; E.save(); tut = null; mainMenu(); }, { size: 34, voice: ['以后再说'] });
      }
      else {
        P.button('next', 760, 860, 400, 110, '下一个', () => tutorial(step + 1), { kind: 'primary', size: 42, voice: ['下一个'] });
        P.button('skip', 1260, 860, 300, 110, '跳过', () => { S.tutorialDone = true; E.save(); tut = null; mainMenu(); }, { size: 34, voice: ['跳过'] });
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
    if (ok) { tut.done = true; main.refresh(); E.say('做得好！'); const st = tut.step; setTimeout(() => { if (tut && tut.step === st && current === 'tut') tutorial(st + 1); }, 1800); }
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
    { k: 'flash', title: '试试闪光找花', text: '在训练空间里玩一次“闪光找花”。这是记住刚出现的花在哪里的训练。', btn: '打开训练空间', go: () => trainingArea() },
    { k: 'shopT', title: '试试记忆花店训练', text: '这次试试训练空间里的“记忆花店”。先记住要买的东西，再到花店里挑出来。', btn: '打开训练空间', go: () => trainingArea() },
    { k: 'plant', title: '种下种子', text: '先点花园里空的圆圈，再从“查看保管箱”里拿出种子，放到那个位置种下去。', btn: '去花园', go: () => guideTo('garden') },
    { k: 'water', title: '浇水', text: '花上方出现了水滴图标。先点花，再按“打开保管箱”拿出洒水壶，放到花上。', btn: '去花园', go: () => guideTo('garden') },
    { k: 'fert', title: '施肥', text: '这次是肥料。先点花，再按“打开保管箱”，从“种植用品”里拿出肥料，放到花上。', btn: '去花园', go: () => guideTo('garden') },
    { k: 'sun', title: '晒太阳', text: '太阳图标不需要工具，直接点花上方的太阳图标就行。', btn: '去花园', go: () => guideTo('garden') },
    { k: 'tea', title: '花园茶话会', text: '到茶话会的座位，按“参加”进入聊天。然后按“结束”就可以了。', btn: '去茶话会', go: () => guideTo('tea') },
    { k: 'buy', title: '在记忆花店买东西', text: '走到记忆花店，挑一样东西放进购物车，再用硬币结算。', btn: '去记忆花店', go: () => guideTo('shop') },
    { k: 'mr', title: '户外花园（MR）', text: '走到户外花园看看。这里可以记住花，然后在自己房间的地板上把花摘下来。请在 Quest 头显里试试。', btn: '去户外花园', go: () => guideTo('mr') },
    { k: 'market', title: '在花市场卖花', text: '在花市场卖掉 3 朵花试试，卖多少就能得到多少花币。', btn: '去花市场', go: () => guideTo('market') },
    { k: 'mail', title: '信箱', text: '最后打开信箱，按家人花的心愿送一束花吧。', btn: '去信箱', go: () => guideTo('mail') }
  ];
  const NEED_STEPS = ['water', 'fert', 'sun'];
  let quest = null;
  E.toastDy = () => guideCard && guideCard.visible ? -0.1 : -0.42;
  const _tu = new THREE.Vector3(), _tn = new THREE.Vector3();
  E.toastPlace = t => {
    if (!main.visible || E.inMR()) return false;
    _tu.set(0, 1, 0).applyQuaternion(main.mesh.quaternion); _tn.set(0, 0, 1).applyQuaternion(main.mesh.quaternion);
    t.mesh.position.copy(main.mesh.position).addScaledVector(_tu, 1.9 * H / W / 2 + (hintBar.visible ? 0.3 : 0.12)).addScaledVector(_tn, 0.03);
    t.mesh.quaternion.copy(main.mesh.quaternion);
    return true;
  };
  E.onGuideButton = () => { if (quest && QUEST[quest.i]) { closeAll(); quest.cardOn = true; quest.cardSeen = false; questShow(true); } else questStart(); };
  const guideCard = new Panel(1200, 330, 1.0, { renderOrder: 70 });
  E.addPanel(guideCard);
  guideCard.show(false);
  // 안내 동안 쓸 물건과 꽃 코인을 넉넉히 채워 두고, 끝나면 원래대로 돌려 놓음
  function questSupply() {
    S.coins = Math.max(S.coins, 1000);
    [['seed_tulip', 3], ['seed_daisy', 2], ['seed_sunflower', 2], ['watering_can', 1], ['fertilizer', 3], ['pesticide', 2]].forEach(([id, n]) => { if (inv(id) < n) addInv(id, n - inv(id)); });
    Object.keys(FLOWERS).forEach(t => { if ((S.flowers[t] || 0) < 4) S.flowers[t] = 4; });
    S.wild = {};
    if (S.parties && S.parties[0]) S.parties[0].live = true;
    if (S.wishes && S.wishes[0]) S.wishes[0].done = false;
    if (!S.slots.some(q => !q)) S.slots[S.slots.length - 1] = null;
    E.refreshWatch(); refreshSlots(); S.slots.forEach((_, i) => updateSlot(i));
  }
  function questStart() {
    if (!S.qBackup) { const c = { ...S }; delete c.qBackup; S.qBackup = JSON.stringify(c); }
    quest = { i: 0 }; S.questStep = 0;
    questSupply(); E.save();
    closeAll();
    questShow(true);
  }
  function questRestore() {
    if (!S.qBackup) return;
    const b = JSON.parse(S.qBackup);
    Object.keys(S).forEach(k => delete S[k]);
    Object.assign(S, b);
    S.tutorialDone = true;
    E.carry(null); E.beacon(null);
    E.save(); E.refreshWatch(); refreshSlots(); S.slots.forEach((_, i) => updateSlot(i));
    if (typeof placeShownBaskets === 'function') placeShownBaskets();
  }
  function questStop() {
    quest = null; guideCard.show(false); questRestore();
    S.questStep = null; E.save();
    closeAll(); E.toast('新手指南已停止，物品和花币已恢复成原来的样子');
  }
  function questFinish() {
    quest = null; guideCard.show(false); questRestore();
    S.questStep = null; S.questDone = true; E.save();
    const L = [['anemone', '闪光找花'], ['watering_can', '记忆花店训练'], ['ic_flowers', '种花和照顾花'], ['ic_tea', '花园茶话会'], ['seeds', '在记忆花店买东西'], ['poppy', '户外花园（MR）'], ['ic_market', '在花市场卖花'], ['ic_mail', '信箱']];
    open(P => {
      P.glass(310, 60, 1300, 960, 60);
      P.circle(W / 2, 170, 74, C.green); drawGlyph(P.ctx, 'check', W / 2, 170, 92);
      P.text('新手指南全部完成！', W / 2, 300, { size: 58, weight: 700 });
      P.text('花园里的地方都逛过了。这些是你做过的事情。', W / 2, 365, { size: 32, color: C.sub });
      L.forEach((it, k) => { const x = 470 + (k % 4) * 330, y = 470 + Math.floor(k / 4) * 170;
        P.circle(x, y, 52, '#f8f6ef'); P.icon(it[0], x, y, 80);
        P.text(it[1], x, y + 82, { size: 28, weight: 700 }); });
      P.text('指南过程中用掉的花币和物品，都已经恢复成原来的样子了。现在可以在自己的花园里自由玩了。', W / 2, 820, { size: 32, color: C.ink, maxW: 1150 });
      P.button('go', 610, 890, 700, 105, '开始逛花园', () => closeAll(), { kind: 'primary', size: 40, voice: ['开始', '四处看看'] });
    }, 'front', 'questEnd');
    E.say('新手指南全部完成！过程中用掉的花币和物品都已经恢复了。');
  }
  function questShow(speak) {
    if (!quest) { guideCard.show(false); return; }
    const q = QUEST[quest.i];
    // 순서와 다르게 이미 해 둔 돌보기는 바로 넘어감
    if (NEED_STEPS.includes(q.k) && quest.did && quest.did[q.k]) { setTimeout(() => qev(q.k), 300); return; }
    guideCard.setView(P => {
      P.glass(10, 10, 1180, 310, 50, 'rgba(255,255,255,0.55)');
      P.ctx.fillStyle = C.green; P.ctx.beginPath(); P.ctx.roundRect(40, 34, 270, 54, 27); P.ctx.fill();
      P.text(`新手指南 ${quest.i + 1} / ${QUEST.length}`, 175, 62, { size: 28, weight: 700, color: '#fff' });
      P.text(q.title, 340, 62, { size: 44, weight: 700, align: 'left' });
      P.text(q.text, 600, 160, { size: 32, color: C.ink, maxW: 1100 });
      P.button('go', 330, 222, 480, 84, q.btn, () => { quest.cardOn = false; guideCard.show(false); q.go(); }, { kind: 'primary', size: 34, voice: [q.btn] });
      P.roundBtn('hide', 1130, 60, 34, 'close', () => { quest.cardOn = false; guideCard.show(false); }, ['关闭']);
      P.button('stop', 850, 222, 300, 84, '停止指南', () => questStop(), { size: 30, voice: ['停止指南'] });
    });
    quest.cardOn = true; quest.cardSeen = false;
    if (!main.visible) { guideCard.show(true); placeGuide(true); quest.cardSeen = true; if (speak) E.say(q.title + '. ' + q.text); }
    else if (speak) quest.pendingSay = true;
  }
  function qev(key) {
    if (!quest || !QUEST[quest.i] || QUEST[quest.i].k !== key) return;
    quest.i++; S.questStep = quest.i; E.save();
    if (quest.i >= QUEST.length) { guideCard.show(false); setTimeout(questFinish, 1500); return; }
    E.toast('做得好！来看下一步吧。', false, 2500);
    setTimeout(() => questShow(true), 2600);
  }
  // 안내 카드는 눈앞 아래쪽에 두고, 고개를 크게 돌리면 따라옴
  const _gp = new THREE.Vector3(), _gt = new THREE.Vector3();
  let guideMove = false;
  function guideTarget(out) {
    const h = E.headWorld(), yaw = E.headYaw(), d = E.inXR() ? 1.55 : 1.15;
    out.set(h.x - Math.sin(yaw) * d, Math.max(0.5, h.y - (E.inXR() ? 0.98 : 0.4)), h.z - Math.cos(yaw) * d);
    return h;
  }
  function placeGuide(now) {
    const h = guideTarget(_gt);
    if (now) { guideCard.mesh.position.copy(_gt); guideCard.mesh.lookAt(h.x, h.y, h.z); }
  }
  function guideFrame(dt) {
    // 큰 화면이 열려 있을 때는 그 화면을 따라 하면 되니까 안내 카드는 잠시 숨김
    // 안내 카드는 새 단계가 시작될 때만 보여 주고, 큰 화면을 열거나 버튼을 누르면 숨김
    if (quest && quest.cardSeen && main.visible) quest.cardOn = false;
    const want = !!quest && !!QUEST[quest.i] && quest.cardOn && !E.inMR() && !main.visible;
    if (want && !guideCard.visible) quest.cardSeen = true;
    if (guideCard.visible !== want) {
      guideCard.show(want);
      if (want) { placeGuide(true); if (quest.pendingSay && QUEST[quest.i]) { quest.pendingSay = false; const q = QUEST[quest.i]; E.say(q.title + '. ' + q.text); } }
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
  const PRESS = '请按这里';
  const TOOL = { water: ['watering_can', 2, '请按“园艺工具”这一栏', '按住洒水壶，把它移到花的上方'], fert: ['fertilizer', 1, '请按“种植用品”这一栏', '按住肥料，把它移到花的上方'] };
  function questHint() {
    if (!quest || !QUEST[quest.i] || !main.visible || E.inMR()) return null;
    const k = QUEST[quest.i].k, c = current;
    const back = ['home', '请按“回到花园”，然后看下方的指南卡片'];
    const leave = (txt) => ['exit', txt + '看完以后，按左上角的离开按钮。'];
    if (c === 'menu') {
      const t = { flash: 'train', shopT: 'train', plant: 'garden', water: 'garden', fert: 'garden', sun: 'garden', mail: 'mail' }[k];
      return t ? [t, '请按这个按钮'] : ['close', '请关掉菜单，看下方的指南卡片'];
    }
    if (c === 'training') {
      if (k === 'flash') return ['flash', '请按“闪光找花”'];
      if (k === 'shopT') return ['shop', '请按“记忆花店”'];
      return ['exit', '请按离开按钮，然后看下方的指南卡片'];
    }
    if (c === 'garden-inv') {
      if (k === 'plant') return invTab !== 0 ? ['tab0', '请按“种子”这一栏'] : [h => h.item && h.item.startsWith('seed_'), '按住种子，把它移到空的圆圈上'];
      if (TOOL[k]) { const [id, tab, t1, t2] = TOOL[k]; return invTab !== tab ? ['tab' + tab, t1] : [h => h.item === id, t2]; }
      return ['x', '请按关闭按钮，然后看下方的指南卡片'];
    }
    if (c === 'garden-info') {
      if (k === 'sun') return ['sun', '请按“晒太阳”'];
      if (TOOL[k]) return ['inv', '请按“打开保管箱”'];
      return ['close', '请按“关闭”'];
    }
    if (c === 'garden-choose') return k === 'plant' ? ['inv', '按“查看保管箱”，拿出种子'] : ['x', '请按关闭按钮'];
    if (c === 'garden-confirm') return ['yes', '请按“种”'];
    if (c === 'teaEntry' && k === 'tea') return ['join0', '按“参加”进入聊天'];
    if (c === 'teaChat' && k === 'tea') return ['end', '聊一聊以后，按“结束”'];
    if (c === 'shopBuy' && k === 'buy') return Object.keys(cart).length ? ['cart', '请按“查看购物车”'] : [h => ITEMS[h.id] && h.id.startsWith('seed_'), '点想买的东西，把它放进购物车'];
    if (c === 'cartView' && k === 'buy') return ['pay', '请按“结算”'];
    if (c === 'cartPay' && k === 'buy') return payHint(cartTotal(), cartPay.tray);
    if (c === 'market' && (k === 'market' || !(quest.did && quest.did.sold))) return ['any', '按“卖3朵”试着卖花吧'];
    if (c === 'mail' && k === 'mail') return [h => /^w\d$/.test(h.id) && !h.disabled, '按“送礼物”把花送出去吧'];
    const M = {
      flashResult: back, shopResult: back, teaEnd: back, mrDone: back,
      cartDone: ['home', '请按“回花园”，然后看下方的指南卡片'],
      flashStart: ['start', '请按“开始”'], flashInstr: ['ok', '看完说明后按“确认”'], flashRun: flash ? [null, flash.phase === 'show' ? '记住花出现的位置' : flash.phase === 'chooseB' ? '请按橙色标出的格子，那里刚才有蝴蝶' : '请按橙色标出的格子，那里刚才有花'] : null,
      shopStart: ['start', '请按“开始”'], shopInstr: ['ok', '看完说明后按“确认”'], shopList: ['done', '记住要买的东西，然后按“都记住了”'],
      shopPick: shop ? pickHint() : null, shopPay: shop ? payHint(shopTotal(), shop.tray) : null,
      guide: ['walk', '请按“走过去”，然后跟着绿色光柱走'],
      mr: ['go', '请按“开始 MR”'], mrNo: ['ok', '按“确认”就会进入下一步'],
      questEnd: ['go', '请按“开始逛花园”'],
      teaEntry: leave('这里是和家人朋友聊天的地方。'), shopBuy: leave('可以挑选东西放进购物车，然后结算。'),
      market: leave('可以卖掉自己种的花，换花币。'), mail: leave('可以看家人发来的花的心愿，还可以送花。')
    };
    return M[c] || null;
  }
  // 동전 내기: 남은 금액에 맞는 동전을 하나씩 알려 주기
  function payHint(total, tray) {
    const sum = tray.reduce((a, b) => a + b, 0), left = total - sum;
    if (left === 0) return ['pay', `刚刚好！一共 ${total} 花币，请按“结算”`];
    if (left < 0) return ['undo', '放多了，请按“拿掉一个”'];
    const v = [10, 5, 1].find(x => x <= left);
    return ['c' + v, `一共 ${total} 花币，还差 ${left} 花币，请按 ${v} 的硬币`];
  }
  // 기억 꽃집 고르기: 목록에 있던 물건을 하나씩 알려 주기
  function pickHint() {
    const l = shop.list.find(x => (shop.picked[x.id] || 0) < x.qty);
    if (!l) return ['pay', '都选好了！请按“结算”'];
    const tab = ITEMS[l.id].tab;
    if (tab !== shop.tab) return ['tab' + tab, `请按“${SHOP_TABS[tab]}”这一栏`];
    return [l.id, `请选清单上的“${ITEMS[l.id].name}”`];
  }
  // 안내 문장은 큰 화면 위쪽 바깥에 붙여서 버튼을 가리지 않게
  const hintBar = new Panel(1700, 150, 1.9 * 1700 / W, { renderOrder: 75 });
  main.mesh.add(hintBar.mesh); hintBar.mesh.position.set(0, 1.9 * H / W / 2 + 0.1, 0.01);
  hintBar.show(false);
  function setHintBar(txt) {
    if (!txt) { hintBar.show(false); return; }
    hintBar.setView(P => { P.glass(6, 6, P.W - 12, P.H - 12, 70, 'rgba(255,248,232,0.96)'); P.ctx.strokeStyle = '#f08c1e'; P.ctx.lineWidth = 6; P.ctx.beginPath(); P.ctx.roundRect(6, 6, P.W - 12, P.H - 12, 70); P.ctx.stroke(); P.text(txt, P.W / 2, P.H / 2 + 2, { size: 46, weight: 700, maxW: P.W - 80 }); });
    hintBar.show(true);
  }
  let qhKey = '', qhT = 0;
  function questHintFrame(now) {
    const h = questHint();
    const key = h ? current + '|' + h[0] + '|' + h[1] : '';
    if (key !== qhKey) {
      qhKey = key;
      main.guideId = h ? h[0] : null; main.guideText = h && h[0] ? PRESS : '';
      main.refresh();
      setHintBar(h ? h[1] : ''); if (h) E.say(h[1]);
    }
    if (hintBar.visible) hintBar.draw();
    // 반짝 꽃 찾기: 안내 중에는 정답 칸을 주황색으로
    const fOn = quest && current === 'flashRun' && flash;
    tiles.forEach(t => {
      const st = fOn && t.visible ? flash.cell[t.idx] : null;
      const want = !!st && ((flash.phase === 'choose' && flash.answer.includes(t.idx) && !st.sel) || (flash.phase === 'chooseB' && t.idx === flash.bcell && !st.bsel));
      if (want !== !!t.guideId) { t.guideId = want ? 't' : null; t.guidePad = -16; t.guideText = ''; t.refresh(); }
      else if (want && now - qhT > 110) t.refresh();
    });
    if ((main.guideId || gardenBar.guideId) && now - qhT > 120) { qhT = now; if (main.guideId) main.refresh(); if (gardenBar.guideId) gardenBar.refresh(); }
    // 정원: 보관함 버튼 · 빈 자리 · 꽃 위 표시를 직접 가리키기
    const k = quest && QUEST[quest.i] ? QUEST[quest.i].k : null;
    const gb = null;
    if (gardenBar.guideId !== gb) { gardenBar.guideId = gb; gardenBar.guideText = gb ? PRESS : ''; gardenBar.refresh(); }
    let tgt = null, txt = '';
    if (quest && !main.visible && !E.inMR()) {
      const c = E.carrying && E.carrying.id;
      const pi = quest.slot != null ? quest.slot : S.slots.findIndex(q => q && q.needs && q.needs[k]);
      if (k === 'plant') { const i = S.slots.findIndex(q => !q); if (i >= 0 && (!c || c.startsWith('seed_'))) { tgt = slotObjs[i].root; txt = c ? '放在这里' : '点空的位置'; } }
      if ((k === 'water' || k === 'fert') && !c && pi >= 0 && slotObjs[pi]) { tgt = slotObjs[pi].root; txt = '点一下花'; }
      if ((k === 'water' && c === 'watering_can') || (k === 'fert' && c === 'fertilizer') || k === 'sun') {
        const i = quest.slot != null ? quest.slot : S.slots.findIndex(q => q && q.needs && q.needs[k]);
        if (i >= 0 && slotObjs[i]) { tgt = slotObjs[i].status.sprite; txt = k === 'sun' ? '请按这里' : '放在这里'; }
      }
    }
    markFrame(tgt, txt, now);
  }
  // 3D 안내 표시 (주황 고리 + 말풍선)
  const mark = new THREE.Group();
  const markRing = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.24, 40), new THREE.MeshBasicMaterial({ color: 0xf08c1e, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  markRing.renderOrder = 90; mark.add(markRing);
  const markTag = new Bubble(560, 150, 0.5); markTag.sprite.renderOrder = 91; markTag.sprite.position.y = 0.36; mark.add(markTag.sprite);
  mark.visible = false; E.scene.add(mark);
  let markTxt = '';
  const _mp = new THREE.Vector3(), _mc = new THREE.Vector3();
  function markFrame(obj, txt, now) {
    mark.visible = !!obj;
    if (!obj) return;
    obj.getWorldPosition(_mp); mark.position.copy(_mp);
    const flat = !obj.isSprite;
    if (flat) { markRing.rotation.set(-Math.PI / 2, 0, 0); mark.position.y += 0.03; }
    else { E.camera.getWorldPosition(_mc); markRing.lookAt(_mc); }
    const sc = 1 + 0.12 * Math.sin(now / 220); markRing.scale.setScalar(sc);
    markRing.material.opacity = 0.65 + 0.35 * Math.sin(now / 220);
    if (txt !== markTxt) {
      markTxt = txt;
      markTag.paint((ctx, b) => {
        ctx.fillStyle = '#f08c1e'; ctx.beginPath(); ctx.roundRect(10, 10, b.W - 20, b.H - 50, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(b.W / 2 - 22, b.H - 41); ctx.lineTo(b.W / 2 + 22, b.H - 41); ctx.lineTo(b.W / 2, b.H - 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 52px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, b.W / 2, (b.H - 40) / 2 + 8);
      });
    }
    markTag.sprite.position.y = (flat ? 0.36 : 0.3) + 0.03 * Math.sin(now / 300);
  }
  // 초록 빛기둥이 안 보이면 어느 쪽인지 알려 주기
  const dirTag = new Bubble(1000, 170, 1.0); dirTag.sprite.renderOrder = 92; dirTag.sprite.visible = false; E.scene.add(dirTag.sprite);
  let dirSide = 0, dirSaid = null;
  function dirFrame() {
    const bp = E.beaconPos && E.beaconPos();
    if (!bp || main.visible || E.inMR()) { dirTag.sprite.visible = false; dirSide = 0; if (!bp) dirSaid = null; return; }
    const h = E.headWorld(), yaw = E.headYaw();
    const want = Math.atan2(-(bp.x - h.x), -(bp.z - h.z));
    let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const side = Math.abs(d) < 0.55 ? 0 : (d > 0 ? -1 : 1);
    if (!side) { dirTag.sprite.visible = false; if (dirSide) E.toast('看到绿色光柱了，往那边走吧', true, 3000); dirSide = 0; return; }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    dirTag.sprite.position.set(h.x + fx * 1.4, h.y - 0.15, h.z + fz * 1.4);
    dirTag.sprite.visible = true;
    if (side !== dirSide) {
      dirSide = side;
      const left = side < 0;
      dirTag.paint((ctx, b) => {
        ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.roundRect(10, 10, b.W - 20, b.H - 20, 75); ctx.fill();
        ctx.fillStyle = '#3d3410';
        const ax = left ? 80 : b.W - 80;
        ctx.beginPath(); ctx.moveTo(ax + (left ? -40 : 40), b.H / 2); ctx.lineTo(ax + (left ? 25 : -25), b.H / 2 - 45); ctx.lineTo(ax + (left ? 25 : -25), b.H / 2 + 45); ctx.fill();
        ctx.font = `700 50px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(left ? '绿色光柱在左边' : '绿色光柱在右边', b.W / 2 + (left ? 40 : -40), b.H / 2 + 3);
      });
      if (dirSaid !== side) { dirSaid = side; E.say(left ? '把头转向左边，找一找绿色光柱' : '把头转向右边，找一找绿色光柱'); }
    }
  }

  // ================= VR 안에서도 늘 보이는 아래쪽 버튼 줄 =================
  const vrHud = new Panel(1300, 170, 0.66, { renderOrder: 72 });
  E.addPanel(vrHud); vrHud.show(false);
  let hudTalk = false;
  function paintHud() {
    vrHud.setView(P => {
      P.glass(4, 4, 1292, 162, 80, 'rgba(255,255,255,0.5)');
      P.button('menu', 30, 30, 300, 110, '菜单', () => E.onMenuButton && E.onMenuButton(), { size: 40, voice: [] });
      P.button('talk', 350, 30, 400, 110, E.listening ? '正在说话 · 再按一次结束' : '说话', () => { if (E.listening) E.voiceStop(); else E.voiceStart(); setTimeout(paintHud, 50); }, { kind: E.listening ? 'primary' : 'secondary', size: E.listening ? 30 : 40, voice: [] });
      P.button('exit', 770, 30, 300, 110, '退出 VR', () => E.exitXR && E.exitXR(), { size: 36, voice: [] });
      P.circle(1180, 85, 62, C.green, '#fff', 5); P.icon('plant_labels', 1180, 85, 84);
      P.hit('guide', 1118, 23, 124, 124, () => E.onGuideButton && E.onGuideButton(), { voice: [] });
    });
  }
  paintHud();
  const _hp = new THREE.Vector3(), _ht = new THREE.Vector3();
  let hudMove = false;
  function hudFrame(dt) {
    const on = E.inXR() && !E.inMR();
    if (vrHud.visible !== on) { vrHud.show(on); hudMove = true; }
    if (!on) return;
    if (hudTalk !== !!E.listening) { hudTalk = !!E.listening; paintHud(); }
    const h = E.headWorld(), yaw = E.headYaw();
    _ht.set(h.x - Math.sin(yaw) * 1.3, Math.max(0.45, h.y - 0.6), h.z - Math.cos(yaw) * 1.3);
    _hp.copy(vrHud.mesh.position);
    const a1 = Math.atan2(_hp.x - h.x, _hp.z - h.z), a2 = Math.atan2(_ht.x - h.x, _ht.z - h.z);
    let da = Math.abs(a1 - a2) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > 0.5 || _hp.distanceTo(_ht) > 0.8) hudMove = true;
    if (hudMove) {
      const k = 1 - Math.exp(-(dt || 0.016) * 4);
      vrHud.mesh.position.lerp(_ht, k); vrHud.mesh.lookAt(h.x, h.y, h.z);
      if (vrHud.mesh.position.distanceTo(_ht) < 0.02) hudMove = false;
    }
  }
  const _tick = E.onTick;
  E.onTick = (dt, now) => {
    hudFrame(dt); followFrame(dt); tutFrame(); guideFrame(dt); questHintFrame(now); dirFrame();
    if (now - (E._bonusT || 0) > 60000) { E._bonusT = now; if (loginBonus()) E.toast('签到奖励：获得 200 花币'); }
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
    if (tut && tut.key === 'menu' && current === 'tut') { tut.done = true; main.refresh(); E.say('做得好！'); setTimeout(() => { if (tut && tut.key === 'menu') tutorial(tut.step + 1); }, 1500); return; }
    if (E.inMR()) { if (mr && mr.phase === 'pick') mrHud(); return; }
    if (E.carrying) { E.carry(null); return; }
    if (main.visible && current === 'menu') closeAll(); else { teaStop(); flash = null; shop = null; mainMenu(); }
  };
  E.onBackButton = () => {
    if (E.inMR()) return;
    if (E.carrying) { E.carry(null); E.toast('放下了', false); return; }
    if (main.visible) { if (current === 'teaChat') teaEnd(); else closeAll(); }
  };
  const startPose = () => E.setPose(40.1, -10.5, 0);
  if (typeof S.questStep === 'number' && S.questStep < QUEST.length) quest = { i: S.questStep };
  E.onEnterDesktop = () => { startPose(); setTimeout(() => { if (!S.tutorialDone) tutorial(0); else { mainMenu(); if (quest) questShow(true); } if (dailyMsg) setTimeout(() => E.toast(dailyMsg), 600); }, 100); };
  E.onEnterVR = () => { startPose(); if (mrReturn) { const f = mrReturn; mrReturn = null; setTimeout(f, 300); return; } setTimeout(() => { if (!S.tutorialDone) tutorial(0); else { mainMenu(); if (quest) questShow(true); } if (dailyMsg) setTimeout(() => E.toast(dailyMsg), 600); dailyMsg = null; }, 200); };
  startPose();
  E.refreshWatch();
  window.MG_game = { questFinish, questStop, _S: () => S, questStart, _quest: () => quest, qev: k => qev(k), tutorial, _tut: () => tut, trainingArea, flashStart, shopStart, _cur: () => current, _sell: { sellableTotal, sellFlower, wildLeft, sellableOf, loginBonus }, mrInfo, mrBegin, _mr: () => mr, _mrPick: k => mrPick(mr.items[k]), customSetup, cartView, _sel: (i, c) => slotSelect(i, c), _apply: (i, k, it) => applyNeed(i, k, it), plantInfo, _b3slot: k => basketSlot(k), _bk: () => bk, basketStart, basketCheck, basketMake, basketDone, shopBuy, unlockPanel, plantInfo, _flashResult: (ok) => { flash = { level: 3 }; flashResult(ok, false); }, mainMenu, trainingArea, flashStart, shopStart, teaEntry, marketScreen, settings, mailScreen, inventory, guideTo, arrive: id => arrive(ZONES[id]), ZONES };
}
