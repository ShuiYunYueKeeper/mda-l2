# AI 协作记录 — P1 架构设计

---

## Prompt 1: P1 架构设计

```
用户: 确认（P0）→ 进入 P1
```

AI: 按照 `docs/templates/design.template.md` 生成 `docs/P1-architecture.md`。

关键决策：
- 3 方案对比：Electron vs PySide6 vs Wails → 推荐 TypeScript + Electron
- markdown-it 为唯一通过 CommonMark 0.31 全部 spec 的 JS 库
- CLI + GUI 共享 `@mda/core`，保证两种模式行为一致
- 预估 ~2000 行源码 + ~470 行测试，13 个任务（T0-T12）
- 综合置信度 88%

---

## Prompt 2: P1 反馈（原子写入 + 图片 fallback + 不可见性 + 段落算法 + 边界用例 + 行号默认值）

```
用户: 6 项反馈
1. 原子性写入策略 — 需求分析补充 NF-9，writer 模块需明确实现方式
2. 图片缺失时的 alt 文本占位符 — GUI Preview 组件未明确
3. 渲染不可见性的自动化验证 — 增加集成测试
4. 段落归属算法细节 — P2 核心算法设计
5. 边界测试用例覆盖 — 明确 E1-E20 具体内容
6. GUI 添加批注的行号默认值 — 点击段落记录行号
```

AI: 确认 6 项全部纳入 P2 详细设计，P1 commit 进入 P2。

---

## Prompt 3: P1 确认

```
用户: 确认
```

AI: `git commit` P1 → 进入 P2 详细设计。
