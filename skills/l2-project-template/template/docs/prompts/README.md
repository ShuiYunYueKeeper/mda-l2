# AI 协作记录（Prompts）

> L2 命题要求：**≥3 轮**人机协作记录。每轮一个文件，记录 prompt、AI 动作、人工纠正与结论。

---

## 命名规范

```
prompt-{NN}-{short-topic}.md
```

示例：

- `prompt-01-p0-requirements.md`
- `prompt-02-p1-architecture.md`
- `prompt-03-p4-core-implementation.md`

---

## 单轮记录模板

```markdown
# Prompt {NN} — {主题}

## 日期
YYYY-MM-DD

## 用户 Prompt（摘要）
{用户意图与约束}

## AI 动作
- {读取了哪些文件}
- {做了哪些修改}
- {运行了哪些命令}

## 人工纠正（如有）
- {用户指出的问题}
- {如何修正}

## 结论
- {本轮交付物}
- {遗留项}

## 关联 commit
{commit hash 或 message}
```

---

## 记录清单

| # | 文件 | 阶段 | 状态 |
|---|------|------|------|
| 1 | `prompt-01-*.md` | P0/P1 | 待创建 |
| 2 | `prompt-02-*.md` | P2/P3 | 待创建 |
| 3 | `prompt-03-*.md` | P4 | 待创建 |
