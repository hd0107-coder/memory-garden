// 기억정원 · 게임 데이터와 저장
export const ITEMS = {
  seed_tulip:     { name: '튤립 씨앗',     icon: 'seeds', flower: 'tulip',     price: 10, tab: 0, kind: 'seed' },
  seed_daisy:     { name: '데이지 씨앗',   icon: 'seeds', flower: 'daisy',     price: 10, tab: 0, kind: 'seed' },
  seed_sunflower: { name: '해바라기 씨앗', icon: 'seeds', flower: 'sunflower', price: 10, tab: 0, kind: 'seed' },
  pot:            { name: '화분',          icon: 'pot',            price: 5,  tab: 0 },
  fertilizer:     { name: '비료',          icon: 'fertilizer',     price: 5,  tab: 0, kind: 'use' },
  pesticide:      { name: '살충제',        icon: 'pesticide',      price: 8,  tab: 0, kind: 'use' },
  soil:           { name: '배양토',        icon: 'soil',           price: 5,  tab: 0 },
  gloves:         { name: '장갑',          icon: 'gloves',         price: 10, tab: 1 },
  watering_can:   { name: '물뿌리개',      icon: 'watering_can',   price: 15, tab: 1, kind: 'use', tool: true },
  hand_fork:      { name: '손갈퀴',        icon: 'hand_fork',      price: 10, tab: 1, tool: true },
  hoe:            { name: '호미',          icon: 'hoe',            price: 10, tab: 1, tool: true },
  labels:         { name: '식물 이름표',   icon: 'plant_labels',   price: 2,  tab: 1 },
  kneeling_pad:   { name: '무릎 방석',     icon: 'kneeling_pad',   price: 10, tab: 1, tool: true },
  basket:         { name: '바구니',        icon: 'basket',         price: 10, tab: 2 },
  pruners:        { name: '원예 가위',     icon: 'pruners',        price: 10, tab: 2, tool: true },
  ribbon:         { name: '리본',          icon: 'ribbon',         price: 2,  tab: 2 },
  wrap:           { name: '포장지',        icon: 'wrap',           price: 3,  tab: 2 }
};
// 꽃바구니 만들기: 바구니 모양마다 필요한 꽃 · 도구(한 번 사면 계속 사용) · 소모 재료(만들 때마다 사용)
export const BASKETS = [
  { id: 'small', name: '작은 튤립 바구니', desc: '분홍 튤립 바구니', flowers: { tulip: 3, daisy: 2 }, tools: ['pruners'], use: { basket: 1, ribbon: 1 } },
  { id: 'field', name: '들꽃 바구니', desc: '하얀 데이지 바구니', flowers: { daisy: 4, sunflower: 1 }, tools: ['pruners'], use: { basket: 1, ribbon: 1, wrap: 1 } },
  { id: 'sun', name: '해바라기 큰 바구니', desc: '환한 해바라기 바구니', flowers: { sunflower: 3, tulip: 2, daisy: 2 }, tools: ['pruners', 'gloves'], use: { basket: 1, ribbon: 2, wrap: 1 } }
];
// 꽃 시세: 한 송이 15코인. 꽃바구니 값 = 꽃 값 + 바구니·리본·포장지 값 + 15코인
export const FLOWER_PRICE = 15;
export function basketPrice(st) {
  const f = Object.values(st.flowers).reduce((a, n) => a + n, 0) * FLOWER_PRICE;
  const u = Object.entries(st.use).reduce((a, [id, n]) => a + ITEMS[id].price * n, 0);
  return f + u + 15;
}
export const SHOP_TABS = ['재배 용품', '원예 도구', '꽃바구니 재료'];

export const FLOWERS = {
  tulip:     { name: '튤립',     icon: 'tulip',     stageH: [1 / 3, 1 / 3, 1 / 3] },
  daisy:     { name: '데이지',   icon: 'daisy',     stageH: [1 / 3, 1 / 3, 1 / 3] },
  sunflower: { name: '해바라기', icon: 'sunflower', stageH: [1 / 3, 1 / 3, 1 / 3] }
};
export const STAGE_NAMES = ['씨앗', '새싹', '꽃봉오리', '꽃'];
export const FLASH_POOL = ['rose', 'hydrangea', 'anemone', 'poppy', 'daffodil', 'iris', 'tulip', 'daisy', 'sunflower'];

// 반짝 꽃 찾기: 단계가 올라갈수록 칸, 꽃 수가 늘고 시간이 줄어요 (끝없이 이어짐)
export const FLASH_MAX = 30;
export function flashCfg(L) {
  const grids = [[2, 2], [3, 2], [3, 3], [3, 3], [4, 3], [4, 3], [4, 4], [4, 4], [5, 4], [5, 4], [5, 5]];
  const [cols, rows] = grids[Math.min(L - 1, grids.length - 1)];
  const n = Math.min(1 + Math.floor((L - 1) / 2), Math.floor(cols * rows / 3), 5);
  const show = Math.round((Math.max(2, 4 - (L - 1) * 0.2) + (n - 1) * 0.6) * 1000);
  const limit = Math.max(5, 11 - L) + (L >= 4 ? 3 : 0);
  return { cols, rows, n, show, limit, bfly: L >= 4 };
}

const KEY = 'memory_garden_ko_v1';
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function newState() {
  return {
    coins: 120,
    inv: { seed_tulip: 2, seed_daisy: 1, seed_sunflower: 1, fertilizer: 3, pesticide: 2, soil: 2, pot: 1, labels: 5, watering_can: 1, pruners: 1 },
    flowers: { tulip: 0, daisy: 0, sunflower: 0 },
    slots: [
      null,
      { type: 'tulip', stage: 1, watered: false, readyAt: 0, fert: false },
      null,
      { type: 'daisy', stage: 3, watered: true, readyAt: 0, fert: false },
      null, null, null, null, null, null
    ],
    flashLevel: 1, shopLevel: 1,
    lastDay: '', lastVisit: Date.now(), trainCoinsToday: 0, rec: 'flash',
    settings: { move: 'smooth', speed: 1, demo: true, tts: false, bgm: true, v: 2 },
    letters: [
      { from: '딸', text: '엄마, 지난번에 보내 주신 꽃 사진 정말 예뻤어요. 이번 주말에 전화할게요!' },
      { from: '박 할머니', text: '다음 티파티에서 고향 이야기 또 들려줘요. 기다릴게요.' }
    ],
    parties: [
      { when: '지금 · 오늘 오후 3시', topic: '내가 좋아하는 꽃', icon: 'tulip', friends: ['박', '최'], live: true },
      { when: '금요일 오전 10시', topic: '내 고향', icon: 'anemone', friends: ['이'], live: false }
    ],
    invited: {},
    wishes: [
      { from: '딸', type: 'tulip', n: 1, done: false },
      { from: '아들', type: 'sunflower', n: 1, done: false }
    ],
    baskets: [],
    log: []
  };
}

export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.inv) {
      const n = newState(), r = Object.assign(n, s);
      if (!r.settings || r.settings.v !== 2) { r.settings = Object.assign({}, n.settings, r.settings || {}, { tts: false, bgm: true, v: 2 }); }
      if (!r.letters) r.letters = newState().letters;
      if (!r.baskets) r.baskets = [];
      if (!Array.isArray(r.slots)) r.slots = n.slots;
      while (r.slots.length < 10) r.slots.push(null);
      if (r.slots.length > 20) r.slots.length = 20;
      return r;
    }
  } catch (e) { /* 저장소를 쓸 수 없으면 새로 시작 */ }
  return newState();
}
export function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 무시 */ }
}
export function clearState() {
  try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
}
