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

\* Roman numerals are only treated as numbers when they look like ordinal labels:
at the start of a name followed by a separator, inside parentheses, after a prefix
word (`Chapter`, `Part`, `Unit`, `Lecture`, `Lesson`, `Section`, `Book`, `Volume` …),
or attached to Chinese text (笔记II). This avoids mangling words like `DLL`, `CLI`,
`XML`, `CIVIL` or sentences like *I have a dream*.

### How it works

Each file name is split into alternating **number segments** (Arabic / Chinese /
Roman, normalized to a value) and **text segments**. Segments are then compared one
by one: number vs number by value, text vs text with the same `Intl.Collator`
Obsidian itself uses, and a number beats a text segment when their positions align.
Because comparison proceeds segment by segment through the *whole* name, nested
numbers sort hierarchically: 「笔记（二）：第二单元」 naturally follows
「笔记（二）：第一单元」 once the outer (二) is equal.

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
- **罗马数字**（限序号语境）：`I. II. III.`、`Part I/II/X`、`（IV）`、`笔记II`
- **简/繁/大写/廿卅**：`貳拾參`=23、`伍佰`=500、`廿三`=23
- **多层嵌套序号**：`笔记（二）：第二单元` 会排在 `笔记（二）：第一单元` 之后
  （外层相同再比内层）

### 排序算法（v1.2 起）

v1.2 把旧的「整体抽首个中文序号再上浮」改成 **token 化分段比较**：把文件名切成
交替的**数值段**（阿拉伯/中文/罗马，统一归为数值）与**文本段**，然后逐段比较：

1. 数值段 vs 数值段 → 按数值比（`2 < 9 < 10 < 十二 < X`）
2. 文本段 vs 文本段 → 交给与 Obsidian 同款的 `Intl.Collator`（中文拼音、忽略大小写）；
   仅「大小写之别」不会抢先定序，会继续往后比数值段（所以 `v1.2` 一定排在 `V1.10` 之前）
3. 数值段与文本段相遇 → 数值段在前
4. 前段全部相等 → 继续比下一段

因为是对**整个名字逐段比较**，内层序号也能正确参与排序（层级正确性），且
「第三章」与「第 3 章」可以按同一个数值混排。阿拉伯、中文、罗马三种数字混排时
按同一个数字轴比较。

### 已知边界（有意为之，避免误伤）

**插件只接管「按文件名」排序**：在文件浏览器里切换成「修改时间 / 创建时间」排序时，
插件会完全放行，不再重排（含对应的 Reverse）。这是刻意设计 —— 不覆盖原生功能。

中文数字是否被当「数字」取决于语境，防止把普通词拆坏：

- 「三体」「二手」「万一」「万有引力」「十月怀胎」「十一期间」「三五成群」等
  **被汉字夹住或构成词语**的名字 → 按拼音当文本，不会拆成「数字 3 + 体」。
- 罗马数字**只认大写**，且要求看起来像序号（行首 + 分隔/括号、`Chapter|Part|Unit|
  Lecture…` 前缀词后、或汉字后紧接），避免把 `DLL`/`CLI`/`XML`/`MIX` 这类恰好由
  罗马字母组成的技术缩写、或 `CIVIL`、`I have a dream` 这类词误判成数字。
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

### 排错与兼容

- 若列表展开/折叠异常，先确认装的是 **v1.1+**（v1.0 会破坏虚拟滚动，已废弃）。
- 本插件接管的是 `FileExplorerView.getSortedFolderItems`，不改任何 DOM，禁用后立即还原。
