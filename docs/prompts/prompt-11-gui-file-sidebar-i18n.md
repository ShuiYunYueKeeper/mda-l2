# Prompt 11 — GUI 文件侧栏增强、i18n 与拖动修复

> 接续 `prompt-07-copy-article-packaging.md` / `prompt-10-phase-a-release-tag.md`  
> 日期：2026-07-16  
> 状态：代码与用户实机验证已通过；本文档为 P4 Step 5 归档

---

## Prompt 26: 批注区默认收起 + 编辑区偏好记忆

```
用户: 批注面板默认收起；手动关闭编辑区后切换文档不再自动展开
```

AI 动作：

- 批注面板初始 `collapsed`；工具栏「批注」开关与布局一致。
- `editorUserDismissed` + `localStorage`（`mda-editor-pane-dismissed`）：用户手动收起编辑栏后，换文档保持收起。

---

## Prompt 27: 文件侧栏布局与导航

```
用户: 侧栏可拖宽、双击复位；悬停显示全名；↑↓ 切换工作区内文档
```

AI 动作：

- 侧栏右缘拖动手柄；双击复位默认宽度。
- `title` 属性展示完整路径/文件名。
- 文件树获焦时 `ArrowUp` / `ArrowDown` 按 DFS 顺序切换并 `openFile`。

---

## Prompt 28: 工作区与侧栏偏好持久化

```
用户: 记住侧栏收起状态、宽度、上次工作区、目录展开状态
```

AI 动作：

- `src/gui/main/workspace-prefs.js`：读写用户目录偏好。
- `file-sidebar.js` 启动时恢复 `workspaceKey`、展开目录、`collapsed`、宽度。

---

## Prompt 29: 文件列表 CRUD 与剪贴板

```
用户: 拷贝文件名、重命名、删除；复制/剪切/粘贴；Ctrl+Z 撤销；重名冲突弹窗
```

AI 动作：

- 主进程 `file-ops.js`：`copyFileToDir` / `moveFileToDir` / `renameFileConflict` / `uniqueDestPath`；路径须在工作区内（`resolveInWorkspace`）。
- IPC：`rename-file`、`delete-file`、`copy-file-to-dir`、`move-file-to-dir`、`file-exists`。
- 渲染层：`fsClip`、`fsUndoStack`、`transferWorkspaceFile`、`uiFileConflictConfirm`（覆盖 / 自动重命名 / 取消）。
- 重命名对话框仅编辑主文件名，扩展名只读展示。
- 快捷键（文件树获焦）：`Ctrl+C`/`Ctrl+X`/`Ctrl+V`、`Ctrl+R` 重命名、`Delete` 删除、`Ctrl+Z` 撤销；获焦时 `Ctrl+R` 拦截菜单「重载」。

---

## Prompt 30: GUI 全面 i18n + Windows 打包说明

```
用户: 界面中英切换；Windows 打包、更新检查、签名与语言说明文档化
```

AI 动作：

- `src/gui/main/i18n.js`、`src/gui/renderer/i18n.js`；菜单「视图 → 界面语言」。
- 所有用户可见文案经 `t` / `uiT` / `MDAI18n`；新增键须 **zh + en** 成对（AGENTS.md §6）。
- `docs/packaging-windows.md`：签名、语言、`latest.yml`、更新检查。

---

## Prompt 31: 拖动移动 Bug 修复（实机验证通过）

```
用户: 拖动移动误报成功、目标无文件、同名冲突弹窗时机不对（仅拖动）
```

根因：

1. `drop` 用 `e.target.closest('.dir')` 不可靠 → 目标常算成源目录 → `moveFileToDir` 同路径 noop 却曾返回 `success: true`。
2. `dragover` 已高亮目标但 `drop` 未复用；`e.ctrlKey` 在 `drop` 时不准。

修复：

- `dragover` 记录 `dropTargetDir`、`lastDropIsCopy`（文件夹行 / 文件行父目录）。
- `drop` 优先 `dropTargetDir`；同目录移动静默忽略。
- `moveFileToDir` 同路径返回 `{ noop: true }`；`transferWorkspaceFile` 不 toast。

---

## Prompt 32: 文案插值与路径解析修复

```
用户: 删除框显示 {name}、移动失败显示 {error}；工作区根路径解析失败
```

AI 动作：

- `uiT(key, vars)` 转发 `vars` 至 `MDAI18n.t`。
- `resolveInWorkspace`：`rel === ''` 时正确解析为工作区根目录。

---

## 验证

| 项 | 结果 |
|----|------|
| `npm test` | 117 用例通过 |
| GUI 实机 — 拖动移动 | 拖到文件夹行/文件行、同名冲突、同目录不误报 ✅ |
| GUI 实机 — 重命名/删除/粘贴/撤销 | ✅ |
| GUI 实机 — 中英切换 | ✅ |

---

## Step 5 文档同步（本轮）

| 文档 | 更新内容 |
|------|----------|
| `README.md` | 文件侧栏能力、i18n、工作区偏好 |
| `AGENTS.md` | preload 文件 IPC、隐性规范 4i、关键文件索引 |
| `quality.md` | 文件侧栏 / 拖动 / i18n 人工审核点 |
| `docs/few-shot-examples.md` | 拖动目标解析、uiT 插值、文件冲突 |
| `docs/README.md` | 索引 + packaging；`demo/` 标注暂不入库 |
| `docs/screenshots/README.md` | 文件侧栏操作待补截图 |
| `.gitignore` | `docs/demo/` 暂不入库 |

> `docs/demo/` 为团队分享草稿，**本轮不 commit**。
