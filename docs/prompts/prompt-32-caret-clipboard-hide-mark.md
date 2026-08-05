# Prompt 32 — hide-mark 点击落点与剪贴板

> 日期：2026-08-05  
> 阶段：P4 / M8-C0  
> 状态：✅ 用户验收通过

## 背景

预览模式 hide-mark + atomic 导致：
1. 点击渲染后的标题/粗体/行内 code，源码光标落在定界符内侧
2. 复制/粘贴丢失或残留不完整 `**` / `` ` ``
3. 拖选边界与剪贴板行为不一致

## 实现

| 模块 | 职责 |
|------|------|
| `caret-syntax-adjust.js` | 单击/拖选端点校准到定界符外侧 |
| `click-collapse.js` | 单击 `placeCaret`；拖选 `adjustDragSelection` |
| `syntax-clipboard.js` | `copy`/`cut`：成对保留 Markdown，单侧去掉定界符 |
| `live-preview.js` / `mount.js` | 挂接剪贴板处理器 |

## 验收要点

- [x] 点击「目录结构」→ 源码光标在 `##` 左侧
- [x] 点击 `**MDA**` 左/右缘 → 开/闭 `**` 外侧
- [x] 拖选含单侧定界符 → 粘贴无 `**`/`` ` ``
- [x] 完整选中 `**MDA**` → 粘贴保留 Markdown

## 测试

```bash
npm test -- tests/gui/editor/caret-syntax-adjust.test.ts tests/gui/editor/syntax-clipboard.test.ts
npm run build:editor
```

## 遗留

- SEL-1 正文选区着色仍 ❌（用户要求先搁置）
- 标题行 Enter 保留 `##` 前缀（未在本轮交付）
