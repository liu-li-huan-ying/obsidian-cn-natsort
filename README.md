# CN Natural Sort

Sort the file explorer by Chinese numerals.

> 中文名：中文自然排序。让文件浏览器按中文数字「第X章 / 第X节」自然排序。

## English

The file explorer (left sidebar) orders items by Unicode code points, so Chinese
numerals like 第一章, 第二章 … 第十章 end up out of order. This plugin makes them sort
numerically:

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
- Names without Chinese numerals keep the native ordering
  (e.g. `Lecture 2 < Lecture 9 < Lecture 10`).

### Installation

1. Turn off Restricted Mode: **Settings → Community plugins → turn off Restricted Mode**.
2. Open **Community plugins → Browse**, search for **CN Natural Sort**, and enable it.
   (Alternatively, install via BRAT using the repository URL.)
3. The file explorer re-sorts immediately.

### Usage

Nothing to configure. Once enabled, the file explorer sorts itself. To force a re-sort,
run the command **"CN Natural Sort: re-sort"** (or click the ribbon icon).

## 中文

Obsidian 社区插件。让**文件浏览器（左侧文件列表）**按中文数字自然排序：

- **不改文件名、不改文件内容、不写 frontmatter、不需要任何配置**
- 文件夹仍然排在文件之前
- 英文/阿拉伯数字沿用原生排序（`Lecture 2 < Lecture 9 < Lecture 10`）

### 排序规则

对每一层条目：

1. 文件夹在前，文件在后
2. 有中文序号的排在前面，按数值大小排：`第X章 / 第X节 / 第X卷 / 第X篇 / 第X回 / 第X部 / 第X集`、行首 `一、绪论`
3. 其余交给原生比较器（`Intl.Collator({ numeric: true })`），行为与未安装时一致

### 安装

1. 设置 → 第三方插件 → 关闭限制模式
2. 社区插件列表搜索 **CN Natural Sort** 并启用（或用 BRAT 通过仓库地址安装）
3. 文件浏览器立即重排

### 使用

无需配置。启用后文件浏览器自动排序；如需强制重排，运行命令「CN Natural Sort: re-sort」或点左侧栏图标。
