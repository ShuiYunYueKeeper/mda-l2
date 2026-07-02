# MDA Demo — Markdown 批注管理工具演示文档

[comment]: <> (@anno {"id":"c1","content":"标题结构建议调整，建议增加副标题","tags":["style","structure"],"level":"major","status":"open","created_at":"2026-06-20T09:00:00+08:00"})
# MDA - Markdown 批注管理工具

这是 MDA 工具的演示文档，展示了各种 Markdown 元素和批注的混合使用。

[comment]: <> (@anno {"id":"c2","content":"功能列表确认无误，优先级已排序","tags":["review"],"level":"info","status":"resolved","created_at":"2026-06-21T10:00:00+08:00"})
## 核心功能

[comment]: <> (@anno {"id":"c3","content":"截图缺失，需补充 Windows 平台截图","tags":["bug","docs"],"level":"critical","status":"open","created_at":"2026-06-22T11:00:00+08:00"})
MDA 提供 **批注的增删改查**（CRUD）功能，通过 CLI 和 GUI 两种方式操作。

[comment]: <> (@anno {"id":"c4","content":"安装命令在 Windows 下需要管理员权限","tags":["bug","platform"],"level":"minor","status":"wontfix","created_at":"2026-06-23T12:00:00+08:00"})
### 安装方式

```bash
npm install -g mda
```

## 使用示例

### 命令行模式

用 `mda-cli scan` 命令扫描批注：

```bash
mda-cli scan doc.md --format json
```

[comment]: <> (@anno {"id":"c5","content":"表格示例缺少 mermaid 类型的演示，但题目不要求 Mermaid 支持","tags":["docs"],"level":"info","status":"resolved","created_at":"2026-06-24T13:00:00+08:00"})
### 支持的批注字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | 唯一标识 |
| content | string | 是 | 批注内容 |
| tags | string[] | 否 | 标签列表 |
| level | enum | 是 | critical/major/minor/info |
| status | enum | 是 | open/resolved/wontfix |
| created_at | ISO 8601 | 是 | 创建时间 |

### 级别说明

[comment]: <> (@anno {"id":"c6","content":"这里忽略了 wontfix 状态的说明，补充状态流转图","tags":["docs"],"level":"major","status":"open","created_at":"2026-06-25T14:00:00+08:00"})
> **注意**：`critical` 级别表示必须修复的问题，`major` 表示重要问题，
> `minor` 表示小问题，`info` 表示纯信息性批注。

1. **critical** — 阻断性问题，必须立即处理
2. **major** — 重要问题，发布前修复
3. **minor** — 小问题，建议修复
4. **info** — 提示信息

---

## 图片测试

![MDA Logo](mda-logo.png)

*上图为本应展示的 MDA 工具 logo（当图片不可用时，应显示 alt 文本占位符）。*

---

## 链接测试

更多信息请参考 [CommonMark 规范](https://spec.commonmark.org/0.31/) 和 [GFM 表格扩展](https://github.github.com/gfm/#tables-extension-)。

---

*本文档最后更新于 2026-06-26*
