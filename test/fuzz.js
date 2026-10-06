/*
 * 严格弱序 fuzz：同一批文件任意输入排列，排序结果必须完全一致。
 * 非传递的比较器（比如「罗马 vs 字母」两套逻辑混用）会在这一项现形。
 *   node test/fuzz.js
 */
const Module = require('module');
const orig = Module._load;
Module._load = function (r) { if (r === 'obsidian') return { Plugin: class {}, Notice: class {} }; return orig.apply(this, arguments); };
const S = require('../main.js');
const { sortItems } = S;
const file = (n) => ({ file: { name: n, extension: 'md' } });
const run = (names) => sortItems(names.map(file)).map((i) => i.file.name).join('\u0001');

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '二十', '三十', '九十'];
const U = ['月', '日', '分', '项', '册', '页', '部', '号', '周', '天', '时'];
let seed = 20261006;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function gen() {
  const k = Math.floor(rnd() * 10);
  const y = 2024 + Math.floor(rnd() * 3);
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  if (k === 0) return y + '年' + pick(CN) + '月' + pick(CN) + '日';
  if (k === 1) return y + '年' + m + '月' + d + '日';
  if (k === 2) return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  if (k === 3) return '第' + pick(CN) + '章';
  if (k === 4) return 'v' + Math.floor(rnd() * 4) + '.' + Math.floor(rnd() * 20);
  if (k === 5) return '卷' + pick(['I', 'II', 'III', 'IV', 'V', 'IX', 'X']);
  if (k === 6) return pick(CN) + pick(U) + pick(CN) + pick(U);
  if (k === 7) return pick(['附录', '方案', '表', '索引']) + 'ABCDEFGHIJ'[Math.floor(rnd() * 10)];
  if (k === 8) return '第' + Math.floor(rnd() * 30) + '节';
  return '随手记 ' + Math.floor(rnd() * 100);
}

let bad = 0, groups = 0;
for (let round = 0; round < 500; round++) {
  const n = 2 + Math.floor(rnd() * 16);
  const base = [];
  for (let i = 0; i < n; i++) base.push(gen());
  const uniq = [...new Set(base)];
  if (uniq.length < 2) continue;
  groups++;
  const want = run(uniq);
  for (let t = 0; t < 20; t++) {
    const sh = uniq.slice();
    for (let i = sh.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [sh[i], sh[j]] = [sh[j], sh[i]];
    }
    const got = run(sh);
    if (got !== want) {
      bad++;
      console.log('!!! 非弱序 round=' + round + ' try=' + t);
      console.log('  输入: ' + sh.join(' | '));
      console.log('  A  : ' + want.split('\u0001').join(' < '));
      console.log('  B  : ' + got.split('\u0001').join(' < '));
      break;
    }
  }
  if (bad > 2) break;
}
console.log(bad === 0
  ? '严格弱序 fuzz 通过：' + groups + ' 组 x 20 次随机排列，结果全部一致'
  : '失败 ' + bad + ' 组');

let idem = 0;
for (let round = 0; round < 200; round++) {
  const uniq = [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 12) }, gen))];
  if (uniq.length < 2) continue;
  const once = run(uniq);
  if (run(once.split('\u0001')) !== once) idem++;
}
console.log(idem === 0 ? '幂等性通过：已排序输入再排 200 组，结果不变' : '幂等性失败 ' + idem + ' 组');