# MDA — Markdown 批注管理工具

通过 Markdown 标准注释语法在 `.md` 文件中嵌入结构化批注，提供 **CLI** (`mda-cli`) 和 **GUI** (`mda`) 两种使用方式。

## 目录结构

```
mda-l2/
├── src/
│   ├── core/                  # 共享核心库 @mda/core
│   │   ├── model.ts           # 类型定义 (Annotation, Paragraph, ScanResult)
│   │   ├── parser.ts          # 批注解析器 (状态机段落归属算法)
│   │   ├── writer.ts          # 批注写入器 (原子写入 + 空行压缩 + 源文件保护)
│   │   ├── renderer.ts        # Markdown 渲染器 (CommonMark 0.31 + GFM 表格)
│   │   └── index.ts           # barrel export
│   ├── cli/
│   │   ├── main.ts            # CLI 入口 (commander)
│   │   └── commands/          # 子命令实现
│   │       ├── scan.ts        # 扫描批注
│   │       ├── add.ts         # 添加批注
│   │       ├── edit.ts        # 编辑批注
│   │       └── remove.ts      # 删除批注
│   ├── gui/
│   │   ├── main.js            # Electron 主进程
│   │   ├── preload.js         # contextBridge + markdown-it
│   │   └── renderer/
│   │       ├── index.html     # HTML shell
│   │       └── app.js         # 渲染进程 (纯 JS)
│   └── scripts/
│       └── copy-gui.js        # GUI 文件复制脚本
├── tests/
│   ├── core/
│   │   ├── parser.test.ts     # parser 25 边界用例 (E1-E25)
│   │   ├── writer.test.ts     # writer 原子写入 + 空行压缩 + 源文件保护
│   │   └── renderer.test.ts   # 批注不可见性验证 + CommonMark 语法覆盖
│   └── cli/                   # CLI 集成测试
├── docs/
│   ├── P0-requirements.md     # 需求分析
│   ├── P1-architecture.md     # 架构设计
│   ├── P2-detailed-design.md  # 详细设计
│   ├── P3-implementation-plan.md # 实现步骤
│   ├── prompts/               # AI 协作记录
│   ├── screenshots/           # GUI 截图 + 录屏
│   └── templates/             # 阶段模板
├── demo.md                    # 演示用 Markdown 文件
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 技术栈

| 组件 | 技术 | 版本要求 |
|------|------|----------|
| 运行时 | Node.js | ≥ 18 |
| 包管理器 | npm | ≥ 9 |
| 语言 | TypeScript | ^5.5 |
| CLI 框架 | commander | ^12.1 |
| Markdown 渲染 | markdown-it (CommonMark 0.31 preset + GFM 表格) | ^14.1 |
| GUI 框架 | Electron | ^31.1 |
| 测试 | Jest + ts-jest | ^29.7 |
| 覆盖率 | Jest 内置 (lcov + text) | — |

## 运行指引

### 1. 安装依赖

```bash
npm install
```

### 2. 构建

```bash
npm run build
```

### 3. 启动

**CLI 模式：**

```bash
# 扫描批注（表格输出）
npm run cli -- scan demo.md

# 扫描批注（JSON 输出）
npm run cli -- scan demo.md --format json

# 添加批注
npm run cli -- add demo.md 12 "这里是批注内容" --tags bug --level major

# 编辑批注
npm run cli -- edit demo.md <批注ID> --status resolved

# 删除批注
npm run cli -- remove demo.md <批注ID>
```

**GUI 模式：**

```bash
# 打开空窗口
npm run gui

# 直接打开指定文件
npm run gui -- demo.md
```

## 批注语法

批注通过 Markdown 标准注释语法嵌入，渲染后完全不可见：

```markdown
[comment]: <> (@anno {"id":"<UUID>","content":"批注内容","tags":["tag1"],"level":"major","status":"open","created_at":"2026-06-26T00:00:00+08:00"})
被批注的正文段落。
```

批注字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID string | 唯一标识 |
| content | string | 批注内容 |
| tags | string[] | 标签列表 |
| level | critical/major/minor/info | 严重级别 |
| status | open/resolved/wontfix | 状态 |
| created_at | ISO 8601 | 创建时间 |

## 验证方法

```bash
# 运行全部测试
npm test

# 运行覆盖率统计
npm run coverage
# 报告在 coverage/lcov-report/index.html
```

## 覆盖率统计

使用 Jest 内置 coverage 引擎，输出格式：

- **text** — 终端摘要
- **lcov** — `coverage/lcov.info`（可导入 IDE）
- **html** — `coverage/lcov-report/index.html`（浏览器查看）

当前覆盖率：**Statements 87.93% / Lines 93.18% / Functions 95%**（50 个测试用例全部通过）。
