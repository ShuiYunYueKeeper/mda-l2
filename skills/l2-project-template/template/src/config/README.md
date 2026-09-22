# src/config — 可配置规则

将枚举、正则、配色、严重度等「单一真相」外置为 JSON（或 YAML），
core 从中派生常量，避免多处硬编码漂移。

## 示例

```json
{
  "levels": ["critical", "major", "minor", "info"],
  "colors": { "critical": "#e53935" }
}
```

## 约束

- 变更须同步 `tests/core/config.test.ts`（锁定派生值一致）
- 文档见 `AGENTS.md` 关键文件索引
