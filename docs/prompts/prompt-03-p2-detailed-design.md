# AI 协作记录 — P2 详细设计

---

## Prompt 1: P2 详细设计

```
用户: 详细设计请参照 docs/templates/design.template.md 模板
```

AI: 生成 `docs/P2-detailed-design.md`，核心产出：
- 段落归属状态机算法（IN_BLANK_LINE / IN_PARAGRAPH + 伪代码）
- 原子写入策略（临时文件 + fs.rename）
- CLI 命令详细规格（每个命令：签名 + Options + stdout/stderr + exit code）
- GUI 组件 TypeScript 接口（App/Preview/AnnotationPanel/EditDialog）
- E1-E24 边界用例清单
- 批注不可见性自动化验证（3 断言 + CI 集成）
- 图片 alt fallback 实现方案（markdown-it 自定义 renderer + 双重 DOM）
- GUI 添加批注行号默认值（段落点击 → cursorLine → 预填弹窗）

---

## Prompt 2: P2 反馈（删除后空行压缩规则）

```
用户: 删除后空行压缩规则（保留一个空行）缺失。
详细设计的 remove 命令行为与之前需求补充的"删除后空行压缩规则"冲突。
建议：增加一步：删除批注行后，检查其上方和下方是否同时为空行；
若是，则移除一个多余空行。同时增加 E25 边界用例。
```

AI: 修正 P2 v3：
- §3.4.3 新增空行压缩规则（伪代码 + 示例）
- §3.5.4 remove 行为修正为"删除批注行后同时执行空行压缩"
- E1-E24 → E1-E25，新增 E25

---

## Prompt 3: P2 确认

```
用户: 确认
```

AI: `git commit` P2 → 进入 P3 实现步骤。
