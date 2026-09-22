# src/cli — 命令行接口（可选）

薄适配层：参数解析 + 输入校验 + stdout/stderr 格式化。

## 结构

```
cli/
├── main.ts           # commander 入口
└── commands/         # 子命令
    └── {command}.ts
```

## 约束

- 业务逻辑一律调用 `src/core`，禁止复制
- stdout 仅输出结果数据；警告/错误走 stderr
- 见 `AGENTS.md` §8 禁止事项
