# AI 协作记录 — P3 实现步骤

---

## Prompt 1: P3 实现步骤

```
用户: （P2 确认后自动进入 P3）
```

AI: 按 `docs/templates/dev-plan.template.md` 生成 `docs/P3-implementation-plan.md`。

核心产出：
- 接口定义（@mda/core 全部 8 个公共 API 的 TypeScript 签名）
- CLI/GUI 公共接口（命令签名 + 入口行为）
- 任务 DAG：6 Phase 25 任务，标注依赖/并行/文件/步骤
- 总预估：~2400 行源码 + 650 行测试 + 200 行配置/文档
- 预死亡 3 条（IPC 签名不一致/off-by-one/innerHTML onerror）+ 回滚策略
- 2 个低置信度决策点（图片 fallback 75%、段落点击映射 78%）
- 综合置信度 88%

---

## Prompt 2: P3 确认

```
用户: 确认
```

AI: `git commit` P3 → 进入 P4 实现。
