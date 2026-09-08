/*
 * CN Natural Sort 单元测试（Node 下运行，不依赖 Obsidian）
 *   node test/run-tests.js
 */
const Module = require('module');
const path = require('path');
const assert = require('assert');

// 用桩替换 obsidian 模块
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') {
    return { Plugin: class Plugin {}, Notice: class Notice {} };
  }
  return origLoad.apply(this, arguments);
};

const P = require(path.join(__dirname, '..', 'main.js'));
const { cnToInt, cnOrder, compareItems, isFolderFile, itemName, patchSort, unpatchSort, ORIG_FLAG } = P;

let passed = 0;
function it(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('\n[1] 汉字数字 -> 整数');
it('一=1 二=2 九=9', () => {
  assert.strictEqual(cnToInt('一'), 1);
  assert.strictEqual(cnToInt('二'), 2);
  assert.strictEqual(cnToInt('九'), 9);
});
it('十=10 十一=11 二十=20 二十一=21', () => {
  assert.strictEqual(cnToInt('十'), 10);
  assert.strictEqual(cnToInt('十一'), 11);
  assert.strictEqual(cnToInt('二十'), 20);
  assert.strictEqual(cnToInt('二十一'), 21);
});
it('一百=100 一百零五=105 一百二十三=123', () => {
  assert.strictEqual(cnToInt('一百'), 100);
  assert.strictEqual(cnToInt('一百零五'), 105);
  assert.strictEqual(cnToInt('一百二十三'), 123);
});
it('两=2 一万二千=12000', () => {
  assert.strictEqual(cnToInt('两'), 2);
  assert.strictEqual(cnToInt('一万二千'), 12000);
});
it('非法输入返回 null', () => {
  assert.strictEqual(cnToInt('第'), null);
  assert.strictEqual(cnToInt('abc'), null);
});

console.log('\n[2] 名称 -> 中文序号');
it('第X章 识别', () => {
  assert.strictEqual(cnOrder('第一章 读书笔记'), 1);
  assert.strictEqual(cnOrder('第十章'), 10);
  assert.strictEqual(cnOrder('第四十七章'), 47);
  assert.strictEqual(cnOrder('第一百零八回'), 108);
});
it('「一、绪论」这类前置序号识别', () => {
  assert.strictEqual(cnOrder('一、绪论'), 1);
  assert.strictEqual(cnOrder('十一、总结'), 11);
});
it('阿拉伯数字与英文不归为「中文序号」（交给原生 collator 处理）', () => {
  assert.strictEqual(cnOrder('Lecture 10'), null);
  assert.strictEqual(cnOrder('第10章'), null);
  assert.strictEqual(cnOrder('12. 引言'), null);
});
it('不以中文数字开头的普通中文名不误判', () => {
  assert.strictEqual(cnOrder('万有引力'), null);
  assert.strictEqual(cnOrder('三体'), null);
  assert.strictEqual(cnOrder('读书笔记'), null);
});
it('全角/半角括号包裹的中文数字识别（笔记（一）系列）', () => {
  assert.strictEqual(cnOrder('笔记（一）：导学与准备篇'), 1);
  assert.strictEqual(cnOrder('笔记（二）：第一单元·基础剪辑全流程'), 2);
  assert.strictEqual(cnOrder('笔记（三）：第二单元·专业工具篇'), 3);
  assert.strictEqual(cnOrder('笔记（四）：第三单元·复刻实战篇'), 4);
  // 半角括号
  assert.strictEqual(cnOrder('章节(一)'), 1);
  // 取首个匹配
  assert.strictEqual(cnOrder('随笔（三十）个样本'), 30);
});

console.log('\n[3] 条目排序');
const file = (name) => ({ file: { name, extension: 'md' } });
const folder = (name) => ({ file: { name, children: [] } });

it('第X章 按数字升序（而非码点序）', () => {
  const items = ['第三章', '第一章', '第十章', '第二章', '第七章'].map(file);
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, ['第一章', '第二章', '第三章', '第七章', '第十章']);
});
it('文件夹排在文件之前', () => {
  const items = [file('第一章'), folder('乙目录'), file('第二章'), folder('甲目录')];
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, ['甲目录', '乙目录', '第一章', '第二章']);
});
it('英文 Lecture 数字保持自然序（2 < 9 < 10）', () => {
  const items = ['Lecture 10', 'Lecture 2', 'Lecture 9'].map(file);
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, ['Lecture 2', 'Lecture 9', 'Lecture 10']);
});
it('中文序号整体上浮，其余按原生序兜底', () => {
  const items = [file('附录'), file('第三章'), file('第二章'), file('笔记')];
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got.slice(0, 2), ['第二章', '第三章']);
});
it('「笔记（一/二/三/四）」按数值升序（不再是拼音序）', () => {
  const items = [
    file('笔记（一）：导学与准备篇'),
    file('笔记（二）：第一单元·基础剪辑全流程'),
    file('笔记（三）：第二单元·专业工具篇'),
    file('笔记（四）：第三单元·复刻实战篇'),
  ];
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, [
    '笔记（一）：导学与准备篇',
    '笔记（二）：第一单元·基础剪辑全流程',
    '笔记（三）：第二单元·专业工具篇',
    '笔记（四）：第三单元·复刻实战篇',
  ]);
});
it('排序稳定且自反', () => {
  const items = ['第十章', '第一章', '第二章'].map(file);
  const once = items.slice().sort(compareItems).map(itemName);
  const twice = items.slice().sort(compareItems).sort(compareItems).map(itemName);
  assert.deepStrictEqual(once, twice);
  assert.deepStrictEqual(once, ['第一章', '第二章', '第十章']);
});
it('isFolderFile 判定', () => {
  assert.strictEqual(isFolderFile(folder('a').file), true);
  assert.strictEqual(isFolderFile(file('a').file), false);
  assert.strictEqual(isFolderFile(undefined), false);
});

console.log('\n[4] 接管排序入口');
function makeHolder(order) {
  return {
    getSortedFolderItems(folder) {
      return (folder.children || []).slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    _order: order,
  };
}
it('patch 后返回数组被重排为第X章升序', () => {
  const holder = makeHolder();
  const obj = (n) => ({ name: n });
  const fakeFolder = { children: ['第三章', '第一章', '第十章', '第二章'].map(obj) };
  const before = holder.getSortedFolderItems(fakeFolder).map((o) => o.name);
  assert.deepStrictEqual(before, ['第一章', '第三章', '第二章', '第十章']); // 码点序，乱的

  assert.strictEqual(patchSort(holder), true);
  const after = holder.getSortedFolderItems(fakeFolder).map((o) => o.name);
  assert.deepStrictEqual(after, ['第一章', '第二章', '第三章', '第十章']);
});
it('patch 保留原函数引用，unpatch 后行为完全还原', () => {
  const holder = makeHolder();
  const original = holder.getSortedFolderItems;
  assert.strictEqual(patchSort(holder), true);
  assert.strictEqual(holder.getSortedFolderItems[ORIG_FLAG], original);
  assert.strictEqual(unpatchSort(holder), true);
  assert.strictEqual(holder.getSortedFolderItems, original);
});
it('重复 patch 不会叠加包装', () => {
  const holder = makeHolder();
  assert.strictEqual(patchSort(holder), true);
  const once = holder.getSortedFolderItems;
  assert.strictEqual(patchSort(holder), false);
  assert.strictEqual(holder.getSortedFolderItems, once);
});
it('返回值不是数组或只有一项时原样透传', () => {
  const holder = { getSortedFolderItems: () => 'not-an-array' };
  assert.strictEqual(patchSort(holder), true);
  assert.strictEqual(holder.getSortedFolderItems(), 'not-an-array');
});
it('缺少排序入口时 patch 返回 false（不抛异常）', () => {
  assert.strictEqual(patchSort({}), false);
  assert.strictEqual(patchSort(null), false);
  assert.strictEqual(patchSort(undefined), false);
});

console.log(`\n通过 ${passed} 项\n`);
