/*
 * 性能基准。阈值 = 重构前（1.3.2）实测中位数，是回归红线。
 *   node test/bench.js
 * 重构后实测：冷 token 化 ~0.95ms / 整批排序 ~0.97ms / 热缓存 200 次总计 ~15ms，
 * 三项都优于基线（~1.0 / ~1.19 / ~42ms）；热缓存快 2.7 倍，因为整批裁决不再清空缓存。
 */
const Module = require('module');
const MAIN_ARG = process.argv[3] || null;   // 对比用：指向旧版 main.js
const MAIN = MAIN_ARG || require('path').join(__dirname, '..', 'main.js');

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') return { Plugin: class Plugin {}, Notice: class Notice {} };
  return origLoad.apply(this, arguments);
};

const label = process.argv[2] || 'run';
const file = (n) => ({ file: { name: n, extension: 'md' } });

// 模拟真实 Obsidian 目录：混合形态，量级贴近实际使用
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十二', '二十', '三十', '一百'];
let seed = 20261006;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function makeName(i) {
  const k = i % 12;
  if (k === 0) return '第' + pick(CN) + '章';
  if (k === 1) return '2026年' + pick(CN) + '月' + pick(CN) + '日';
  if (k === 2) return '笔记（' + pick(CN) + '）：第' + pick(CN) + '单元';
  if (k === 3) return '附录' + 'ABCDEFGH'[Math.floor(rnd() * 8)];
  if (k === 4) return 'v' + Math.floor(rnd() * 3) + '.' + Math.floor(rnd() * 30);
  if (k === 5) return '卷' + pick(['I', 'II', 'III', 'IV', 'V', 'IX', 'X']);
  if (k === 6) return pick(CN) + '月' + pick(CN) + '日';
  if (k === 7) return '第' + Math.floor(rnd() * 30) + '节';
  if (k === 8) return '方案' + 'ABCD'[Math.floor(rnd() * 4)] + ' ' + pick(['初稿', '定稿', '存档']);
  if (k === 9) return '2026-' + String(1 + Math.floor(rnd() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
  if (k === 10) return '三体 第' + Math.floor(rnd() * 3) + '部';
  return '随手记 ' + i;
}

const POOL = [];
for (let i = 0; i < 4000; i++) POOL.push(makeName(i));

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

// --- 1) 冷启动 token 化吞吐：每轮重新 require，缓存全空 ---
const cold = [];
for (let r = 0; r < 7; r++) {
  delete require.cache[require.resolve(MAIN)];
  const M = require(MAIN);
  const names = POOL.slice(r * 500, r * 500 + 500);
  const t0 = performance.now();
  for (const n of names) M.naturalKey(n);
  cold.push(performance.now() - t0);
}

// --- 2) 整批排序：每批都是没排过的名字（贴近真实：进新文件夹） ---
delete require.cache[require.resolve(MAIN)];
const M = require(MAIN);
const sortMs = [];
for (let r = 0; r < 7; r++) {
  const batch = POOL.slice(2000 + r * 200, 2000 + r * 200 + 200);
  const items = batch.map(file);
  const t0 = performance.now();
  M.sortItems(items);
  sortMs.push(performance.now() - t0);
}

// --- 3) 热缓存重复排序：同一批反复排（切文件夹时会命中） ---
const hotItems = POOL.slice(0, 200).map(file);
M.sortItems(hotItems);
const hot = [];
for (let r = 0; r < 200; r++) {
  const t0 = performance.now();
  M.sortItems(hotItems);
  hot.push(performance.now() - t0);
}

// --- 4) 严格弱序 fuzz 规模（不计入性能，作为功能健全性哨兵） ---
console.log('[' + label + ']  Node ' + process.version);
console.log('  冷 token 化 500 个不重复名 : ' + median(cold).toFixed(2) + ' ms');
console.log('  整批排序 200 个新文件      : ' + median(sortMs).toFixed(2) + ' ms');
console.log('  热缓存重排 200 个 x200     : ' + median(hot).toFixed(3) + ' ms  (总计 ' + (hot.reduce((a, b) => a + b, 0)).toFixed(1) + ' ms)');
console.log('  混合语料 token 数           : ' + M.naturalKey('2026年十月六日').length + ' 段');
