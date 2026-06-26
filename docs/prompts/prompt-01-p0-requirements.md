# AI 协作记录 — P0 需求分析

---

## Prompt 1: 导出需求文档

```
用户: 导出需求文档 https://365.kdocs.cn/l/cmu0HMdJ45nu
使用 skill wps-doc-cli 导出需求文档
```

AI 动作：使用 `wps-doc-cli` skill 从金山文档导出需求文档为 Markdown，保存到 `D:\mda-l2\需求文档.md`。

---

## Prompt 2: 进入 P0 需求分析

```
用户: 对需求文档进行 P0需求分析→P1架构设计→P2详细设计→P3实现步骤，
每阶段产出文档，确认后进入下一阶段并 git commit。P4实现阶段遵循：
Step1审查→Step2实施→Step3自查→Step4验证→Step5文档→Step5.5commit→Step6下一步。
中间产物必须严格遵循需求文档的交付清单。
```

AI 动作：启动阶段化开发流程，首先生成 `docs/P0-requirements.md`。

---

## Prompt 3: 按模板重新生成 P0

```
用户: 请参照 docs/templates/requirement.template.md 进行需求评估
```

AI 动作：对照模板重写 P0，增加 Given/When/Then 验收标准（14 条）、用户故事（7 条）、关键假设（8 条，标注验证状态）、对抗自检（3 个反向追问）、置信度评估（92%）。

---

## Prompt 4: P0 补充（渲染基准 + 不可见性 + 图片/链接）

```
用户:
1、添加 Markdown 渲染基准（CommonMark 0.31 + GFM 表格）
2、添加批注不可见性验证标准（HTML 无泄露）
3、考虑添加图片 alt 占位符和链接 Ctrl+点击交互（低优先级）
```

AI 动作：在 P0 中补充 NF-9/NF-10、AC-7a/7b/7c、US-8/9，置信度提升至 94%。

---

## Prompt 5: P0 确认

```
用户: 确认
```

AI: `git commit` P0 → 进入 P1 架构设计。
