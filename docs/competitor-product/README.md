# 竞品交互参考 — WPS 365 文档（3.0 对标）

> **来源**：本目录截图（2026-07 采集）；产品为 **WPS 365 在线文档**（非 Cherry Studio）。  
> **用途**：P2 §5.10 / M8 实机验收的视觉与交互基准；**参照不复刻**（P0 A14）。  
> **架构约束**：MDA 3.0 为 CM6 源码即真源 + 装饰/widget；产品目标为 WPS 式 **全程隐藏 Markdown 语法**（P0 **D15**）。块级富内容用 widget；行内语法用 `atomicRanges` + 零宽隐藏（**M8-B8b 坐标闸门**通过后方可签收）。

---

## 截图索引

> **命名约定**：`<场景>.png`，语义化英文 kebab-case。

| 文件 | 场景 | MDA 映射 |
|------|------|----------|
| [`empty-doc-context-menu.png`](empty-doc-context-menu.png) | 空文档 + 顶栏 + 右键「AI 帮我写」 | F11-1 占位、F11-4 右键、F11-6 工具栏 |
| [`empty-doc-placeholder.png`](empty-doc-placeholder.png) | 空文档 + 行首 `+` 插入柄 + 占位文案 | F11-1、F11-2 `/` 等价入口 |
| [`ai-side-panel.png`](ai-side-panel.png) | 顶栏「WPS AI」展开侧栏（写作/阅读助手） | F14 动作集；**MDA 不做**独立 AI 侧栏，改四处入口 + 子菜单 |
| [`insert-menu.png`](insert-menu.png) | 「插入」下拉：通用 / 图形与数据 | F11-2 `/` 面板分组对齐 |
| [`doc-outline-inline-code.png`](doc-outline-inline-code.png) | 长文 + 目录/要点 tab + 行内 code 胶囊 + 高亮块 | F17 要点 tab；S5 行内 code；**高亮块 3.0 不做** |
| [`code-block-toolbar.png`](code-block-toolbar.png) | 模板/代码块：语言下拉 + 复制 + 设置 + 行号 | S13 代码 widget 顶栏 |
| [`mermaid-block-toolbar.png`](mermaid-block-toolbar.png) | Mermaid 块顶栏：问问 AI / 模板 / 代码 / 分屏 / 预览 | S17 Mermaid widget |
| [`table-drag-handle.png`](table-drag-handle.png) | 表格 + 左侧六点拖拽柄 | S14 表格 v1/v2 |
| [`image-block-selected.png`](image-block-selected.png) | **插入图片选中态**：蓝框 + 四角手柄 + 顶栏浮动条 | S22 + D14 |
| [`code-block-widget.png`](code-block-widget.png) | 代码块：语言、固定高度、复制、设置；左上 `{}` 拖拽；右上 AI | S13 完整 chrome |
| [`ai-summary-tab.png`](ai-summary-tab.png) | 左侧栏「要点」tab **完整生成态**：摘要段 + 要点列表 + 复制 + AI 脚注 | F17 文档总结侧栏 |

---

## 1. 全局布局与视觉语言

### 1.1 画布

| 元素 | 竞品样式 | MDA 3.0 对齐 |
|------|----------|--------------|
| 背景 | 浅灰画布 + 白色文档纸（居中，最大宽度约 800–900px） | `#preview-scroll` 沿用 2.0 预览区纸面样式 |
| 顶栏 | 固定于编辑区上方，白底、细分割线、图标+文字混排 | F11-6 常驻编辑栏；**不**占用 Electron 系统菜单栏 |
| 左栏 | 「目录」「要点」双 tab，可折叠轨 | 大纲 `outline-panel.js` + F17「要点」tab |
| 水印 | 画布对角线浅色水印 | **不做**（本地工具无水印需求） |

### 1.2 排版与色彩

| 令牌 | 竞品 | MDA CSS 变量建议 |
|------|------|------------------|
| 正文 | 14–15px 无衬线，行高 ~1.6 | 与预览区 `--preview-font` 一致 |
| 占位符 | `#999` 浅灰 | `color: var(--text-muted)` |
| 主色 / 链接 | 蓝色 `#2563eb` 系 | 沿用主题 link 色 |
| AI 强调 | 紫粉渐变图标 + 「✨」前缀 | Pro AI 菜单项左侧统一 sparkle 图标（i18n 不含 emoji 时可 SVG） |
| 块选中框 | 1px 蓝色描边 + 四角圆点手柄 | widget `is-selected`：`outline: 2px solid var(--accent)` |
| 行内 code | 浅灰圆角胶囊 `#f3f4f6`，等宽小字号 | S5：`border-radius: 4px; padding: 0 4px` |

---

## 2. 常驻编辑栏（F11-6）

**参照**：`empty-doc-context-menu.png`、`empty-doc-placeholder.png`、`insert-menu.png` 顶栏。

### 2.1 分组与顺序（左→右）

```
[撤销][重做] | [段落▼][字号] [B][I][U][S][A▼][高亮] [上标] [清除] |
[☑列表][•列表][1.列表][缩进][对齐▼] |
[🔍][💬] | [+ 插入▼] | [WPS AI ▾]
```

MDA 映射（与 P2 §5.1 一致，视觉对齐竞品）：

| 竞品 | MDA | 差异说明 |
|------|-----|----------|
| 字号下拉 | **省略**（Markdown 无字号语义） | 用段落级别 H1–H6 代替 |
| 下划线 / 字体色 / 高亮 | **省略**（非 MD 标准） | 保留 B/I/S/行内 code |
| 评论 | **批注**入口（侧栏已有） | 工具栏可不重复，或收入「更多」 |
| `+ 插入` 绿色主按钮 | `插入 ▾` 同 `/` 全集 | 主色按钮样式：`btn-primary` |
| `WPS AI` 渐变按钮 | `AI ▾` | 点击展开**下拉菜单**（非 WPS 式右侧大侧栏，见 §7） |

### 2.2 溢出（窄窗口）

宽度 &lt; 600px：按 P2 §5.1 优先级收入「更多 ⋯」；**历史、模式、查找** 优先保留。

---

## 3. `/` 插入面板与「插入」菜单（F11-2）

**参照**：`insert-menu.png`。

### 3.1 分组对齐

| 竞品分组 | 竞品项（节选） | MDA `/` 面板 |
|----------|----------------|--------------|
| 首行 | AI 帮我写、H1–H6 快捷图标 | **不含** AI（AI 走专用入口）；文本组含标题 |
| 通用 | 图片、**高亮块**、代码块、表格、引用、分隔线、链接、日期、模板 | 块组；**无高亮块**（3.0 范围外） |
| 图形与数据 | **流程图**、**Mermaid**、思维导图、公式、看板、表格… | 图表组：Mermaid、公式；**无**思维导图/看板/多维表 |

### 3.2 交互

- 竞品：`+ 插入` 与正文 `/` 双入口；MDA：**`/`` 为主**，工具栏「插入 ▾」等价。
- 竞品占位：`输入正文或 '/' 插入内容，双击 Ctrl 唤起 AI` → MDA 占位见 §7.1（**不**实现「双击 Ctrl」，改为 `Ctrl+Shift+Space` 伴写）。

---

## 4. 块级 Widget 规格

### 4.1 代码块（S13）

**参照**：`code-block-toolbar.png`、`code-block-widget.png`。

#### 非聚焦（渲染态）

```
┌─ [Python ▼] ───────────── [固定高度][复制][设置] ─┐
│ 1 │ def fibonacci(n):                              │
│ 2 │     if n <= 1:                                 │
│ ...│  （hljs 语法高亮 + 行号）                      │
└──────────────────────────────────────────────────┘
  [{}⋮⋮]                                    [💬+ AI]
   ↑ 左上拖拽/块菜单                           ↑ 块级 AI（Pro）
```

| 控件 | 行为 | 实现要点 |
|------|------|----------|
| 语言下拉 | 切换 ` ```lang ` 围栏语言标识 | 写回围栏首行，单 transaction |
| 固定高度 | 折叠超长代码，展开查看 | **3.0 可选**（P2 标 P2+）；默认全高 + 内部滚动 |
| 复制 | 复制围栏内纯文本 | 复用 `copyToClipboard` |
| 设置 | 语言/主题子面板 | **3.0 最小**：仅语言；主题跟随编辑器 |
| 行号 | 左侧灰字行号 | widget 内 `line-numbers` 列 |
| 左上 `{}` + 六点 | 悬停显示；拖拽移动块 | **移动**：cut+paste 块级 transaction；tooltip i18n |
| 右上 AI | 块级「解释 / 润色」 | Pro；上下文=围栏内容 |
| 选中描边 | 蓝框 + 四角锚点 | `code-block-widget.png`；锚点仅视觉，**不**改 MD 宽度 |

#### 聚焦

- 竞品：块内直接编辑代码。MDA：光标进入围栏行范围 → **显露源码行**（P1-D12），保留 hljs 高亮层对齐。

### 4.2 Mermaid / 流程图（S17）

**参照**：`mermaid-block-toolbar.png`；**手势**：P0 **D14** / P2 §5.10.9。

#### 顶栏（非聚焦必显）

| 按钮 | 竞品 | MDA |
|------|------|-----|
| 标签 `Mermaid` | 左对齐灰字 | 显示子类型 |
| 问问 AI | 生成/改写 | Pro |
| 模板 | 子类型模板 | `/` 插入时已选；块内可换模板 |
| 代码 | 切源码 | **源码微编辑**（D4 从双击迁至此） |
| 分屏 | 左代码右预览 | **不做** |
| 预览 | 当前视图 | 默认内联 SVG |

#### 选中与全屏（相对 2.0）

| 手势 | 2.0 MDA | 3.0 MDA |
|------|---------|---------|
| 单击块体 | ~280ms 后 **全屏 zoom** | **选中**（蓝框 + 四角手柄 + 浮动条） |
| 双击块体 | **还原默认比例** | **全屏 zoom**（2.0 单击行为） |
| 双击右下角手柄 | 还原默认比例 | **不变** |
| 拖拽手柄 | 会话宽度 | **不变**（选中态四角可拖） |

全屏遮罩内部：**与 2.0 完全一致**（滚轮、平移、复制图/源码、Esc、深色底、默认 72–75% 视口等）。

### 4.3 图片（S22）

**参照**：**`image-block-selected.png`**（终端截图作图片块示例）。

#### 选中态（单击）

```
        [ 询问AI | 替换 | alt | 删除 ]     ← 浮动工具条
    ┌──●────────────────────────────●──┐
    │                                  │
    │         （图片内容）              │
    │                                  │
    └──●────────────────────────────●──┘
         ↑ 2px 蓝色描边 + 四角实心圆手柄
```

| 控件 | 竞品（`image-block-selected.png`） | MDA 3.0 |
|------|----------------|----------------|
| 蓝框 + 四角手柄 | ✅ | ✅ |
| 顶栏浮动条 | 询问 AI、裁剪、对齐、链接、评论、删除… | **最小集**：询问 AI、替换、alt、删除 |
| 右侧叠放钮 | 布局 / 查看原图 | 可选；双击块体即可全屏 |
| 拖拽角点 | 缩放 | 会话宽度，不写回 MD |

#### 全屏（双击块体）

- 调用 2.0 `openZoom`；**不是** WPS 浏览器全屏，而是 MDA 缩放遮罩层。
- 与流程图共用同一套 overlay 实现。

### 4.4 表格（S14）

**参照**：`table-drag-handle.png`。

| 元素 | 竞品 | MDA |
|------|------|-----|
| 左侧六点柄 | 悬停行首出现，拖拽整块 | v2 可选；v1 聚焦显源码 |
| 单元格 | 直接点击编辑 | v2 contenteditable → 行级写回 |
| 行内 code | 单元格内灰色胶囊 | 渲染态与 S5 一致 |

### 4.5 高亮块 / Callout（竞品有，MDA 3.0 不做）

**参照**：`insert-menu.png` 插入项、`doc-outline-inline-code.png` 正文「Core Narrative」灰底 + **左侧蓝色竖条**。

- P0 已排除「高亮块」为独立块类型。
- **可借鉴**：引用块 S11 左侧竖线样式可向此靠拢（加粗竖线 + 浅底）。
- **请补充截图**（若未来纳入）：`highlight-block.png` —— 多种颜色高亮块样式。

### 4.6 行内高亮 / 荧光笔

**参照**：顶栏荧光笔图标（`empty-doc-context-menu.png`）；`image-block-selected.png` 浮动条含高亮按钮。

- Markdown 无标准「背景高亮」语法 → **3.0 不做**行内荧光笔。
- 表格内标签 pill（`mermaid-block-toolbar.png` P0 徽章）→ 可用行内 code 样式近似。

---

## 5. 选区浮动工具条（F11-3）

**参照**：`image-block-selected.png`（图片选中态浮动条；代码块选中时结构类似）。

### 5.1 文本选区

```
[段落▼] [B][I][S][code][🔗] [列表][引用] | [批注] [AI ▾]
```

- 竞品在代码块选中时额外有「询问 AI」置左；MDA：**有选区时 AI ▾ 置右**，代码块选中时左侧可加「询问 AI」快捷（与块顶栏 AI 等价）。

### 5.2 位置与动画

- 选区上方 8px 居中；空间不足 flip 下方；`opacity` + `translateY` 120ms 淡入（避免拖选闪烁）。

---

## 6. 右键菜单（F11-4）

**参照**：`empty-doc-context-menu.png`。

```
  复制          Ctrl+C
  剪切          Ctrl+X
  粘贴          Ctrl+V
  粘贴为纯文本   Ctrl+Shift+V
  ─────────────────
  ✨ AI 帮我写 ▸
```

- AI 项：**分隔线上方最后一组**，带 sparkle 图标；子菜单结构见 P2 §5.6。
- Free：AI 项可见，点击升级提示（D9）。

---

## 7. AI 入口交互（F14 / F17）

### 7.1 入口矩阵

| 入口 | 竞品（截图） | MDA 3.0 |
|------|--------------|---------|
| 顶栏 `WPS AI` | `ai-side-panel.png` 打开**右侧宽侧栏**（写作+阅读助手、深度思考开关） | **下拉菜单** + 动作子项；**不做**常驻 AI 侧栏 |
| 右键「AI 帮我写」 | `empty-doc-context-menu.png` | ✅ 子菜单 |
| 正文占位 | `双击 Ctrl 唤起 AI` | ❌ 改为占位：`输入正文，或按 / 插入内容`；伴写 `Ctrl+Shift+Space` |
| 标题旁「AI 总结」 | `empty-doc-placeholder.png` | ✅ F17 要点 tab + 文内按钮 |
| 侧栏「要点」tab | `ai-summary-tab.png` | ✅ F17 流式总结、复制、插入（Pro） |
| 块顶栏「问问 AI」 | `mermaid-block-toolbar.png`、`code-block-widget.png` | ✅ 代码/Mermaid widget Pro 入口 |
| 选区「询问 AI」 | `image-block-selected.png` | ✅ 浮动条 / 右键 |

### 7.2 竞品 AI 侧栏项 → MDA 动作映射

| 竞品（`ai-side-panel.png`） | MDA F14-2 | 说明 |
|-----------------|-----------|------|
| AI Copilot 伴写 | 伴写 | 显式触发为主 |
| 帮我写 | 续写 | |
| 帮我改 ▸ | 润色（多风格）/ 扩写 / 缩写 / 语病修正 | 子菜单 |
| 校对 | **不做**（P0 排除 AI 校对 beta） | |
| 生成 PPT / 文档美化 | **不做** | |
| 文档问答 / 全文总结 | 解释 / 总结 + F17 要点 | |
| 深度思考开关 | **不做** | |

### 7.3 F17「要点」tab 完整态

**参照**：`ai-summary-tab.png`（左侧栏「要点」tab 已生成总结后的完整界面）。

```
┌─ « 目录    [ 要点 ] ─────────────┐   ← tab 切换；「要点」选中（蓝下划线）
│  [复制]                          │   ← 工具条：复制全文
│                                  │
│  （一段总述摘要，2–4 句）         │
│                                  │
│  • 要点一 …                      │
│  • 要点二 …                      │
│  • …                             │
│                                  │
│  内容由 AI 生成                   │   ← 页脚免责声明（i18n）
└──────────────────────────────────┘
```

| 元素 | 竞品（`ai-summary-tab.png`） | MDA 3.0 |
|------|------------------------------|---------|
| 位置 | 预览区左侧轨，与「目录」并列 tab | 复用 `outline-panel.js` 容器 |
| Tab 切换 | 「目录」「要点」；选中 tab 蓝下划线 | ✅ 同结构；i18n `outline.tab.summary` |
| 生成态内容 | 首段总述 + 圆点列表分条要点 | 流式追加；支持取消 / 重新生成 |
| 复制 | 顶栏复制图标 | ✅ `copyToClipboard` |
| 写入文档 | 竞品默认只读展示 | ✅ 默认**不写入**；显式「插入到文档」才 dirty |
| 脚注 | `内容由 AI 生成` 浅灰小字 | ✅ 同类免责声明（zh/en） |
| 门禁 | 未开通时 tab 可见、点击引导升级 | ✅ F17-4 / AC-29 |

> `doc-outline-inline-code.png` 展示同一左栏在「目录」tab 下的长文场景；`ai-summary-tab.png` 专指切换到「要点」后的**完整生成结果**。

### 7.4 请补充截图

| 文件名建议 | 场景 |
|------------|------|
| `ai-polish-submenu.png` | 右键或顶栏 AI →「帮我改」展开润色子菜单 |
| `ai-diff-adopt.png` | 润色后左右对比 / 采纳条 |
| `formula-block.png` | 公式块渲染与编辑 |

---

## 8. 新建空态（F15-1）

**参照**：`empty-doc-placeholder.png`、`empty-doc-context-menu.png`。

| 元素 | 竞品 | MDA |
|------|------|-----|
| 标题 | `输入标题` 大号居中 | 首行 H1 占位或独立标题区 **不做**（MD 单文件 `# 标题`） |
| 元信息 | 头像、作者、时间、评论数 | **不做**（本地文件无协作者元数据） |
| 正文占位 | 灰色引导 + `/` + AI 快捷键提示 | 单行占位 + 三按钮（模板 / AI 帮我写 / 打开文件） |
| 行首 `+` | 点击插入 | **可选**（P2）：空行左侧 `+` 等价于 `/` |

---

## 9. M8 实机对照清单（VIS）

实现阶段按本表与竞品截图逐项勾选（见 [`M8-acceptance-checklist.md`](../M8-acceptance-checklist.md) VIS 表）。

| ID | 对照截图 | 验收点 |
|----|----------|--------|
| VIS-1 | `empty-doc-context-menu.png` | 顶栏分组间距、插入主按钮、AI 入口可见 |
| VIS-2 | `insert-menu.png` | `/` 面板分组与图标风格 |
| VIS-3 | `code-block-widget.png` | 代码块顶栏：语言/复制/行号/高亮 |
| VIS-4 | `mermaid-block-toolbar.png` | Mermaid 顶栏按钮与图形容器 |
| VIS-5 | `image-block-selected.png` | 图片选中：蓝框 + 四角手柄 + 浮动条 | C1 |
| VIS-5b | — | 图片/Mermaid **双击**全屏（2.0 overlay） | C1 |
| VIS-6 | `empty-doc-context-menu.png` | 右键 AI 分隔与图标 |
| VIS-7 | `doc-outline-inline-code.png` | 行内 code 胶囊样式 |
| VIS-8 | `empty-doc-placeholder.png` | 空态占位与三入口 |
| VIS-9 | `ai-summary-tab.png` | 要点 tab：摘要段 + 列表 + 复制 + AI 脚注 |

---

## 10. 与 P0「明确不做」的对照

| 竞品能力 | 截图 | MDA 3.0 |
|----------|------|---------|
| 高亮块 | `insert-menu.png`、`doc-outline-inline-code.png` | ❌ |
| 思维导图 / 看板 / 多维表 | `insert-menu.png` | ❌ |
| AI 侧栏常驻 | `ai-side-panel.png` | ❌（改下拉） |
| 双击 Ctrl 唤 AI | `empty-doc-placeholder.png` | ❌ |
| 文档协作者元信息 | `empty-doc-placeholder.png` | ❌ |
| 分屏代码/预览 | `mermaid-block-toolbar.png` | ❌（微编辑代替） |
| 字体色 / 荧光笔 / 字号 | 顶栏 | ❌（非 MD） |
