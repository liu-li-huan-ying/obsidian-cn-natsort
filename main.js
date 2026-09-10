/*
 * CN Natural Sort — Obsidian 社区插件
 * 让文件浏览器按「中文感知的自然顺序」排序：第一章/第十章、（一）（二）、第一单元、
 * Lecture 2/9/10、Part II/X、v1.2/v1.10 全部按数值序而非字典序。不改名、不改内容、零配置。
 *
 * ── 为什么 v1.1 起不再碰 DOM ──────────────────────────────────────────────
 * v1.0 用 appendChild 重排 DOM，会破坏文件浏览器虚拟滚动（infinityScroll 的 pusherEl
 * 必须留在最后），导致展开/折叠失效。v1.1 改为接管 Obsidian 自己的唯一排序出口
 * FileExplorerView.getSortedFolderItems(folder)：只把返回的数组原地重排一次，Obsidian
 * 照常建树、照常虚拟滚动 —— 零 DOM 改动，原生交互全部保留。
 *
 * ── v1.2 算法重构：从「补丁式序号识别」升级为「token 化分段比较」 ─────────
 * 旧实现只对文件名整体抽「第一个序号」再上浮，遇到多级序号（如「笔记（二）：第一单元」
 * 内部还有序号）、罗马数字、阿拉伯数字与中文数字混排时无从下手，只能一个 bug 一个补丁。
 *
 * 新实现把每个文件名切成一组交替的 token，再逐段比较：
 *
 *   数值段（n:1）   —— 阿拉伯数字 / 中文数字 / 受控罗马数字，统一归一为数值 v。
 *   文本段（n:0）   —— 其余字符（含纯中文、英文单词、标点、空格）。
 *
 *   1. 同为数值段    -> 按数值比（2 < 9 < 10 < 十二 < X）。
 *   2. 同为文本段    -> 交给 Intl.Collator（中文拼音、忽略大小写，与 Obsidian 原生同款）。
 *   3. 数值 vs 文本  -> 数值段排前（与数字字符 < 字母的直觉一致）。
 *   4. 前段全相等    -> 继续比下一段 —— 因此「笔记（二）：第二单元」天然排在
 *      「笔记（二）：第一单元」之后（外层序号相同后，内层继续按数值比），
 *      这是整体抽首个序号的旧做法做不到的层级正确性。
 *
 * 这样「第三章」与「第 3 章」、中文与阿拉伯、一层与二层序号都能按人类直觉混排。
 *
 * ── 已知边界（README 有完整说明） ────────────────────────────────────────
 * 中文数字是否被当作「数字」取决于语境：
 *   - 「第X…」「X、」「（X）」「笔记一」「第一章」这类序号形态 -> 数字；
 *   - 被汉字夹住的普通词（三体、二手、万一、万有引力）-> 按拼音当文本，
 *     避免「三体」被拆成「数字3 + 体」。
 * 罗马数字仅识别大写、且带分隔/括号/「Chapter|Part|Unit…」前缀词等序号语境的词，
 * 以避免把 CLI、DLL、XML、CIVIL 这类恰好由罗马字符组成的技术缩写误当数字。
 */

const { Plugin, Notice } = require('obsidian');

// ---------------------------------------------------------------------------
// 汉字数字 -> 整数（支持简/繁/大写/廿卅卌）
// ---------------------------------------------------------------------------
const CN_DIGITS = {
  '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '俩': 2, '三': 3, '仨': 3,
  '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9,
  '皕': 200,
};
const CN_SMALL = { '十': 10, '百': 100, '千': 1000, '拾': 10, '佰': 100, '仟': 1000 };
const CN_BIG = { '万': 1e4, '萬': 1e4, '亿': 1e8, '億': 1e8 };
const CN_RUN_CHARS = new Set(
  Object.keys(CN_DIGITS).concat(Object.keys(CN_SMALL), Object.keys(CN_BIG), ['廿', '卅', '卌'])
);

function has(map, k) { return Object.prototype.hasOwnProperty.call(map, k); }

function cnToInt(s) {
  s = String(s);
  if (!s) return null;
  const chars = [...s];

  // A) 纯「数字字」串（不含任何单位）-> 十进制数位累加
  //    一九九九=1999、二〇二四=2024、一〇〇=100、壹贰叁=123、三五=35
  //    旧实现直接覆盖 num，导致「一九九九」只剩 9，年份全错。
  if (chars.every((c) => has(CN_DIGITS, c))) {
    let acc = 0;
    for (const c of chars) acc = acc * 10 + CN_DIGITS[c];
    return acc;
  }

  // B) 含单位的复合数值
  let total = 0, section = 0, num = 0, lastUnit = 0, explicitZero = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (has(CN_DIGITS, ch)) {
      if (CN_DIGITS[ch] === 0) explicitZero = true; // 「三百零五」显式写了零，别再补位
      num = CN_DIGITS[ch];
    } else if (ch === '廿' || ch === '卅' || ch === '卌') {
      // 廿=20 卅=30 卌=40，本身等于「数字×十」
      section += ch === '廿' ? 20 : ch === '卅' ? 30 : 40;
      num = 0;
      lastUnit = 10;
    } else if (has(CN_SMALL, ch)) {
      const u = CN_SMALL[ch];
      if (num === 0 && section === 0) num = 1; // 「十」=1×10、「百二十三」=123，前导单位视作系数 1
      section += num * u;
      num = 0;
      lastUnit = u;
    } else if (has(CN_BIG, ch)) {
      // 「万一」「亿分」这类语素保护：万/亿前无系数、后面还跟数字 -> 不是数字串
      if (num === 0 && section === 0 && i !== chars.length - 1) return null;
      section = (section + num) * CN_BIG[ch];
      total += section;
      section = 0;
      num = 0;
      lastUnit = CN_BIG[ch];
    } else {
      return null; // 遇到非数字汉字（第/abc 等）视为非法
    }
  }

  let v = total + section;
  if (num > 0) {
    // 尾位省略：三百二 = 三百二十 = 320；一万二 = 一万二千 = 12000。
    // 但显式写了「零」时不补位：三百零二 = 302（否则两者会撞成同一个值）。
    v += (lastUnit > 1 && !explicitZero) ? num * (lastUnit / 10) : num;
  }
  // 解析出 0 且串里没有任何数字字（如孤立的 万/亿/百/千）-> 无效
  if (v === 0 && !/[零〇一二两俩三四五六七八九仨壹贰叁肆伍陆柒捌玖皕]/.test(s)) return null;
  return v;
}

// ---------------------------------------------------------------------------
// 罗马数字 -> 整数（严格校验，排除 IVI/CIVIL 这类不合法写法）
// ---------------------------------------------------------------------------
const ROMAN_VAL = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
// 恰好由罗马字母组成、但几乎不会用作序号的技术缩写/英文词，避免误伤
const ROMAN_STOP = new Set(['XML', 'CLI', 'CMD', 'DLL', 'MIX', 'XL', 'CD', 'MC']);

function romanToInt(w) {
  if (!/^[IVXLCDM]+$/.test(w)) return null;
  let total = 0;
  for (let i = 0; i < w.length; i++) {
    const c = w[i], v = ROMAN_VAL[c], nc = w[i + 1];
    if (i >= 3 && c === w[i - 1] && c === w[i - 2] && c === w[i - 3]) return null; // IIII 等四连
    if (i >= 1 && c === w[i - 1] && (c === 'V' || c === 'L' || c === 'D')) return null; // VV/LL/DD
    if (nc) {
      const nv = ROMAN_VAL[nc];
      if (nv > v) {
        // 减法位规则：I 只能减 V/X，X 只能减 L/C，C 只能减 D/M
        const ok = (c === 'I' && (nc === 'V' || nc === 'X'))
          || (c === 'X' && (nc === 'L' || nc === 'C'))
          || (c === 'C' && (nc === 'D' || nc === 'M'));
        if (!ok) return null;
        total += nv - v;
        i++; // 成对消费
        continue;
      }
    }
    total += v;
  }
  return total;
}

// 跟在罗马数字前、构成「序数前缀词 + 罗马」的英文前缀
const ROMAN_PREFIX = new Set([
  'chapter', 'ch', 'part', 'pt', 'unit', 'lecture', 'lesson', 'section', 'sec',
  'episode', 'ep', 'book', 'volume', 'vol', 'act', 'scene', 'step', 'phase',
  'level', 'stage', 'module', 'topic', 'week', 'day', 'season', 'series',
  'session', 'no', 'num', 'ex', 'exercise', 'lab', 'homework',
]);

const isCJK = (ch) => !!ch && /[\u2E80-\u2FDF\u3005-\u3007\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(ch);
// 紧跟在连续「数字字」之后时能坐实「这是年份/编号」的时间/序列单位
const TIME_UNIT = /^[年月日号期版季周天时分秒旬世载卷章回节篇册集页部届遍]$/;
// 罗马数字后的合法收尾：行尾或标点/括号（不含空格，避免误伤 "I have a dream"）
const ROMAN_AFTER = /^[.,，。．、;；:：!！?？\-–—_/\\|()（）\[\]【\]{}<>《》「」『』"'']$/;

// ---------------------------------------------------------------------------
// token 化：文件名 -> [ {n:1,v,s} 数值段 | {n:0,s} 文本段 ]
// ---------------------------------------------------------------------------
// 全角 ASCII（含全角数字 １２３、全角空格）归一到半角：
// 否则「１２３」会被当成普通文本排在数值区之后，与「123」永远不相邻。
const HAS_WIDE = /[\uFF01-\uFF5E\u3000]/;
const WIDE_RE = /[\uFF01-\uFF5E]/g;
function normalizeWidth(s) {
  return HAS_WIDE.test(s)
    ? s.replace(WIDE_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ')
    : s;
}

function naturalKey(name) {
  if (name == null) name = '';
  name = normalizeWidth(name);
  const key = [];
  let lit = '';
  const flush = () => { if (lit) { key.push({ n: 0, s: lit }); lit = ''; } };
  const len = name.length;

  for (let i = 0; i < len; ) {
    const code = name.charCodeAt(i);

    // 1) 阿拉伯数字
    if (code >= 0x30 && code <= 0x39) {
      let j = i;
      while (j < len) { const c = name.charCodeAt(j); if (c >= 0x30 && c <= 0x39) j++; else break; }
      const s = name.slice(i, j);
      flush();
      key.push({ n: 1, v: Number(s), s });
      i = j;
      continue;
    }

    // 2) 中文数字串
    const ch = name[i];
    if (CN_RUN_CHARS.has(ch)) {
      let j = i;
      while (j < len && CN_RUN_CHARS.has(name[j])) j++;
      const run = name.slice(i, j);
      const prev = i > 0 ? name[i - 1] : '';
      const next = j < len ? name[j] : '';
      const atStart = i === 0;
      const prevCJK = isCJK(prev), nextCJK = isCJK(next);

      const chars = [...run];
      const allDigits = chars.every((c) => has(CN_DIGITS, c));

      let treat = false;
      if (allDigits && chars.length >= 3 && TIME_UNIT.test(next)) {
        // 年份/编号写法：连续 3 个以上「数字字」且后面紧跟时间单位（二〇二四年、一九九九年第X季度）。
        // 刻意收得很窄：只看「连续数字」是不够的，会把「七七八八」「三三两两」这类
        // 全由数字字组成的成语误拆成 7788 / 3322。行尾或分隔符后的数字字串由下面的
        // 原始规则处理即可（一九九九、 （一九九九） 本就能识别）。
        treat = true;
      } else if (prev === '第') {
        treat = true;                 // 「第X章/节/单元…」：即便被汉字夹住也是序数
      } else if (atStart && nextCJK) {
        treat = false;                // 「三体/二手/万一/万有引力」：普通词，不拆数字
      } else if (!prevCJK || !nextCJK) {
        treat = true;                 // 「一、」「（一）」「笔记一」「1 前后」「一 基础」等
      } // 其余：被汉字夹住且不在开头 -> 文本

      if (treat) {
        const v = cnToInt(run);
        if (v != null) {
          flush();
          key.push({ n: 1, v, s: run });
          i = j;
          continue;
        }
      }
      lit += name.slice(i, j);
      i = j;
      continue;
    }

    // 3) 拉丁词（大写纯罗马候选，受语境约束）
    if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) {
      let j = i;
      while (j < len) {
        const c = name.charCodeAt(j);
        if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) j++; else break;
      }
      const w = name.slice(i, j);
      if (/^[IVXLCDM]+$/.test(w) && !ROMAN_STOP.has(w)) {
        const v = romanToInt(w);
        if (v != null) {
          const prev = i > 0 ? name[i - 1] : '';
          const next = j < len ? name[j] : '';
          const atStart = i === 0;
          const afterOpener = /^[([（【]$/.test(prev);
          const nextEnd = next === '';
          const nextSep = !!next && ROMAN_AFTER.test(next);
          const nextSpace = next === ' ';
          // 「罗马 + 空格 + …」：空格后是中文/分隔符/行尾则多半是序号（II 基础、X - 结语），
          // 空格后紧跟英文则多半是英文句子（I have a dream），不算。
          let latinAfterSpace = false;
          if (nextSpace) {
            let k = j;
            while (k < len && name[k] === ' ') k++;
            latinAfterSpace = /[A-Za-z]/.test(name[k]);
          }
          const prevCJK = isCJK(prev);

          let prefix = false;
          if (!atStart && !afterOpener && !prevCJK) {
            const before = name.slice(0, i);
            const mw = /([A-Za-z]+)\s*$/.exec(before);
            if (mw) {
              const gap = before.slice(mw.index + mw[1].length);
              if (/^\s*$/.test(gap) && ROMAN_PREFIX.has(mw[1].toLowerCase())) prefix = true;
            }
          }

          // 序号语境：行首+收尾 / 括号内 / 「前缀词 + 空格」后 / 汉字后紧接
          const romanOK = (atStart && (nextEnd || nextSep || (nextSpace && !latinAfterSpace)))
            || (afterOpener && (nextEnd || nextSep))
            || (prefix && (nextEnd || nextSep || nextSpace))
            || (prevCJK && (nextEnd || nextSep));
          if (romanOK) {
            flush();
            key.push({ n: 1, v, s: w });
            i = j;
            continue;
          }
        }
      }
      lit += w;
      i = j;
      continue;
    }

    lit += ch;
    i++;
  }
  flush();
  return key;
}

// ---------------------------------------------------------------------------
// 比较器
// ---------------------------------------------------------------------------
// 与 Obsidian 一致的兜底比较器（拼音、忽略大小写、数字感知）
const collator = new Intl.Collator(undefined, { usage: 'sort', sensitivity: 'base', numeric: true });
const keyCache = new Map();
function cachedKey(name) {
  let k = keyCache.get(name);
  if (k === undefined) { k = naturalKey(name); keyCache.set(name, k); }
  return k;
}

const codePointCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function compareKeys(ka, kb) {
  const L = Math.min(ka.length, kb.length);
  // collator 是 sensitivity:'base'，会把 "V"/"v"、"CH"/"Ch" 判为相等。此时若立刻用码点兜底，
  // 就会在还没比到后面的数值段前先按大小写分出胜负（导致 V1.10 排在 v1.2 之前）。
  // 所以把这种「仅写法之别」的次序暂存起来，等所有语义段都比完仍无结果时才用上。
  let tie = 0;
  for (let i = 0; i < L; i++) {
    const A = ka[i], B = kb[i];
    if (A.n !== B.n) return A.n === 1 ? -1 : 1; // 数值段排在文本段前
    if (A.n === 1) {
      if (A.v !== B.v) return A.v < B.v ? -1 : 1;
      if (A.s !== B.s) {
        const c = collator.compare(A.s, B.s);
        if (c) return c;
        if (!tie) tie = codePointCmp(A.s, B.s);
      }
      continue;
    }
    const c = collator.compare(A.s, B.s);
    if (c) return c;
    if (A.s !== B.s && !tie) tie = codePointCmp(A.s, B.s);
  }
  if (ka.length !== kb.length) return ka.length < kb.length ? -1 : 1; // 前缀短者在前
  return tie;
}

function compareNames(na, nb) {
  if (na === nb) return 0;
  const c = compareKeys(cachedKey(na), cachedKey(nb));
  if (c) return c;
  return codePointCmp(na, nb); // 全部段等价（如 第1章 vs 第一章）时给出稳定全序
}

// ---------------------------------------------------------------------------
// 条目比较：文件夹在前 -> token 自然序
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
  return compareNames(itemName(a), itemName(b));
}

function hasNumeral(name) {
  const k = cachedKey(name);
  for (let i = 0; i < k.length; i++) if (k[i].n === 1) return true;
  return false;
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
    if (!Array.isArray(items) || items.length < 2) return items;
    // 尊重 Obsidian 原生排序设置：只有「按文件名字母序」时才接管。
    // 用户选了按修改时间 / 创建时间排序时不插手 —— 否则会静默覆盖原生功能。
    const order = String((this && this.sortOrder) || '');
    if (order && !/alphabetical/i.test(order)) return items;
    items.sort(/reverse/i.test(order) ? (a, b) => compareItems(b, a) : compareItems);
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
        if (this.resort()) new Notice('CN Natural Sort：已重新整理');
        else new Notice('CN Natural Sort：未找到文件浏览器');
      },
    });
    this.addCommand({
      id: 'diagnose',
      name: '诊断：输出当前排序（到控制台与提示）',
      callback: () => this.diagnose(),
    });
    this.addRibbonIcon('sort-asc', 'CN Natural Sort：重新整理', () => {
      if (this.resort()) new Notice('CN Natural Sort：已重新整理');
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
        new Notice('CN Natural Sort：当前 Obsidian 版本不兼容（找不到排序入口）', 8000);
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
    // 挑一个含数字序号的文件，验证自然序是否真的生效
    const target = root.children
      .filter((c) => Array.isArray(c.children))
      .find((c) => c.children.some((f) => hasNumeral(f.name)));
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
module.exports.romanToInt = romanToInt;
module.exports.naturalKey = naturalKey;
module.exports.compareKeys = compareKeys;
module.exports.compareNames = compareNames;
module.exports.hasNumeral = hasNumeral;
module.exports.compareItems = compareItems;
module.exports.itemName = itemName;
module.exports.isFolderFile = isFolderFile;
module.exports.patchSort = patchSort;
module.exports.unpatchSort = unpatchSort;
module.exports.ORIG_FLAG = ORIG_FLAG;
