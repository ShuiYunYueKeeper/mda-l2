# prompt-21 — 整体代码审查与调整

> 日期：2026-07-23  
> 状态：已调整，未提交；GUI/安装包仍需实机验收

## 审查范围

- 当前未提交的 M6b GUI 改动及对应 `dist` 产物。
- core writer / anchor、CLI、MCP、GUI preload 与文件操作边界。
- npm 命令入口、依赖安全和 GUI 资源复制链。

## 已调整

1. **选区 anchor 稳定性**
   - `src/core/writer.ts`：编辑/删除批注时按全部批注行长度变化迭代修正后续 UTF-16 anchor；落盘前移除 `line/file` 派生字段。
   - 原因：批注行变长或删除会改变原始文本偏移，导致后续选区批注失效。
2. **围栏与写入保护**
   - `src/core/writer.ts`：批注扫描和源文件保护复用 fence mask，围栏内 `@anno` 样例按正文保护。
   - 原因：此前 add 可能改写代码围栏中的字面样例，保护校验也无法发现。
3. **运行时数据校验**
   - core add/edit 增加 level/status 枚举守卫；`validateAnchor` 在 quote 存在时校验原文匹配。
   - CLI 行号改用严格正整数判断；CLI/MCP edit 支持将 content/tags 清空。
4. **工作区真实路径边界**
   - `src/mcp/workspace.ts`、`src/gui/main/file-ops.js`：使用 realpath（含不存在目标的最近父目录）校验 symlink/junction。
   - 原因：仅按字符串 `path.relative` 判断可通过工作区内链接访问外部路径。
5. **公式渲染依赖**
   - 以 `@vscode/markdown-it-katex` + KaTeX 0.16+ 替换无修复版本的 `markdown-it-katex`/KaTeX 0.6，显式关闭 KaTeX trust。
   - 原因：旧插件存在已知公式渲染 XSS。
6. **GUI 输入与外链**
   - 文件冲突弹窗转义动态文件名；renderer/main 双层限制外链协议为 `http/https/mailto/file`。
   - 原因：避免文件名 HTML 注入和未知自定义协议交给系统处理。
7. **命令入口与构建**
   - CLI 增加 shebang；GUI `mda` bin 改为 Electron launcher，并将 Electron 作为运行依赖。
   - `copy-gui` 在 Mermaid/KaTeX 必需资源缺失时构建失败，不再只警告后发布残缺 GUI。
8. **M6b GUI 复核修正**
   - 拖动后短时抑制误触但不吞后续正常点击；复制预览记录实际显示宽度；弹窗 focus trap 显式释放；缩放帮助文案与设置语义同步。

## 新增回归覆盖

- writer：非法枚举、围栏字面批注、编辑/删除前置批注后的 anchor 有效性、派生字段不落盘。
- anchor：quote 一致与不一致。
- CLI/MCP：清空 content/tags、CLI 非法行号。
- MCP/GUI 文件操作：symlink/junction 越界。

## 尚需后续处理

- preload 桥接仍较宽，应按当前文件/工作区能力进一步收窄，而不是在本轮直接破坏既有 GUI 契约。
- 主进程历史错误返回仍有单语中文，需要按 IPC 分组补齐 zh/en。
- Jest 覆盖率仍未纳入主要 GUI JS 和打包产物；需要补 GUI 集成与安装包 smoke test。
- Electron、MCP SDK 等剩余依赖告警涉及升级兼容性，不能用 `npm audit fix --force` 直接处理。
- GUI 启动、公式、文件冲突弹窗、外链和打包安装版须完成人工实机验收。
