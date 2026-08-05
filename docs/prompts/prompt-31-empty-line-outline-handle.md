# P4 迭代记录 — 空白行插入 / 大纲折叠 / 块手柄撤销

> 日期：2026-08-05  
> 阶段：P4 / M8-E 交互层（前置打磨）  
> 用户实机：✅ 已验证

## 本轮改动

| # | 需求 | 结论 |
|---|------|------|
| 1 | 空白行 hover 显示「+」；tooltip「插入内容」；行浅蓝高亮 | ✅ |
| 2 | 光标在空白行显示占位「输入正文或 "/" 插入内容，双击 Ctrl 唤起 AI」 | ✅ |
| 3 | 点击「+」弹出扁平插入菜单（图片…/表格/代码块/引用/流程图/分隔线） | ✅ |
| 4 | 大纲手动折叠后，滚动正文**不**自动展开；点击正文标题**仍**自动展开祖先 | ✅ |
| 5 | 大纲折叠子项高亮时点击父级收缩，不再被 `setActiveLine` 立刻展开 | ✅ |
| 6 | 块小手柄「上/下方插入」后 `Ctrl+Z`，光标落在插入点附近而非文档头 | ✅ |
| 7 | 表格 widget 外框直角（`border-radius: 0`） | ✅ |

## 实现要点

- **空白行**：`empty-line-insert.js` — hover 层 + 占位 widget；`empty-line-insert-menu.js` — 6 项扁平菜单；`insertSnippetAtBlankLine` 替换空行
- **大纲**：`outline-panel.js` — `setActiveLine` 增 `expandAncestors`；`app.js` 滚动同步传 `{ expandAncestors: false }`；点击标题走 `syncOutlineFromHeadingClick` 保持默认展开
- **撤销光标**：`block-handle-ops.js` — `pinSelectionForHistory`（`addToHistory: false`），插入前钉到块边界，与 `deleteBlockRange` 同模式
- **i18n**：`emptyLineInsertTooltip` / `emptyLinePlaceholder`（zh+en）

## 测试

- `tests/gui/editor/outline-scroll.test.ts`
- `npm test -- tests/gui/editor`（148 项）
- `npm run build:editor`；`npm run build:gui`

## 遗留

- **SEL-1** 正文拖选仍 ❌ 阻塞总验收
- 图片插入菜单项仍为 `soon` 占位
- **M8-E** `/` 斜杠菜单、浮动工具栏等待办

## 待补截图（须用户实机）

| 建议文件名 | 拍摄要点 |
|------------|----------|
| `docs/screenshots/19-empty-line-insert.png` | 空白行 hover「+」+ 扁平插入菜单 |
| `docs/screenshots/20-outline-scroll-collapsed.png` | 大纲折叠某节后滚动正文，节保持折叠 |
| `docs/screenshots/21-block-handle-insert-menu.png` | 块小手柄完整菜单（AI/插入/复制） |

入库后更新 `README.md`「界面截图与演示」引用。
