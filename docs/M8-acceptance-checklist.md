# M8 Phase — 预览直接编辑（WYSIWYG）验收清单

> 对应 P3 [`P3-implementation-plan-v3-wysiwyg.md`](P3-implementation-plan-v3-wysiwyg.md)；前置：P0 **v1.10** / P1 **v1.6** / P2 **v1.4** 已确认。  
> 产品目标：**全程隐藏 Markdown 语法**（P0 **D15**），坐标质量优先于工期。  
> 状态：**实现中**（M8-A ✅；M8-B **B8b/COORD-1–4 ✅**；**分阶段交付中**）

## 分阶段交付顺序（硬约束）

> **未签收当前阶段，不得默认开启下一阶段块 widget。**  
> 控制台切换：`localStorage.setItem('mda-editor-widget-phase','image')` 等，重启 GUI。

| 阶段 | `mda-editor-widget-phase` | 范围 | 状态 |
|------|---------------------------|------|------|
| **0 · 文本** | `text` | 标题 H1–H6、正文、粗斜体、行内代码、链接、列表、引用、任务勾选 | ✅ 2026-07-30 |
| **1 · 图片** | `image` | 图片块 widget + 默认缩放 + 选中右下角拖拽缩放 + 双击放大 | ✅ 2026-07-30 |
| **2 · 流程图** | `mermaid` | Mermaid 块 widget + 选中缩放 + 代码编辑 + 复制图片/源码 + 双击全屏 + 顶栏 i18n | ✅ 2026-07-31 |
| **3 · 表格** | `table`（**开发默认**） | GFM 表格块 widget + 就地编辑 | 🔄 |
| 4 · 代码/其他 | `code` / `full` | 围栏代码块、分隔线等 | ⬜ |

兼容：旧键 `mda-editor-block-widgets=1` 视为 `full`（仅开发调试）。

## 总览

| Phase | 主题 | 状态 | 用户实机 |
|-------|------|------|----------|
| M8-A | 基座 + 双模式 + 保存 | ✅ | ✅ 2026-07-30 |
| M8-B | 装饰层 S1–S12 + **坐标闸门** | ✅ | ✅ COORD-1–4 2026-07-30 |
| M8-C0 | **文本阶段签收**（标题/正文） | ✅ | ✅ 2026-07-30 光标/坐标 |
| M8-C1 | 图片 widget | ✅ | ✅ 2026-07-30 |
| M8-C2 | Mermaid widget | ✅ | ✅ 2026-07-31 |
| M8-C3 | 表格就地编辑 | 🔄 | ⬜ |
| M8-D | 批注共存 | ⬜ | ⬜ |
| M8-E | 交互层（栏/`/`/浮动/右键） | ⬜ | ⬜ |
| M8-F | 文档态 / 模板 | ⬜ | ⬜ |
| M8-G0 | AI 模型设置 | ⬜ | ⬜ |
| M8-G | Pro AI 入口 | ⬜ | ⬜ |
| M8-H | 导出离屏化 | ⬜ | ⬜ |
| M8-I | 退役清理 | ⬜ | ⬜ |
| M8-J | 测试文档总验收 | ⬜ | ⬜ |

## 坐标闸门（M8-B8 · D15 硬约束）

> 开发辅助：`editor/config.js` + 点击三色点 HUD（`mda-editor-debug-click`）；**发布** `MDA_EDITOR_RELEASE=1` 须关闭。

| ID | 场景 | 操作 | 预期 | 状态 |
|----|------|------|------|------|
| COORD-1 | 普通段落 | 点击行内多位置 | 红≈蓝≈绿；HUD `点击→映射 Δ` ≤2px | ✅ |
| COORD-2 | 标题 + 粗体 + 链接混排 | 点击可见文字 | 同上 | ✅ |
| COORD-3 | GFM 表格行（含 `` `code` ``） | 点击 `npm run gui` 等 ASCII 段 | 光标落在点击处，不跳到右侧中文 | ✅ |
| COORD-4 | 长行折行 | `lineWrapping` 开启下点击第二视觉行 | 映射到正确源码偏移 | ✅ |
| COORD-5 | 块 widget 阶段开启后 | 点块 widget 上下方正文 | 纵向偏差 ≤2px | 🔄 图片+Mermaid ✅；表格/代码待签收 |

## 开发配置（`editor/config.js`）

| 开关 | localStorage | 开发默认 | 发布 |
|------|--------------|----------|------|
| 点击诊断 HUD | `mda-editor-debug-click` | 开 | 关 |
| **Widget 阶段** | `mda-editor-widget-phase` | **`table`** | **`text`** |
| 装饰构建日志 | `mda-editor-log-deco` | 关 | 关 |

```bash
# 发布编辑面 bundle（关闭调试）
MDA_EDITOR_RELEASE=1 npm run build:editor
```

## AC 映射（勾选）

| AC | 摘要 | Phase | 状态 |
|----|------|-------|------|
| AC-7 | 预览区编辑并保存 | B | ✅ 保存 + 点击（B8b） |
| AC-12 | 模式切换保真 | A | 🔄 |
| AC-18 | 源码真源 `doc.toString()` | A | ✅ |
| AC-20 | 模式切换 `Ctrl+E` | A | ✅ |

## 竞品视觉对照（VIS）

| ID | 对照截图 | 验收点 | Phase | 状态 |
|----|----------|--------|-------|------|
| VIS-7 | `doc-outline-inline-code.png` | 行内 code 胶囊；**语法不可见** | B | ✅ |

## 闸门记录

| 闸门 | 日期 | 结果 | 备注 |
|------|------|------|------|
| M8-A 基座 | 2026-07-30 | ✅ | 双模式、保存、CM6 挂载 |
| M8-B8b 坐标 | 2026-07-30 | ✅ | 用户签收 COORD-1–4 |
| M8-C0 文本阶段 | 2026-07-30 | ✅ | 用户签收光标/坐标 |
| M8-C1 图片 | 2026-07-30 | ✅ | 工具栏替换/删除；Ctrl+V 粘贴；顶栏 i18n |
| M8-C2 Mermaid | 2026-07-31 | ✅ | 用户签收：缩放/代码编辑/复制/全屏/COORD-5 |
| M8 总验收 | | ⬜ | |

## 自动化

```bash
npm test -- tests/gui/editor
npm run build:editor
npm run build:gui
npm run gui -- samples/all-features.md
```
