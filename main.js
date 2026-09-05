/*
 * 中文自然排序 (CN Natural Sort) — Obsidian 社区插件
 * 让文件浏览器按「第X章 / 第X节」「Lecture NN」等中文/阿拉伯数字自然排序，
 * 全程不改文件名、不改文件内容。仅重排文件浏览器里的显示顺序。
 *
 * 原理：接管文件浏览器渲染后的 DOM，对每个 .nav-folder-children 容器内的
 * 文件/文件夹按「中文数字感知」的比较器重新排序。用 MutationObserver 监听
 * 展开/新增等动态变化并自动重排。重排时只在顺序确实变化时才移动节点，避免死循环。
 */
const { Plugin } = require('obsidian');

// ---------------------------------------------------------------------------
// 汉字数字 -> 整数
// ---------------------------------------------------------------------------
const CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const CN_UNITS = { '十': 10, '百': 100, '千': 1000 };

function cnToInt(s) {
  let total = 0, sec = 0;
  for (const ch of s) {
    if (ch in CN_DIGITS) sec = CN_DIGITS[ch];
    else if (ch in CN_UNITS) { const u = CN_UNITS[ch]; total += (sec || 1) * u; sec = 0; }
    else if (ch === '万') { total = (total + sec) * 10000; sec = 0; }
    else if (ch === '亿') { total = (total + sec) * 100000000; sec = 0; }
    else return null;
  }
  return total + sec;
}

// ---------------------------------------------------------------------------
// 从文件名（不含扩展名）提取排序用的数字
// 返回整数；无法提取则返回 null（退回自然字符串比较）
// ---------------------------------------------------------------------------
function extractNum(name) {
  // 1) 中文：第X章 / 第X节 / 第X卷 / 第X篇 / 第X回 / 第X部
  let m = name.match(/第([零〇一二两三四五六七八九十百千]+)[章节卷篇回部节]/);
  if (m) { const n = cnToInt(m[1]); if (n != null) return n; }
  // 2) 阿拉伯：第12章 / 第3节
  m = name.match(/第(\d+)[章节卷篇回部节]/);
  if (m) return parseInt(m[1], 10);
  // 3) 西式：Lecture 57 / Lesson 3
  m = name.match(/(?:lecture|lesson)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // 4) 行首编号：11. 第十一章 / 01_高等数学 / 00-历史学MOC
  m = name.match(/^(\d+)[._\-]/);
  if (m) return parseInt(m[1], 10);
  // 5) 任意数字串（自然排序兜底，如 a2 < a10）
  m = name.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

// ---------------------------------------------------------------------------
// 自然字符串比较（数字按大小，而非逐字符）
// ---------------------------------------------------------------------------
function tokenize(s) {
  const re = /(\d+)|(\D+)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] != null ? +m[1] : m[2]);
  }
  return out;
}

function natCompare(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i], y = tb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else if (typeof x === 'number') {
      return -1;            // 数字段排在文本段前
    } else if (typeof y === 'number') {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function basename(path) { return path.split('/').pop(); }

function itemKey(el) {
  const p = el.getAttribute('data-path') || '';
  const name = basename(p).replace(/\.md$/, '');
  return { num: extractNum(name), name };
}

function compareItems(a, b) {
  const ka = itemKey(a), kb = itemKey(b);
  if (ka.num != null && kb.num != null) {
    if (ka.num !== kb.num) return ka.num - kb.num;
    return natCompare(ka.name, kb.name);
  }
  if (ka.num != null) return -1;   // 带序号的排在前（章节聚在一起）
  if (kb.num != null) return 1;
  return natCompare(ka.name, kb.name);
}

// ---------------------------------------------------------------------------
// 插件主体
// ---------------------------------------------------------------------------
class CNNaturalSort extends Plugin {
  onload() {
    this.container = null;
    this.observer = null;
    this._timer = null;
    this.register(() => this.stop());

    this.app.workspace.onLayoutReady(() => this.start());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.schedule()));

    this.addCommand({
      id: 'resort',
      name: '按中文自然排序重新整理文件浏览器',
      callback: () => this.resortAll(),
    });
    this.addRibbonIcon('sort-asc', '中文自然排序：点击可强制重新整理', () => this.resortAll());
  }

  start() {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    const container = leaf && leaf.view && leaf.view.containerEl;
    if (!container) return;
    this.container = container;
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(container, { childList: true, subtree: true });
    this.resortAll();
  }

  stop() {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.resortAll(); }, 60);
  }

  resortAll() {
    if (!this.container) { this.start(); if (!this.container) return; }
    const lists = this.container.querySelectorAll('.nav-folder-children');
    lists.forEach((list) => {
      const items = Array.from(list.children).filter(
        (el) => el.classList.contains('nav-file') || el.classList.contains('nav-folder')
      );
      if (items.length < 2) return;
      const folders = items.filter((el) => el.classList.contains('nav-folder')).sort(compareItems);
      const files = items.filter((el) => el.classList.contains('nav-file')).sort(compareItems);
      const desired = folders.concat(files);
      // 仅在顺序确实不同时移动节点，避免触发无意义的 MutationObserver 循环
      for (let i = 0; i < desired.length; i++) {
        if (list.children[i] !== desired[i]) {
          list.insertBefore(desired[i], list.children[i] || null);
        }
      }
    });
  }
}

module.exports = CNNaturalSort;
// 暴露纯函数，便于在 Node 下做单元测试（不影响 Obsidian 运行）
module.exports.cnToInt = cnToInt;
module.exports.extractNum = extractNum;
module.exports.natCompare = natCompare;
module.exports.compareItems = compareItems;
