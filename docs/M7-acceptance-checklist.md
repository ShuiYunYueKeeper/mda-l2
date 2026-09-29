# M7 Phase B Pro AI — 验收清单

> 对应 P3 **M7-1～M7-7**；前置：**M6-5 Free 门禁已通过**（2026-07-15）。  
> 状态：**⏸ 暂停验收**（2026-07-28 用户决定）——代码已落地并保留；AI 入口将随 3.0「预览直接编辑」重新设计，见 [`P0-requirements-v3-wysiwyg.md`](P0-requirements-v3-wysiwyg.md) F14，届时与 M8 一并实机走查。

---

## 范围（P3）

| ID | 任务 | 验收要点 | 状态 |
|----|------|----------|------|
| M7-1 | 离线 License 激活 | 合法 Key 解锁 Pro；非法/过期拒绝 | 代码完成，待实机 |
| M7-2 | AI 设置 UI | safeStorage 存 Key；三 Preset | 代码完成，待实机 |
| M7-3 | Provider streaming | main IPC；可取消 | 代码完成，待实机 |
| M7-4 | 续写 / 补全 / 美化 diff | AC-6 系列 | 代码完成，待实机 |
| M7-5 | Free 升级提示 | 未激活见 gate，不泄 Key | 代码完成，待实机 |
| M7-6 | 购买/激活说明 | [`docs/pro-activation.md`](pro-activation.md) | ✅ |
| M7-7 | 👤 实机 + Key 安全抽检 | AC-6b/c | 待用户 |

---

## 自动化

```bash
npm test                 # 含 tests/pro/license.test.ts
npm run build
# 本机有 src/pro/license-secret.js 时签发激活码，再在「设置 → Pro」粘贴：
node scripts/generate-license.js
```

---

## 实机走查（👤）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | Free：视图 → AI 续写 / Ctrl+Space | 升级提示；设置可跳到 Pro；无 Key 明文 |
| 2 | 设置 → Pro → 粘贴非法码 / 过期码 | 拒绝激活 |
| 3 | 粘贴合法码 → 激活 | 状态变为已激活 |
| 4 | 配置 Provider + API Key → 保存 | hasKey；重开设置不见明文 |
| 5 | Ctrl+Shift+Enter 续写 | 流式预览；采纳后插入；可停止 |
| 6 | Ctrl+Space 补全 | 弹层；Enter 采纳 / Esc 关闭 |
| 7 | Ctrl+Shift+M 美化选区 | 左右 diff；保留 / 采纳（可编辑） |
| 8 | 人为错误 Key / 断网 | 错误可读且不含 Key |
| 9 | 帮助 → Pro 购买与激活 | 打开说明文档 |

---

## 验收结论

- [ ] M7 实现完成（自动化 + 代码审查）
- [ ] M7-7 用户实机通过

问题记录：

```
```
