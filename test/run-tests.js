/*
 * CN Natural Sort 单元测试（Node 下运行，不依赖 Obsidian）
 *   node test/run-tests.js
 *
 * 覆盖：cnToInt（简/繁/大写/廿卅/单位层级）、naturalKey token 化、受控罗马识别、
 * 反误伤（三体/二手/CIVIL/DLL/CLI 等不拆数字）、compareNames 混合排序、patch/unpatch。
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
const {
  cnToInt, romanToInt, naturalKey, compareNames, compareItems,
  isFolderFile, itemName, patchSort, unpatchSort, ORIG_FLAG,
} = P;

let passed = 0;
function it(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
// name -> 是否含数值段
const hasNum = (name) => naturalKey(name).some((s) => s.n === 1);
// name -> 各数值段组成的数组
const numsOf = (name) => naturalKey(name).filter((s) => s.n === 1).map((s) => s.v);
const file = (name) => ({ file: { name, extension: 'md' } });
const folder = (name) => ({ file: { name, children: [] } });
const sortedNames = (names, mapFn) => names.map(mapFn).slice().sort(compareItems).map(itemName);

console.log('\n[1] cnToInt 汉字数字 -> 整数');
it('基本数字 一~九', () => {
  assert.strictEqual(cnToInt('一'), 1);
  assert.strictEqual(cnToInt('二'), 2);
  assert.strictEqual(cnToInt('九'), 9);
  assert.strictEqual(cnToInt('零'), 0);
  assert.strictEqual(cnToInt('〇'), 0);
});
it('十/十一/二十/二十一', () => {
  assert.strictEqual(cnToInt('十'), 10);
  assert.strictEqual(cnToInt('十一'), 11);
  assert.strictEqual(cnToInt('二十'), 20);
  assert.strictEqual(cnToInt('二十一'), 21);
});
it('一百/一百零五/一百二十三', () => {
  assert.strictEqual(cnToInt('一百'), 100);
  assert.strictEqual(cnToInt('一百零五'), 105);
  assert.strictEqual(cnToInt('一百二十三'), 123);
});
it('两=2 / 一万二千=12000 / 一百二十万', () => {
  assert.strictEqual(cnToInt('两'), 2);
  assert.strictEqual(cnToInt('一万二千'), 12000);
  assert.strictEqual(cnToInt('一百二十万'), 1200000);
});
it('繁体/大写：贰拾叁、伍佰、壹万贰仟叁佰肆拾伍', () => {
  assert.strictEqual(cnToInt('贰拾叁'), 23);
  assert.strictEqual(cnToInt('伍佰'), 500);
  assert.strictEqual(cnToInt('壹万贰仟叁佰肆拾伍'), 12345);
  assert.strictEqual(cnToInt('萬'), null); // 万級单独無系数 -> 0 -> 无效
});
it('廿/卅/卌：廿=20 廿三=23 卅五=35 卌=40', () => {
  assert.strictEqual(cnToInt('廿'), 20);
  assert.strictEqual(cnToInt('廿三'), 23);
  assert.strictEqual(cnToInt('卅五'), 35);
  assert.strictEqual(cnToInt('卌'), 40);
});
it('亿 层级：一亿零三万', () => {
  assert.strictEqual(cnToInt('一亿零三万'), 100030000);
});
it('语素保护：万一/万二 不当作数字串', () => {
  assert.strictEqual(cnToInt('万一'), null);
  assert.strictEqual(cnToInt('万二'), null);
});
it('连续数字字按十进制累加（年份/编号写法）', () => {
  assert.strictEqual(cnToInt('一九九九'), 1999);
  assert.strictEqual(cnToInt('二〇二四'), 2024);
  assert.strictEqual(cnToInt('二〇二三'), 2023);
  assert.strictEqual(cnToInt('一〇〇'), 100);
  assert.strictEqual(cnToInt('三五'), 35);
  assert.strictEqual(cnToInt('壹贰叁'), 123);
});
it('尾位省略：三百二=320 与 三百零二=302 不再撞值', () => {
  assert.strictEqual(cnToInt('三百二'), 320);
  assert.strictEqual(cnToInt('三百零二'), 302);
  assert.strictEqual(cnToInt('一万二'), 12000);
  assert.strictEqual(cnToInt('四千五'), 4500);
});
it('前导单位缺省系数：百二十三=123', () => {
  assert.strictEqual(cnToInt('百二十三'), 123);
});
it('口语数字字：俩=2 仨=3 皕=200', () => {
  assert.strictEqual(cnToInt('俩'), 2);
  assert.strictEqual(cnToInt('仨'), 3);
  assert.strictEqual(cnToInt('皕'), 200);
});
it('连续数字不被误伤：三五成群 仍是文本', () => {
  assert.strictEqual(hasNum('三五成群'), false);
});
it('年份写法：二〇二四年总结=2024，行尾/括号内的一九九九=1999', () => {
  assert.deepStrictEqual(numsOf('二〇二四年总结'), [2024]);
  assert.deepStrictEqual(numsOf('一九九九'), [1999]);
  assert.deepStrictEqual(numsOf('（一九九九）'), [1999]);
});
it('数字字组成的成语带后缀时不拆：三三两两的想法 / 七七八八的东西', () => {
  assert.strictEqual(hasNum('三三两两的想法'), false);
  assert.strictEqual(hasNum('七七八八的东西'), false);
});
it('非法输入返回 null', () => {
  assert.strictEqual(cnToInt('第'), null);
  assert.strictEqual(cnToInt('abc'), null);
  assert.strictEqual(cnToInt(''), null);
});

console.log('\n[2] romanToInt 罗马数字（严格校验）');
it('基础：I=1 IV=4 V=5 IX=9 X=10 XL=40 XC=90', () => {
  assert.strictEqual(romanToInt('I'), 1);
  assert.strictEqual(romanToInt('IV'), 4);
  assert.strictEqual(romanToInt('V'), 5);
  assert.strictEqual(romanToInt('IX'), 9);
  assert.strictEqual(romanToInt('X'), 10);
  assert.strictEqual(romanToInt('XL'), 40);
  assert.strictEqual(romanToInt('XC'), 90);
});
it('组合：XIV=14 MCMXCIV=1994 III=3 VIII=8', () => {
  assert.strictEqual(romanToInt('XIV'), 14);
  assert.strictEqual(romanToInt('MCMXCIV'), 1994);
  assert.strictEqual(romanToInt('III'), 3);
  assert.strictEqual(romanToInt('VIII'), 8);
});
it('非法写法返回 null：IIII/CIVIL/ID/VV/小写', () => {
  assert.strictEqual(romanToInt('IIII'), null);
  assert.strictEqual(romanToInt('CIVIL'), null);
  assert.strictEqual(romanToInt('ID'), null);
  assert.strictEqual(romanToInt('VV'), null);
  assert.strictEqual(romanToInt('iv'), null); // 只认大写
  assert.strictEqual(romanToInt('ABC'), null);
});

console.log('\n[3] naturalKey：中文序号语境识别');
it('第X章/第X单元：第二章 第1章 第一单元 都抽出数值', () => {
  assert.deepStrictEqual(numsOf('第二章'), [2]);
  assert.deepStrictEqual(numsOf('第十章'), [10]);
  assert.deepStrictEqual(numsOf('第1章'), [1]);
  assert.deepStrictEqual(numsOf('第一单元·基础剪辑全流程'), [1]);
  assert.deepStrictEqual(numsOf('第一百零八回'), [108]);
});
it('括号/顿号/结尾：一、（一）笔记一 抽数值', () => {
  assert.deepStrictEqual(numsOf('一、绪论'), [1]);
  assert.deepStrictEqual(numsOf('笔记（一）：导学与准备篇'), [1]);
  assert.deepStrictEqual(numsOf('笔记(三)：进阶'), [3]);
  assert.deepStrictEqual(numsOf('附录一'), [1]);
});
it('多层序号全部抽出（外层+内层）', () => {
  assert.deepStrictEqual(numsOf('笔记（三）：第二单元·专业工具篇'), [3, 2]);
  assert.deepStrictEqual(numsOf('第一单元 第2节'), [1, 2]);
});
it('反误伤：三体/二手/万一/万有引力/十月 不拆数字', () => {
  assert.strictEqual(hasNum('三体'), false);
  assert.strictEqual(hasNum('二手'), false);
  assert.strictEqual(hasNum('万一'), false);
  assert.strictEqual(hasNum('万有引力'), false);
  assert.strictEqual(hasNum('十月怀胎'), false);
  assert.strictEqual(hasNum('十一期间'), false);
});
it('阿拉伯数字直接抽数值（含 Lecture 10/v1.10）', () => {
  assert.deepStrictEqual(numsOf('Lecture 10'), [10]);
  assert.deepStrictEqual(numsOf('v1.10'), [1, 10]);
  assert.deepStrictEqual(numsOf('12. 引言'), [12]);
});

console.log('\n[4] naturalKey：受控罗马识别');
it('行首+分隔：I. / V、/ X - / III：', () => {
  assert.deepStrictEqual(numsOf('I. 概述'), [1]);
  assert.deepStrictEqual(numsOf('V、复盘'), [5]);
  assert.deepStrictEqual(numsOf('X - 结语'), [10]);
  assert.strictEqual(hasNum('III：结论'), true);
});
it('括号内：（II）（IV）', () => {
  assert.deepStrictEqual(numsOf('（II）补充'), [2]);
  assert.deepStrictEqual(numsOf('笔记(IV)终章'), [4]);
});
it('序数前缀词后：Part II / Lesson IX / Unit X', () => {
  assert.deepStrictEqual(numsOf('Part II'), [2]);
  assert.deepStrictEqual(numsOf('Lesson IX 复习'), [9]);
  assert.deepStrictEqual(numsOf('Unit X 尾声'), [10]);
});
it('汉字后紧接：笔记II', () => {
  assert.deepStrictEqual(numsOf('笔记II'), [2]);
});
it('反误伤：I have a dream / CIVIL / DLL注入 / CLI 指南 / MIX', () => {
  assert.strictEqual(hasNum('I have a dream'), false);
  assert.strictEqual(hasNum('CIVIL'), false);
  assert.strictEqual(hasNum('DLL注入'), false);
  assert.strictEqual(hasNum('CLI 指南'), false);
  assert.strictEqual(hasNum('MIX'), false);
});

console.log('\n[5] compareNames 排序');
it('第X章 按数值升序（含与阿拉伯数字混排）', () => {
  const names = ['第三章', '第1章', '第十章', '第一章', '第2章', '第二章', '第七章'];
  const got = names.slice().sort(compareNames);
  assert.deepStrictEqual(got, ['第1章', '第一章', '第2章', '第二章', '第三章', '第七章', '第十章']);
});
it('笔记（一~四）保持 1<2<3<4，且（十）排最后', () => {
  const names = ['笔记（三）：第二单元·专业工具篇', '笔记（一）：导学与准备篇', '笔记（十）：总结篇', '笔记（二）：第一单元·基础剪辑全流程', '笔记（四）：第三单元·复刻实战篇'];
  const got = names.slice().sort(compareNames);
  assert.deepStrictEqual(got, [
    '笔记（一）：导学与准备篇',
    '笔记（二）：第一单元·基础剪辑全流程',
    '笔记（三）：第二单元·专业工具篇',
    '笔记（四）：第三单元·复刻实战篇',
    '笔记（十）：总结篇',
  ]);
});
it('多层序号层级正确：外层相同再比内层', () => {
  const names = [
    '笔记（三）：第一单元·A',
    '笔记（二）：第二单元·B',
    '笔记（二）：第一单元·C',
    '笔记（三）：第二单元·D',
    '笔记（一）：零单元·E',
  ];
  const got = names.slice().sort(compareNames);
  assert.deepStrictEqual(got, [
    '笔记（一）：零单元·E',
    '笔记（二）：第一单元·C',
    '笔记（二）：第二单元·B',
    '笔记（三）：第一单元·A',
    '笔记（三）：第二单元·D',
  ]);
});
it('纯中文词按拼音兜底（不误伤，三体/万有引力 当文本）', () => {
  const names = ['三体', '万有引力', '二手研究', '读书笔记'];
  const got = names.slice().sort(compareNames);
  // er/san/wan… 拼音序由 Intl.Collator 决定，此处只断言不因被拆成数字而跳到数字区
  assert.ok(got.indexOf('三体') > got.indexOf('二手研究')); // er < san
});
it('英文 Lecture：2 < 9 < 10', () => {
  const got = ['Lecture 10', 'Lecture 2', 'Lecture 9'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['Lecture 2', 'Lecture 9', 'Lecture 10']);
});
it('版本号：v1.2 < v1.10', () => {
  const got = ['v1.10', 'v1.2', 'v1.9'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['v1.2', 'v1.9', 'v1.10']);
});
it('大小写不再干扰数值序：v1.2 排在 V1.10 之前', () => {
  const got = ['V1.10', 'v1.2'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['v1.2', 'V1.10']);
  const mixed = ['CH10', 'Ch2', 'ch10', 'Ch10'].slice().sort(compareNames);
  assert.strictEqual(mixed[0], 'Ch2'); // 数值 2 最小，与大小写无关
});
it('全角数字 １２３ 归为数值并与阿拉伯数字同序', () => {
  assert.strictEqual(hasNum('１２３'), true);
  const got = ['１２３', '99', '2'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['2', '99', '１２３']);
});
it('中文年份（二〇二四）与阿拉伯年份按同一数值序混排', () => {
  const got = ['二〇二四年总结', '一九九九年总结', '2023年总结'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['一九九九年总结', '2023年总结', '二〇二四年总结']);
});
it('罗马数字与阿拉伯混排：II(2) < 5 < IX(9) < X(10)', () => {
  const names = ['IX 复习', 'II 基础', 'V 进阶', '10 总结'];
  const got = names.slice().sort(compareNames);
  assert.deepStrictEqual(got, ['II 基础', 'V 进阶', 'IX 复习', '10 总结']);
});
it('Chapter 罗马序列：I < II < III < IV < V < IX < X', () => {
  const names = ['Chapter V', 'Chapter X', 'Chapter II', 'Chapter IX', 'Chapter I', 'Chapter IV', 'Chapter III'];
  const got = names.slice().sort(compareNames);
  assert.deepStrictEqual(got, [
    'Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV', 'Chapter V', 'Chapter IX', 'Chapter X',
  ]);
});
it('中文「一 基础」与「（二）」混排按数值', () => {
  const got = ['（二）进阶', '一 基础', '（十）尾声'].slice().sort(compareNames);
  assert.deepStrictEqual(got, ['一 基础', '（二）进阶', '（十）尾声']);
});
it('确定性：第1章 vs 第一章 等值段有稳定全序', () => {
  const names = ['第一章', '第1章'];
  const once = names.slice().sort(compareNames);
  const twice = names.slice().sort(compareNames).sort(compareNames);
  assert.deepStrictEqual(once, twice);
  // 等值段退化为按原串码点（'1' < '一'）
  assert.deepStrictEqual(once, ['第1章', '第一章']);
});
it('混合语料排序结果与比较器自洽（严格弱序的实用检验）', () => {
  // 若比较器不满足传递性，Array.sort 的结果会与比较器自身矛盾（可能出现 A<=B 但排在后面）
  const corpus = [
    '第一章', '第1章', 'Chapter I', 'chapter ii', 'v1.2', 'V1.10', 'V1.2', 'v1.10',
    '二〇二四年', '2024年', '一九九九年', '１２３', '123', 'Ch2', 'CH10', 'Ch10',
    'a', 'A', 'b', '笔记（一）', '笔记(1)', '第3.2节', '第3.10节', 'Part II',
    'part x', '三体', '二手', '10', '2', '二', 'Lecture 9', 'Lecture 10', '附录', '甲', '乙',
  ];
  const sorted = corpus.slice().sort(compareNames);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      assert.ok(compareNames(sorted[i], sorted[j]) <= 0, `${sorted[i]} <= ${sorted[j]}`);
    }
  }
  // 重复排序结果必须一致（确定性）
  assert.deepStrictEqual(corpus.slice().sort(compareNames), sorted);
});
it('compareNames 全序/反身/对称抽查', () => {
  const names = ['b', 'a', '2', '10', '十', '（三）', 'x'];
  const sorted = names.slice().sort(compareNames);
  for (let i = 0; i + 1 < sorted.length; i++) {
    assert.ok(compareNames(sorted[i], sorted[i + 1]) <= 0, `${sorted[i]} <= ${sorted[i + 1]}`);
  }
  for (const n of names) assert.strictEqual(compareNames(n, n), 0);
  assert.strictEqual(compareNames('a', 'b'), -compareNames('b', 'a'));
});

console.log('\n[6] compareItems 条目排序');
it('第X章 按数字升序', () => {
  const items = ['第三章', '第一章', '第十章', '第二章', '第七章'].map(file);
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, ['第一章', '第二章', '第三章', '第七章', '第十章']);
});
it('文件夹排在文件之前', () => {
  const items = [file('第一章'), folder('乙目录'), file('第二章'), folder('甲目录')];
  const got = items.slice().sort(compareItems).map(itemName);
  assert.deepStrictEqual(got, ['甲目录', '乙目录', '第一章', '第二章']);
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
it('数字序号与其文本前缀自然混排，同前缀章节按数值升序', () => {
  // 新算法不做「整体上浮」：第二章 的前缀「第」(di) 按拼音归位，但「第二章 第三章」仍相邻且按 2<3
  const got = sortedNames(['附录', '第三章', '第二章', '笔记'], file);
  // 笔记(bi) < 第(di) < 附(fu)
  assert.deepStrictEqual(got, ['笔记', '第二章', '第三章', '附录']);
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

console.log('\n[7] 接管排序入口');
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
it('尊重原生排序设置：只有「按文件名字母序」才接管', () => {
  // 原生 mock 刻意返回一个「按修改时间」的顺序：第二章、第十章、第一章
  const build = (order) => {
    const items = ['第十章', '第二章', '第一章'].map((n) => ({ name: n }));
    return { sortOrder: order, getSortedFolderItems: () => [items[1], items[0], items[2]] };
  };
  const names = (h) => h.getSortedFolderItems().map((o) => o.name);

  const alpha = build('alphabetical');
  patchSort(alpha);
  assert.deepStrictEqual(names(alpha), ['第一章', '第二章', '第十章']);

  const rev = build('alphabeticalReverse');
  patchSort(rev);
  assert.deepStrictEqual(names(rev), ['第十章', '第二章', '第一章']);

  // 关键：按修改时间/创建时间时必须原样放行，不能覆盖成字母序
  for (const order of ['byModifiedTime', 'byCreatedTime', 'byModifiedTimeReverse']) {
    const h = build(order);
    patchSort(h);
    assert.deepStrictEqual(names(h), ['第二章', '第十章', '第一章'], order);
  }
});
it('未设置 sortOrder 时保持接管（向后兼容）', () => {
  const items = ['第十章', '第二章', '第一章'].map((n) => ({ name: n }));
  const h = { getSortedFolderItems: () => [items[1], items[0], items[2]] };
  patchSort(h);
  assert.deepStrictEqual(h.getSortedFolderItems().map((o) => o.name), ['第一章', '第二章', '第十章']);
});

console.log(`\n通过 ${passed} 项\n`);
