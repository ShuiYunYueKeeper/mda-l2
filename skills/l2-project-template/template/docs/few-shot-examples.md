# Few-shot 正反例资产（AI 协作易错点）

> 本文件为「可被 AI 直接复用的 few-shot 资产」：针对项目中反复出现、且仅靠
> 自然语言规则不易约束的易错点，给出成对的 **✅ 正确 / ❌ 错误** 示例。
> 修改核心逻辑前，请先对照本文件自检。
>
> 配套：硬性规则见 `AGENTS.md` 第 8 节（禁止事项）与第 9 节（隐性规范）。

---

## 如何新增条目

每个条目包含：

1. **规则** — 一句话说明约束
2. **✅ 正确** — 输入/代码/行为 + 期望结果
3. **❌ 错误** — 常见误解或反例 + 为何错

从 P4 实机踩坑或 Code Review 中沉淀，保持 ✅/❌ 成对。

---

## 1. {topic_1 — 示例：分层依赖}

**规则**：适配层（CLI/GUI）必须调用 `core` 公共 API，禁止在适配层重写业务逻辑。

### ✅ 正确

```ts
// src/cli/commands/scan.ts
import { parseAnnotations } from '../../core';
const result = parseAnnotations(text);
```

### ❌ 错误

```ts
// 在 CLI 中手写解析正则与状态机
const ANNO_REGEX = /.../;
// 与 core 行为漂移，测试无法守护
```

---

## 2. {topic_2 — 示例：CLI 输出}

**规则**：`--format json` 时 stdout **仅**输出 JSON，警告走 stderr。

### ✅ 正确

```ts
process.stdout.write(JSON.stringify(data));
process.stderr.write('警告: ...\n');
```

### ❌ 错误

```ts
console.log('扫描完成，共', data.length, '条');
console.log(JSON.stringify(data)); // stdout 被污染
```

---

## 3. {topic_3 — 按项目填写}

**规则**：{your_rule}

### ✅ 正确

{correct_example}

### ❌ 错误

{wrong_example}

---

## 索引（实现后维护）

| # | 主题 | 关联模块 | 来源 |
|---|------|----------|------|
| 1 | 分层依赖 | cli | 模板示例 |
| 2 | CLI 输出 | cli | 模板示例 |
| 3 | {topic} | {module} | {prompt/review 引用} |
