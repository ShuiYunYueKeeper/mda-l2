# Agent Skills — L2 工程模板

本目录包含可通过标准方式安装的 Cursor / Claude Agent Skill。

## 安装

### 方式一：npm 脚本（推荐，本地/内网）

在 `mda-l2` 仓库根目录：

```bash
npm run skill:install
```

安装到：

- `~/.cursor/skills/l2-project-template/`（Cursor 全局）
- `~/.agents/skills/l2-project-template/`（Claude Code 全局）

仅安装到当前项目：

```bash
npm run skill:install:project
```

### 方式二：直接运行脚本

```bash
node scripts/install-l2-skill.js
node scripts/install-l2-skill.js --project
```

### 方式三：npx skills（需 Git 仓库可访问）

若本仓库已推送到可访问的 Git 远端（GitHub / GitLab）：

```bash
# GitHub 简写
npx skills add ShuiYunYueKeeper/mda-l2@l2-project-template -g --copy -y --agent cursor

# 完整 Git URL
npx skills add https://github.com/ShuiYunYueKeeper/mda-l2 \
  -s l2-project-template -g --copy -y --agent cursor
```

> `npx skills` 从 Git 克隆仓库，需本机有访问权限且仓库含 `skills/l2-project-template/SKILL.md`。

## 目录结构

```
skills/l2-project-template/
├── SKILL.md              # Skill 主文件
├── scripts/              # init-project.ps1 / .sh
├── references/           # 裁剪指南、工作流速查
└── template/             # 完整 L2 工程模板（init 脚本复制源）
```

## 使用

安装后，在 Cursor 中说：

- 「用 L2 模板创建项目」
- 「初始化 L2 脚手架」

或手动初始化新项目：

```powershell
& "$env:USERPROFILE\.cursor\skills\l2-project-template\scripts\init-project.ps1" `
  -TargetPath "D:\projects\my-app" -ProjectName "my-app"
```

## 维护同步

更新 `l2-project-template/` 或 skill 后，同步到 skill 包：

```bash
npm run skill:sync
```
