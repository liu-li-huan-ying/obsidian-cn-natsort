# CN Natural Sort

Chinese-aware **natural** ordering for the file explorer: 第一章, 第二章 … 第十章,
（一）（二）（三）, 第一单元/第二单元, Lecture 2/9/10, Part I/II/X — all appear in
**numeric** order, not code-point order.

> 中文名：中文自然排序。让文件浏览器按人类直觉排序，而不是按 Unicode 码点。

## English

The file explorer orders items by Unicode code points, so Chinese numerals like
第一章, 第二章 … 第十章 come out shuffled. This plugin replaces the explorer's own
sort routine so numbers — Arabic, Chinese and Roman alike — are compared by value:

```
Obsidian default (by code point)      CN Natural Sort
─────────────────────────────────      ─────────────────────────────────
第一章                                 第一章
第三章                                 第二章
第二章                                 第三章
第十章                                 第十章
```

- No file renaming, no content edits, zero configuration.
- Folders are still listed before files.
- Names that are not numbers keep native ordering
  (`Lecture 2 < Lecture 9 < Lecture 10`, 拼音 order for pure Chinese).

### What it understands

| Pattern | Example | Sorts as |
|---|---|---|
| 第 X 章/节/卷/篇/回/部/集/单元 | 第一章, 第十章, 第一单元 | 1, 10 / 1 |
| Leading numeral | 一、绪论, 1. 概述, 12. 小结 | 1 / 1 / 12 |
| Parenthesized numeral | （一）（二）…, (三), 笔记（十） | 1, 2 … 10 |
| Trailing numeral | 附录一, 笔记2 | by value |
| Arabic numerals | Lecture 2/9/10, v1.2/v1.10, A-2/A-10 | 2 < 9 < 10 etc. |
| Roman numerals* | I. II. III., Part I/II/X, （IV）, 笔记II | 1, 2, 3, 4, 10 |
| Chinese numerals, incl. traditional & banker's | 貳拾參, 伍佰, 廿三, 卅五, 皕 | 23, 500, 23, 35, 200 |
| Multi-level numbers | 笔记（二）：第一单元, 第二单元 3-2 | 2,1 / 2,3,2 |
| Year / digit-string numerals | 二〇二四年总结, 一九九九, 一〇〇 | 2024, 1999, 100 |
| Colloquial shorthand | 三百二 (=320), 一万二 (=12000), 百二十三 (=123) | 320, 12000, 123 |
| Fullwidth digits | １２３ (normalized to halfwidth) | 123 |
| Chinese dates & durations | 2026年十月六日, 九月三十日, 三小时, 十分钟 | 2026/10/6, 9/30, 3, 10 |
| Numeral + measure word | 一项, 两项, 三项, 三页, 十册, 3号, 三周 | 1 < 2 < 3 |
| Letter suffixes | 附录A, 附录B, 附录J, 方案C | A < B < C < J |
| Roman numerals after Chinese | 卷I, 卷II, 卷IX | 1 < 2 < 9 |
| Mixed date formats | 2026-10-06, 2026.10.06, 2026年十月六日 | all on one axis |

\* Roman numerals are only treated as numbers when they look like ordinal labels:
at the start of a name followed by a separator, inside parentheses, or after a prefix
word (`Chapter`, `Part`, `Unit`, `Lecture`, `Lesson`, `Section`, `Book`, `Volume` …).
This avoids mangling words like `DLL`, `CLI`, `XML`, `CIVIL` or sentences like
*I have a dream*.

After Chinese text, Roman vs letter is ambiguous (`附录C` = letter C, or Roman 100?),
so the whole folder decides — see “How it works”.

### How it works

Deciding whether a run of characters is a *number* is the whole problem, and a yes/no
guess is not enough — a wrong guess does not shift a file slightly, it demotes the
number to text and the name falls back to pinyin, which for Chinese numerals is close
to random (`一`→yi sorts after `三`→san). So the pipeline has three stages.

**1 · Segment.** The name is split into segments. Each numeral is tagged with the
*evidence* found for it instead of getting an immediate verdict:

- `strong` — hard syntax: after an ordinal lead (`第`), inside brackets (`（三）`), at
  the start followed by a separator (`一、`), a year form (`二〇二四`), or part of a
  multi-level chain (`十月六日`).
- `weak` — only “numeral + measure word” (`十分钟`, `一项`, `三页`). Which measure word
  it is makes no difference.
- nothing → stays text (`三体`, `万一`).

**2 · Compare segments.** Number vs number by value; text vs text with the same
`Intl.Collator` Obsidian itself uses; a number beats a text segment. Comparing segment
by segment through the *whole* name is what makes nesting work.

**3 · Adjudicate the folder.** The weak segments are resolved against the rest of the
folder in one pass, before sorting starts:

- Roman segments: if the same Chinese prefix shows a real Roman run (`卷II`) the whole
  prefix is read as Roman; if it shows a non-Roman letter (`附录A`) the whole prefix is
  read as letters. Never both — mixing them makes the same pair of names compare
  differently in different folders, and the order stops being self-consistent.
- Weak Chinese segments: group by pattern (`?分`, `?项`, `?月?日`). A group of two or
  more with differing values is a real numbering series and is adopted; a group of
  identical values (`十分满意`, `十分感谢`, `十分准确` — all 10) is an adjective and is
  demoted back to text. A lone member is left alone.

That last rule is why there is no list of “trustworthy measure words”:
`一项/两项/三项` read as 1/2/3 even though `项` was never whitelisted, and
`十分满意` survives intact without `分` needing an exemption.

### Installation

1. Turn off Restricted Mode: **Settings → Community plugins → turn off Restricted Mode**.
2. Open **Community plugins → Browse**, search for **CN Natural Sort**, and enable it.
   (Alternatively, install via BRAT using the repository URL.)
3. The file explorer re-sorts immediately.

### Usage

Nothing to configure. Once enabled, the file explorer sorts itself. To force a re-sort,
run the command **"CN Natural Sort: re-sort"** (or click the ribbon icon). A
**"diagnose"** command prints the current order of a couple of folders to the console.

The plugin only takes over **alphabetical** sorting. If you switch the file explorer
to *Modified time* / *Created time*, this plugin steps aside and Obsidian's own order
is left untouched (including their *Reverse* variants).

## 中文

Obsidian 社区插件。让**文件浏览器（左侧文件列表）**按「人类直觉的自然顺序」排序：

- **不改文件名、不改文件内容、不写 frontmatter、不需要任何配置**
- 文件夹仍然排在文件之前
- 不是数字的普通名字仍按原生规则（纯中文按拼音、英文数字按自然序）

### 能识别的形态

- **第 X 章/节/卷/篇/回/部/集/单元**：`第二章`、`第十章`、`第一单元`
- **行首序号**：`一、绪论`、`1. 概述`
- **括号序号**：`（一）（二）（三）…`、`笔记（四）`、`(三)`
- **阿拉伯数字**：`Lecture 2/9/10`、`v1.2/v1.10`（按 2<9<10、1.2<1.10 排）
- **罗马数字**（限序号语境）：`I. II. III.`、`Part I/II/X`、`（IV）`、`X - 结语`
- **汉字 + 序号字母**：`附录A/B/C`、`方案A/B/C` 按字母走；`卷I/II/…/IX` 按罗马数值走
  （同一前缀自动二选一，见下方已知边界）
- **中文日期**：`2026年十月六日` = 2026 / 10 / 6、`九月三十日` = 9 / 30，
  与 `2026-10-06`、`2026年10月6日` 按同一数值轴混排
- **数字 + 量词 / 时间单位**：`一项` `两项` `三项`、`三页` `十册`、`十分钟` `三小时`、
  `3号` `三周` —— 不靠「哪个单位可信」判定，由整批一致性裁决（见下方算法第 3 层）
- **口语 / 大写数字**：`俩`=2、`仨`=3、`皕`=200
- **简/繁/大写/廿卅**：`貳拾參`=23、`伍佰`=500、`廿三`=23
- **多层嵌套序号**：`笔记（二）：第二单元` 会排在 `笔记（二）：第一单元` 之后
  （外层相同再比内层）

### 排序算法（v2.0）

v2.0 把「这段到底算不算数字」从 **if 分支决策树** 换成 **切段 → 打分 → 整批裁决** 三层。
动机很直接：判断一旦漏掉，退化的不是「排偏一点」，而是整段变成文本、转按拼音排 ——
而中文数字的读音和大小毫无关系（`一`→yi 排在 `三`→san 之后），一次漏判就是整列乱序。

**第 1 层 · 切段**：把名字切成「数值段 / 文本段」交替的序列。数值段不立刻定性，
只记录它拿到了哪些**证据**：

| 证据 | 触发条件 | 例子 |
|---|---|---|
| strong | 序数引导词 `第` | `第一章`、`第3章` |
| strong | 括号包裹 | `（三）`、`(II)` |
| strong | 行首 + 分隔符 | `一、`、`1.` |
| strong | 年份写法（连续 3 位以上数字字 + 时间单位） | `二〇二四年` |
| strong | 多级链（单位字 + 数字串 反复出现） | `十月六日` = ?月?日 |
| strong | 一侧不挨着汉字 | `笔记一`、`一 基础` |
| weak | 只是「数字 + 量词/时间单位」 | `十分钟`、`一项`、`三页` |
| 无 | 以上都没有 | `三体`、`万一` → 按文本 |

注意 weak 那行：**不区分是哪个单位**。以前要维护「可信单位白名单」，
`分` 因为会撞上「十分满意」就被排除，于是「十分钟」跟着受牵连 —— 补一个坑坏一片。

**第 2 层 · 逐段比较**：数值段按值比，文本段交给与 Obsidian 同款的 `Intl.Collator`
（中文拼音、忽略大小写），数值段遇文本段在前，前段相等则继续比下一段。
因为是对**整个名字逐段比较**，内层序号天然参与排序：`笔记（二）：第二单元` 排在
`笔记（二）：第一单元` 之后。数值相等但写法不同（`10` 与 `十`）只记为 tie，
延后到所有段比完才用 —— 否则 `2026年10月16日` 会在第 3 段就因写法分出胜负，
根本走不到第 5 段去比 16 和 6。

**第 3 层 · 整批裁决**：排序开始前，把这批文件里的 weak 段一次性判完：

- **罗马段**：同一汉字前缀下若出现非罗马字母（`附录A` 的 `A`），整个前缀按字母序；
  若全是罗马字母且有 ≥2 字符的（`卷II`），整个前缀按罗马数值。两套逻辑**绝不混用**。
- **中文 weak 段**：按模式分组（`?分`、`?项`、`?月?日`）。同组 ≥2 个成员且数值不全相同
  → 判定为真编号，采纳；数值全同（`十分满意` `十分感谢` `十分准确` 都是 10）→ 判定为
  副词用法，降级回文本；只有 1 个成员 → 孤证不足，保持文本。

这就是「不需要单位白名单」的原因：`一项/两项/三项` 的 1、2、3 递增本身就是最强证据，
而「十分满意」那组三个值都是 10，重复本身就是它不是编号的证据。

因为是对**整个名字逐段比较**，内层序号也能正确参与排序（层级正确性），且
「第三章」与「第 3 章」可以按同一个数值混排。

### 已知边界（有意为之，避免误伤）

**插件只接管「按文件名」排序**：在文件浏览器里切换成「修改时间 / 创建时间」排序时，
插件会完全放行，不再重排（含对应的 Reverse）。这是刻意设计 —— 不覆盖原生功能。

中文数字是否被当「数字」取决于语境，防止把普通词拆坏：

- 「三体」「二手」「万一」「万有引力」「十一期间」「三五成群」「十分满意」等
  **被汉字夹住或构成词语**的名字 → 按拼音当文本，不会拆成「数字 3 + 体」。
- **weak 段靠整批裁决，就有「单文件判不了」这回事**：`十分钟.md` 独自存在时无从判断，
  保守按文本处理（排在数字区之后）；同目录出现 `二十分钟` 后，两者一起被认定为编号。
  这是有意的取舍：宁可暂时少认，也不要把 `十分满意` 拆成 10。
- **同一模式下的混排会连坐**：`十分钟`（时长）和 `十分满意`（副词）模式都是 `?分`，
  组里出现了不同值，于是整组被当作编号，`十分满意` 会被排到 10 附近而不是纯文本区。
  只影响排序位置，不丢数据；把副词型文件名改掉即可（README 建议避免同一前缀混写）。
- **多级链直接判 strong**：`十月六日` 不等裁决就拆开，所以 `十月怀胎` 这类含「十月」的
  成语也会被拆成 10 + 月怀胎。
- 罗马数字**只认大写**，且要求看起来像序号（行首 + 分隔/括号、`Chapter|Part|Unit|
  Lecture…` 前缀词后），避免把 `DLL`/`CLI`/`XML`/`MIX` 这类恰好由罗马字母组成的
  技术缩写、或 `CIVIL`、`I have a dream` 这类词误判成数字。
- **汉字后紧接的罗马字母，按「同一前缀只选一套逻辑」判定**：同一批文件里，同一个
  汉字前缀（`卷`、`附录`、`表`…）下 —— 只要出现一个非罗马字母（`附录A` 的 `A`），
  整个前缀就按字母序；全是罗马字母、且至少有一个多字符（`卷II`、`卷IX`）时，才按
  罗马数值排。两套逻辑绝不混用：混用会让同一对名字在不同上下文里得出相反结果，
  排序就不自洽了（例如 `附录V`/`附录L`/`附录N` 同在时会互相打转）。
  因此 `附录A/B/C` 与 `卷I/II/…/IX` 能各自排对，也能在同一目录共存；
  但**不鼓励在同一前缀下混写** `附录A` 与 `附录II` —— 此时该前缀整体退化为字母序。
- 语义性歧义无法完美消除：如把「MIX」放在行首且后面紧跟标点的文件名仍会被当作
  1009。这类文件名很少见；若遇到，在数字后加一个空格即可解除（空格后的英文视为正文）。

**已知会误判的少数成语**（无法在不加词典的前提下消除，影响很小 —— 只是该文件会
被排进数字区，不会丢数据）：

- 「七七八八」「三三两两」「一五一十」这类**全由数字字组成**的词，独立成文件名时
  仍会被当数值（7788 / 3322 / 10）。
- 「朝三暮四」「颠三倒四」的**尾字**落在名字末尾，会被当数值（4）。
- 缓解办法：这类文件改名时在其后加一个非汉字（如 `七七八八 杂项`），或加前缀词。

**明确不支持**（属于领域语义，交给用户而非猜）：

- 天干 / 地支 / 干支纪年、民国纪年、年号朝代（康熙三年 / 乾隆十年）—— 语义序而非数值序。
- 「上中下」「前后」等有语义顺序但非数值的词 —— 仍按拼音排。
- `兆`/`京`/`垓`/`秭` —— 古今含义不同（兆 既可能是 10⁶ 也可能是 10¹²），不猜。
- 负数、小数 —— 文件名里极罕见。
- 英文数字单词（`Two`、`Three`）—— 不当数值处理。

**同一序号的不同写法会「聚拢」但不会合并成一档**：`第3章` 与 `第三章` 相邻，
`Ch3` / `PART 3` 也会各自成簇，但中文档与拉丁前缀分属两簇（前缀文本不同，
按拼音/字母序先分簇，簇内再按数值）。

### 安装

1. 设置 → 第三方插件 → 关闭限制模式
2. 社区插件列表搜索 **CN Natural Sort** 并启用（或用 BRAT 通过仓库地址安装）
3. 文件浏览器立即重排

### 使用

无需配置。启用后文件浏览器自动排序；如需强制重排，运行命令「CN Natural Sort:
re-sort」或点左侧栏图标；「CN Natural Sort: diagnose」可在控制台输出当前排序。

### 验收（开发用）

```
node test/run-tests.js   # 73 项单元测试
node test/matrix.js      # 29 种编号形态 + 9 项反误伤
node test/fuzz.js        # 严格弱序 fuzz：同一批任意排列结果必须一致
node test/bench.js       # 性能基准，阈值 = 重构前（1.3.2）实测中位数
```

重构前后同机交替实测（Node 22，混合语料）：

| 指标 | 1.3.2 | 2.0 |
|---|---|---|
| 冷 token 化 500 个不重复名 | 1.29 ms | 1.02 ms |
| 整批排序 200 个新文件 | 1.63 ms | 0.76 ms |
| 热缓存重排 200×200 | 46.6 ms | 17.1 ms |

热缓存快了 2.7 倍，因为整批裁决按「裁决签名」分桶缓存，不再像 1.3.x 那样
每次上下文一变就 `keyCache.clear()`。

### 排错与兼容


- 若列表展开/折叠异常，先确认装的是 **v1.1+**（v1.0 会破坏虚拟滚动，已废弃）。
- 本插件接管的是 `FileExplorerView.getSortedFolderItems`，不改任何 DOM，禁用后立即还原。
