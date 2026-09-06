/*
 * 中文自然排序 (CN Natural Sort) — Obsidian 社区插件
 * 让文件浏览器按「第X章 / 第X节」等中文数字自然排序，无需改名、不改内容。
 *
 * 实现要点（v1.1 修复）：
 * - 新版 Obsidian 的 data-path 位于「内层标题元素」上，外层条目才是要移动的元素：
 *     div.tree-item.nav-file
 *       └ div.tree-item-self.nav-file-title[data-path]
 *   因此先查 [data-path]，再向上反查条目元素 (.tree-item)，避免取到空排序键。
 * - 不依赖任何具体类名做容器定位：把条目按「父元素」分组，父元素即子项容器，
 *   从而同时兼容新版 .tree-item-children 与旧版 .nav-folder-children，根目录也覆盖。
 * - 仅在顺序确实变化时移动节点，且排序后再次运行会判定为"已有序"而不改动 DOM，
 *   避免 MutationObserver 无限循环。
 */
const { Plugin, Notice } = require('obsidian');

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
// 从名称提取排序数字；无法提取返回 null（退回自然字符串比较）
// ---------------------------------------------------------------------------
function extractNum(name) {
  if (!name) return null;
  let m = name.match(/第([零〇一二两三四五六七八九十百千]+)[章节卷篇回部节]/);
  if (m) { const n = cnToInt(m[1]); if (n != null) return n; }
  m = name.match(/第(\d+)[章节卷篇回部节]/);
  if (m) return parseInt(m[1], 10);
  m = name.match(/(?:lecture|lesson)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = name.match(/^(\d+)[._\-]/);
  if (m) return parseInt(m[1], 10);
  m = name.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

// ---------------------------------------------------------------------------
// 自然字符串比较
// ---------------------------------------------------------------------------
function tokenize(s) {
  const re = /(\d+)|(\D+)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1] != null ? +m[1] : m[2]);
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
      return -1;
    } else if (typeof y === 'number') {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function basename(path) { return String(path || '').split('/').pop() || ''; }

function compareInfo(a, b) {
  if (a.num != null && b.num != null) {
    if (a.num !== b.num) return a.num - b.num;
    return natCompare(a.name, b.name);
  }
  if (a.num != null) return -1;
  if (b.num != null) return 1;
  return natCompare(a.name, b.name);
}

// ---------------------------------------------------------------------------
// DOM 辅助：从带 data-path 的元素反查「条目元素」
// ---------------------------------------------------------------------------
function itemElementOf(de) {
  const cls = de.classList;
  if (cls && (cls.contains('tree-item') || cls.contains('nav-file') || cls.contains('nav-folder'))) {
    return de;
  }
  const t = de.closest ? de.closest('.tree-item') : null;
  if (t) return t;
  return de.parentElement;
}

function nameOf(de, itemEl) {
  const p = de.getAttribute('data-path') || (itemEl && itemEl.getAttribute('data-path')) || '';
  if (p) return basename(p).replace(/\.[A-Za-z0-9]+$/, '');
  const t = (itemEl || de).querySelector
    ? (itemEl || de).querySelector('.tree-item-inner, .nav-file-title-content, .nav-folder-title-content')
    : null;
  return t ? String(t.textContent || '').trim() : '';
}

function isFolderEl(itemEl, path) {
  const cls = itemEl.classList;
  if (cls) {
    if (cls.contains('nav-folder')) return true;
    if (cls.contains('nav-file')) return false;
  }
  return !/\.[A-Za-z0-9]+$/.test(String(path || ''));
}

// ---------------------------------------------------------------------------
// 插件主体
// ---------------------------------------------------------------------------
class CNNaturalSort extends Plugin {
  onload() {
    this.container = null;
    this.observer = null;
    this._timer = null;
    this._retries = 0;
    try { new Notice('中文自然排序已加载'); } catch (e) { /* ignore */ }

    this.app.workspace.onLayoutReady(() => this.start());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.schedule()));

    this.addCommand({
      id: 'resort',
      name: '重新按中文自然排序整理',
      callback: () => {
        const r = this.resortAll();
        if (r) new Notice(`已整理：${r.moved} 个目录 / ${r.items} 项`);
        else new Notice('未找到文件浏览器容器');
      },
    });
    this.addCommand({
      id: 'diagnose',
      name: '诊断：输出当前文件浏览器顺序',
      callback: () => this.diagnose(),
    });
    this.addRibbonIcon('sort-asc', '中文自然排序：点击强制整理', () => {
      const r = this.resortAll();
      if (r) new Notice(`已整理：${r.moved} 个目录 / ${r.items} 项`);
    });
    this.register(() => this.stop());
  }

  // 找到文件浏览器的容器；若尚未打开，做有限重试
  start() {
    const leaves = this.app.workspace.getLeavesOfType('file-explorer') || [];
    const view = leaves.length ? leaves[0].view : null;
    const container = view && view.containerEl ? view.containerEl : null;
    if (!container) {
      if (this._retries < 20) { this._retries++; setTimeout(() => this.start(), 300); }
      return;
    }
    this.container = container;
    if (!this.observer) {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(container, { childList: true, subtree: true });
    }
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
    const container = this.container || this.findContainer();
    if (!container) return null;

    // 按「父元素 = 子项容器」分组，不依赖具体类名
    const groups = new Map();
    const dataEls = container.querySelectorAll('[data-path]');
    for (const de of Array.from(dataEls)) {
      const item = itemElementOf(de);
      if (!item || !item.parentElement) continue;
      const parent = item.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push({ de, el: item });
    }

    let containers = 0, items = 0, moved = 0;
    for (const [parent, list] of groups) {
      if (list.length < 2) continue;
      containers++; items += list.length;
      const infos = list.map((o) => {
        const path = o.de.getAttribute('data-path') || '';
        const name = nameOf(o.de, o.el);
        return { el: o.el, name, num: extractNum(name), folder: isFolderEl(o.el, path) };
      });
      const folders = infos.filter((x) => x.folder).sort(compareInfo);
      const files = infos.filter((x) => !x.folder).sort(compareInfo);
      const desired = folders.concat(files).map((x) => x.el);
      const current = Array.from(parent.children);
      // 已有序则不动，避免产生无谓的 DOM 变更触发循环
      if (current.length === desired.length && desired.every((el, i) => current[i] === el)) continue;
      desired.forEach((el) => parent.appendChild(el));
      moved++;
    }
    return { containers, items, moved };
  }

  findContainer() {
    const leaves = this.app.workspace.getLeavesOfType('file-explorer') || [];
    const view = leaves.length ? leaves[0].view : null;
    return view && view.containerEl ? view.containerEl : null;
  }

  // 诊断：把当前文件浏览器里所有条目的显示顺序打印出来，便于确认插件是否真的在工作
  diagnose() {
    const container = this.container || this.findContainer();
    if (!container) { new Notice('未找到文件浏览器'); return; }
    const groups = new Map();
    const dataEls = container.querySelectorAll('[data-path]');
    for (const de of Array.from(dataEls)) {
      const item = itemElementOf(de);
      if (!item || !item.parentElement) continue;
      const parent = item.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(nameOf(de, item));
    }
    let lines = [];
    for (const [, names] of groups) {
      if (names.length < 2) continue;
      lines.push(names.slice(0, 12).join(' | '));
      if (lines.length >= 3) break;
    }
    const msg = lines.length ? lines.join('\n—\n') : '未找到可排序的目录';
    try { new Notice(msg, 20000); } catch (e) { /* ignore */ }
    console.log('[CN Natural Sort] 当前顺序:\n' + msg);
  }
}

module.exports = CNNaturalSort;
// 兼容 ESM default 导入
module.exports.default = CNNaturalSort;
// 暴露纯函数，便于在 Node 下做单元测试
module.exports.cnToInt = cnToInt;
module.exports.extractNum = extractNum;
module.exports.natCompare = natCompare;
module.exports.itemElementOf = itemElementOf;
module.exports.nameOf = nameOf;
