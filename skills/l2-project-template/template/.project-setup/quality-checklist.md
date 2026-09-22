# 质量验证清单

Phase 4 使用此清单逐项验证。每项标注 ✅（通过）/ ❌（未通过）/ ⏭️（不适用）。

---

## 1. 项目可运行性

### 1.1 依赖管理
- [ ] 依赖管理文件存在且格式正确
- [ ] 所有依赖版本已明确指定（无 `latest`/`*`）
- [ ] 依赖安装命令执行成功（无报错、无 deprecated 警告）
- [ ] lock 文件已生成（如 package-lock.json / pnpm-lock.yaml / Cargo.lock）

### 1.2 构建
- [ ] 构建命令执行成功
- [ ] 构建产物生成在预期位置
- [ ] 无编译警告（或警告已知且可接受）

### 1.3 运行
- [ ] 程序/服务可正常启动
- [ ] 入口页面/接口/输出符合预期

### 1.4 开发体验
- [ ] 开发服务器（如有）可正常启动
- [ ] 热重载/Watch 模式（如有）工作正常
- [ ] lint 命令可执行且通过
- [ ] format 命令可执行且无变更（已格式化）

## 2. 资产完整性

### 2.1 必备文件
- [ ] `README.md` 存在且内容完整
- [ ] `.gitignore` 存在且覆盖：构建产物、依赖目录、IDE 配置、环境变量文件
- [ ] `.editorconfig` 存在且与项目编码规范一致
- [ ] 依赖管理文件存在（`package.json` / `requirements.txt` / `Cargo.toml` 等）

### 2.2 README 质量
- [ ] 包含项目简介（一句话说明项目做什么）
- [ ] 包含环境要求（运行时版本、包管理器版本）
- [ ] 包含安装步骤（可复制粘贴直接执行）
- [ ] 包含启动命令
- [ ] 包含项目结构说明
- [ ] 包含开发指南（编码规范要点、常用命令）
- [ ] 所有命令可实际执行成功

### 2.3 配置一致性
- [ ] `.editorconfig` 中的缩进设置与 lint 配置一致
- [ ] `.editorconfig` 中的行尾设置与 `.gitattributes`（如有）一致
- [ ] lint 规则与 format 规则无冲突

## 3. 文档准确性

- [ ] README 中描述的目录结构与实际一致
- [ ] README 中列出的技术栈与实际依赖一致
- [ ] README 中的所有命令在当前项目中可执行
- [ ] 配置文件中的路径引用指向存在的文件/目录

## 4. AI 产出复核

以下为 AI 生成内容的高频出错点，必须逐项人工或自动验证：

### 4.1 依赖真实性
- [ ] 所有依赖包名在包管理器仓库中真实存在
- [ ] 所有依赖版本号在包管理器仓库中真实存在
- [ ] 无拼写错误的包名

验证方法：
```bash
# npm/pnpm: 安装成功即验证通过
# pip: 安装成功即验证通过
# cargo: cargo check 通过即验证通过
```

### 4.2 配置文件语法
- [ ] JSON 文件可被 JSON parser 正确解析
- [ ] YAML 文件缩进正确、无 Tab 混入
- [ ] TOML 文件语法正确
- [ ] TypeScript/JavaScript 配置文件无语法错误

验证方法：
```bash
# JSON: node -e "JSON.parse(require('fs').readFileSync('file.json'))"
# YAML: python -c "import yaml; yaml.safe_load(open('file.yaml'))"
# TS: npx tsc --noEmit (如有 tsconfig)
```

### 4.3 路径正确性
- [ ] import/require 语句指向存在的模块
- [ ] 配置中引用的文件路径存在
- [ ] 入口文件（main/entry）路径正确

### 4.4 示例代码
- [ ] 示例代码使用的 API 与依赖版本匹配
- [ ] 示例代码可直接运行无报错
- [ ] 无遗漏的类型声明（TypeScript 项目）

## 5. 安全基线

- [ ] `.gitignore` 包含 `.env` / `.env.local` 等环境变量文件
- [ ] `.gitignore` 包含密钥/证书文件模式（`*.pem`, `*.key`）
- [ ] 无硬编码的密钥、Token、密码
- [ ] 无不必要的端口暴露配置
