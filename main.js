/*
 * 中文自然排序 (CN Natural Sort) — Obsidian 社区插件
 * 让文件浏览器按「第X章 / 第X节」等中文数字自然排序，无需改名、不改内容、不写配置。
 *
 * ── 为什么 v1.1 不再碰 DOM ──────────────────────────────────────────────
 * v1.0 的做法是拿到 DOM 节点后 appendChild 重排。这在文件浏览器上行不通：
 * 1. 文件浏览器是「虚拟滚动」的（内部 infinityScroll），容器里有一个 1px 的
 *    pusherEl 撑高元素，它必须留在最后；appendChild 会把它顶到最前面，
 *    滚动高度计算与条目回收全部错乱 → 点击展开/折叠失效。
 * 2. 视口外的条目根本不在 DOM 里，重排的只是局部，滚动回来又乱。
 *
 * v1.1 改为「接管 Obsidian 自己的排序入口」：
 * FileExplorerView.getSortedFolderItems(folder) 是根目录与每一个子文件夹
 * 共用的唯一排序出口，返回建树用的条目数组。我们只把它返回的数组按中文
 * 自然序重排一次，Obsidian 照常建树、照常虚拟滚动 —— 全程零 DOM 改动，
 * 展开/折叠、拖拽、键盘导航、滚动位置全部保持原生行为。
 */
const { Plugin, Notice } = require('obsidian');

// ---------------------------------------------------------------------------
// 汉字数字 -> 整数
// ---------------------------------------------------------------------------
const CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const CN_UNITS = { '十': 10, '百': 100, '千': 1000 };

function cnToInt(s) {
  let total = 0, sec = 0;
  for (const ch of String(s)) {
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
      sec = CN_DIGITS[ch];
    } else if (Object.prototype.hasOwnProperty.call(CN_UNITS, ch)) {
      total += (sec || 1) * CN_UNITS[ch];
      sec = 0;
    } else if (ch === '万') {
      total = (total + sec) * 10000;
      sec = 0;
    } else if (ch === '亿') {
      total = (total + sec) * 100000000;
      sec = 0;
    } else {
      return null;
    }
  }
  return total + sec;
}

// 「第X章」「一、绪论」这类中文序号 -> 整数；识别不出返回 null
const RE_CHAPTER = /第\s*([零〇一二两三四五六七八九十百千万亿]+)\s*[章节卷篇回部节集]/;
const RE_LEADING = /^\s*([零〇一二两三四五六七八九十百千万亿]+)\s*[、.．,，:：\s]/;

function cnOrder(name) {
  if (!name) return null;
  let m = name.match(RE_CHAPTER);
  if (m) { const n = cnToInt(m[1]); if (n != null) return n; }
  m = name.match(RE_LEADING);
  if (m) { const n = cnToInt(m[1]); if (n != null) return n; }
  return null;
}

// 与 Obsidian 完全一致的兜底比较器（它在 app.asar 里用的就是这个）
const collator = new Intl.Collator(undefined, { usage: 'sort', sensitivity: 'base', numeric: true });

// ---------------------------------------------------------------------------
// 条目比较：文件夹在前 -> 中文序号 -> 兜底原生比较
// ---------------------------------------------------------------------------
function isFolderFile(f) { return !!(f && Array.isArray(f.children)); }

function itemName(item) {
  if (!item) return '';
  if (item.file && item.file.name) return item.file.name;
  return String(item.name || item.title || '');
}

function compareItems(a, b) {
  const fa = isFolderFile(a && a.file), fb = isFolderFile(b && b.file);
  if (fa !== fb) return fa ? -1 : 1;

  const na = itemName(a), nb = itemName(b);
  const ka = cnOrder(na), kb = cnOrder(nb);
  if (ka != null && kb != null) {
    if (ka !== kb) return ka - kb;
    return collator.compare(na, nb);
  }
  if (ka != null) return -1;
  if (kb != null) return 1;
  return collator.compare(na, nb);
}

// ---------------------------------------------------------------------------
// 接管 FileExplorerView.getSortedFolderItems
// ---------------------------------------------------------------------------
const PATCH_FLAG = '__cnNatSortPatched';
const ORIG_FLAG = '__cnNatSortOriginal';

function patchSort(holder) {
  if (!holder || holder[PATCH_FLAG]) return false;
  const original = holder.getSortedFolderItems;
  if (typeof original !== 'function' || original[ORIG_FLAG]) return false;

  const patched = function (folder) {
    const items = original.call(this, folder);
    if (Array.isArray(items) && items.length > 1) {
      // 原数组就是建树用的顺序，原地重排即可，不改变其内容
      items.sort(compareItems);
    }
    return items;
  };
  patched[ORIG_FLAG] = original;

  holder.getSortedFolderItems = patched;
  holder[PATCH_FLAG] = true;
  return true;
}

function unpatchSort(holder) {
  if (!holder || !holder[PATCH_FLAG]) return false;
  const current = holder.getSortedFolderItems;
  if (current && current[ORIG_FLAG]) holder.getSortedFolderItems = current[ORIG_FLAG];
  delete holder[PATCH_FLAG];
  return true;
}

// ---------------------------------------------------------------------------
// 插件主体
// ---------------------------------------------------------------------------
class CNNaturalSort extends Plugin {
  onload() {
    this._holder = null;
    this._retries = 0;
    this._warned = false;

    // 文件增删改时 Obsidian 自己会调 requestSort，这里只需负责接管 + 首次重排
    this.app.workspace.onLayoutReady(() => this.install());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.install()));

    this.addCommand({
      id: 'resort',
      name: '重新按中文自然排序整理',
      callback: () => {
        if (this.resort()) new Notice('中文自然排序：已重新整理');
        else new Notice('中文自然排序：未找到文件浏览器');
      },
    });
    this.addCommand({
      id: 'diagnose',
      name: '诊断：输出当前排序（到控制台与提示）',
      callback: () => this.diagnose(),
    });
    this.addRibbonIcon('sort-asc', '中文自然排序：重新整理', () => {
      if (this.resort()) new Notice('中文自然排序：已重新整理');
    });
  }

  onunload() {
    if (this._holder) unpatchSort(this._holder);
    this._holder = null;
    const view = this.fileExplorerView();
    if (view) this.resort();
  }

  fileExplorerView() {
    const leaves = this.app.workspace.getLeavesOfType('file-explorer') || [];
    return leaves.length ? leaves[0].view : null;
  }

  // 拿到文件浏览器后，把排序入口换成我们的实现
  install() {
    if (this._holder) return true;
    const view = this.fileExplorerView();
    if (!view) {
      if (this._retries < 40) { this._retries++; setTimeout(() => this.install(), 250); }
      return false;
    }
    // 方法在原型上（新开的窗口也会走同一份原型，一次patch终身生效）
    const holder = typeof view.getSortedFolderItems === 'function'
      ? (Object.getPrototypeOf(view) && typeof Object.getPrototypeOf(view).getSortedFolderItems === 'function'
        ? Object.getPrototypeOf(view)
        : view)
      : null;
    if (!patchSort(holder)) {
      if (!this._warned) {
        this._warned = true;
        new Notice('中文自然排序：当前 Obsidian 版本不兼容（找不到排序入口）', 8000);
        console.error('[CN Natural Sort] 找不到 FileExplorerView.getSortedFolderItems，无法接管排序');
      }
      return false;
    }
    this._holder = holder;
    this.resort();
    return true;
  }

  // 让 Obsidian 自己重排一次（它内置的 requestSort 带 20ms 防抖）
  resort() {
    const view = this.fileExplorerView();
    if (!view) return false;
    try {
      if (typeof view.requestSort === 'function') view.requestSort();
      else if (typeof view.sort === 'function') view.sort();
      else return false;
    } catch (e) {
      console.error('[CN Natural Sort] 重排失败', e);
      return false;
    }
    return true;
  }

  diagnose() {
    const view = this.fileExplorerView();
    if (!view) { new Notice('未找到文件浏览器'); return; }
    if (typeof view.getSortedFolderItems !== 'function') {
      new Notice('当前版本没有 getSortedFolderItems，插件未接管');
      return;
    }
    const lines = [];
    const root = this.app.vault.getRoot();
    const dump = (label, folder) => {
      try {
        const names = view.getSortedFolderItems(folder).map(itemName);
        if (names.length > 1) lines.push(`${label}（${names.length}）: ${names.slice(0, 12).join(' | ')}`);
      } catch (e) { /* 单个目录出错不影响其余输出 */ }
    };
    dump('根目录', root);
    // 挑一个含「第X章」的文件夹，验证中文序是否真的生效
    const target = root.children
      .filter((c) => Array.isArray(c.children))
      .find((c) => c.children.some((f) => cnOrder(f.name) != null));
    if (target) dump(target.path, target);

    const msg = lines.length ? lines.join('\n—\n') : '未找到可排序的目录';
    try { new Notice(msg, 20000); } catch (e) { /* ignore */ }
    console.log('[CN Natural Sort] 当前顺序:\n' + msg);
    return msg;
  }
}

module.exports = CNNaturalSort;
// 兼容 ESM default 导入
module.exports.default = CNNaturalSort;
// 暴露纯函数，便于在 Node 下做单元测试
module.exports.cnToInt = cnToInt;
module.exports.cnOrder = cnOrder;
module.exports.compareItems = compareItems;
module.exports.itemName = itemName;
module.exports.isFolderFile = isFolderFile;
module.exports.patchSort = patchSort;
module.exports.unpatchSort = unpatchSort;
module.exports.ORIG_FLAG = ORIG_FLAG;
