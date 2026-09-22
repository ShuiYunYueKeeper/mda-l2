# tests — 测试

## 组织

| 目录 | 内容 |
|------|------|
| `tests/core/` | 核心单元测试，边界用例编号 E1–EN（在 P2 定义） |
| `tests/cli/` | CLI 集成测试（stdout 纯净、退出码、round-trip） |

## 命名

`{module}.test.ts`，与 `src/` 结构对应。

## 运行

```bash
npm test
```

覆盖率门槛与当前数值记录在 `quality.md` §2。
