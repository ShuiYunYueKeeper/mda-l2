# MDA 2.0.0-alpha — Phase A（Free）发版说明

> **Tag**：`v2.0.0-alpha`  
> **日期**：2026-07-15  
> **门禁**：M6-5 Free 可交付已通过  
> **下一阶段**：M7 Pro AI（未包含在本 tag）

---

## 范围（Phase A Free）

| 能力 | 说明 |
|------|------|
| F8 文件 | 欢迎页、最近文件、打开文件夹树、新建 / 另存为 |
| F1/F2 编辑预览 | 源码高亮、查找替换、大纲、点击双向定位、KaTeX、Mermaid、主题 |
| F3 批注 | 段落级 + 选区级（anchor）；orphan 提示；dirty 时禁用批注写 |
| F6 MCP | `mda-mcp` 六 tools，与 CLI 语义一致 |
| 导出 | HTML / PDF |
| 更新入口 | 打包版「检查更新」（需配置 `build.publish.url`） |

## 安装 / 构建

```bash
npm install
npm run build
npm test          # 期望 117 通过
npm run gui -- samples/demo.md
npm run cli -- scan samples/demo.md --format json
npm run dist:win  # 关闭占用 release/ 的进程后执行
```

全局 CLI / MCP：

```bash
npm install -g .
mda-cli --help
mda-mcp --workspace <docs-root>
```

## 已知非阻塞项

- GUI 截图 `10–17` 待补（见 `docs/screenshots/README.md`）
- 自动更新依赖 GitHub Releases + `GH_TOKEN`（`build.publish` 已指向本仓）
- 旁支 `l2-project-template/`、`skills/` **不属于**本产品发版物

## 不在本版本

- Pro License / AI 续写·补全·美化（M7）
- 付费官网与激活流程的完整上线

---

验收证据：`docs/M2`～`M6-acceptance-checklist.md`、`.project-setup/verification-report.md`。
