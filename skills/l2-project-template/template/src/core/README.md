# src/core — 核心业务库

纯 TypeScript，**不依赖** CLI/GUI/Electron 等适配层框架。

## 推荐模块

| 文件 | 职责 |
|------|------|
| `model.ts` | 类型、枚举、守卫函数 |
| `{domain}.ts` | 核心业务逻辑（解析/写入/渲染等） |
| `index.ts` | barrel export 公共 API |

## 约束

- 禁止 `import` 来自 `src/cli` 或 `src/gui`
- 禁止直接读写文件（IO 放在 writer 或适配层，按 P2 设计）
- 公共 API 变更须同步 `AGENTS.md` §5 与 `tests/`
