// 기억정원 · 게임 데이터와 저장
export const ITEMS = {
  seed_tulip:     { name: '郁金香种子',     icon: 'seeds', flower: 'tulip',     price: 10, tab: 0, kind: 'seed' },
  seed_daisy:     { name: '雏菊种子',   icon: 'seeds', flower: 'daisy',     price: 10, tab: 0, kind: 'seed' },
  seed_sunflower: { name: '向日葵种子', icon: 'seeds', flower: 'sunflower', price: 10, tab: 0, kind: 'seed' },
  pot:            { name: '花盆',          icon: 'pot',            price: 5,  tab: 0 },
  fertilizer:     { name: '肥料',          icon: 'fertilizer',     price: 5,  tab: 0, kind: 'use' },
  pesticide:      { name: '杀虫剂',        icon: 'pesticide',      price: 8,  tab: 0, kind: 'use' },
  soil:           { name: '培养土',        icon: 'soil',           price: 5,  tab: 0 },
  gloves:         { name: '手套',          icon: 'gloves',         price: 10, tab: 1 },
  watering_can:   { name: '洒水壶',      icon: 'watering_can',   price: 15, tab: 1, kind: 'use', tool: true },
  hand_fork:      { name: '手耙',        icon: 'hand_fork',      price: 10, tab: 1, tool: true },
  hoe:            { name: '锄头',          icon: 'hoe',            price: 10, tab: 1, tool: true },
  labels:         { name: '植物名牌',   icon: 'plant_labels',   price: 2,  tab: 1 },
  kneeling_pad:   { name: '跪垫',     icon: 'kneeling_pad',   price: 10, tab: 1, tool: true },
  basket:         { name: '篮子',        icon: 'basket',         price: 10, tab: 2 },
  pruners:        { name: '园艺剪刀',     icon: 'pruners',        price: 10, tab: 2, tool: true },
  ribbon:         { name: '丝带',          icon: 'ribbon',         price: 2,  tab: 2 },
  wrap:           { name: '包装纸',        icon: 'wrap',           price: 3,  tab: 2 }
};
// 꽃바구니 만들기: 바구니 모양마다 필요한 꽃 · 도구(한 번 사면 계속 사용) · 소모 재료(만들 때마다 사용)
export const BASKETS = [
  { id: 'small', name: '小郁金香花篮', desc: '粉色郁金香花篮', flowers: { tulip: 3, daisy: 2 }, tools: ['pruners'], use: { basket: 1, ribbon: 1 } },
  { id: 'field', name: '野花篮', desc: '白色雏菊花篮', flowers: { daisy: 4, sunflower: 1 }, tools: ['pruners'], use: { basket: 1, ribbon: 1, wrap: 1 } },
  { id: 'sun', name: '向日葵大花篮', desc: '明亮的向日葵花篮', flowers: { sunflower: 3, tulip: 2, daisy: 2 }, tools: ['pruners', 'gloves'], use: { basket: 1, ribbon: 2, wrap: 1 } }
];
// 꽃 시세: 한 송이 15코인. 꽃바구니 값 = 꽃 값 + 바구니·리본·포장지 값 + 15코인
export const FLOWER_PRICE = 15;
export function basketPrice(st) {
  const f = Object.values(st.flowers).reduce((a, n) => a + n, 0) * FLOWER_PRICE;
  const u = Object.entries(st.use).reduce((a, [id, n]) => a + ITEMS[id].price * n, 0);
  return f + u + 15;
}
export const SHOP_TABS = ['种植用品', '园艺工具', '花篮材料'];

export const FLOWERS = {
  tulip:     { name: '郁金香',     icon: 'tulip',     stageH: [1 / 3, 1 / 3, 1 / 3] },
  daisy:     { name: '雏菊',   icon: 'daisy',     stageH: [1 / 3, 1 / 3, 1 / 3] },
  sunflower: { name: '向日葵', icon: 'sunflower', stageH: [1 / 3, 1 / 3, 1 / 3] }
};
export const STAGE_NAMES = ['种子', '嫩芽', '花苞', '花'];
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

const KEY = 'memory_garden_zh_v1';
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function newState() {
  return {
    coins: 800, lastBonus: Date.now(), wild: { tulip: 0, daisy: 0, sunflower: 0 },
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
      { from: '女儿', text: '妈妈，上次寄来的花的照片真好看。这个周末给你打电话！' },
      { from: '朴奶奶', text: '下次茶话会再给我讲讲老家的故事吧，我等着。' }
    ],
    parties: [
      { when: '现在 · 今天下午3点', topic: '我喜欢的花', icon: 'tulip', friends: ['朴', '崔'], live: true },
      { when: '周五上午10点', topic: '我的老家', icon: 'anemone', friends: ['李'], live: false }
    ],
    invited: {},
    wishes: [
      { from: '女儿', type: 'tulip', n: 1, done: false },
      { from: '儿子', type: 'sunflower', n: 1, done: false }
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
      if (!r.wild) r.wild = {};
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
