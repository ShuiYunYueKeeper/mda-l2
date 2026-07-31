# P4 迭代记录 — M8-B 装饰层

> 日期：2026-07-30  
> 阶段：P4 / M8-B  
> 前置：M8-A9 闸门 ✅（2026-07-30）

## Step 2 实施

| 项 | 变更 |
|----|------|
| S1–S12 样式 | `index.html` 增加 `.mda-cm6-host` 装饰 CSS（标题/行内/链接/列表/引用/分隔线；VIS-7 行内 code 胶囊） |
| M8-B6 reveal | `reveal.js` 导出 `read/writeRevealGranularity`；设置 → 通用 →「预览编辑显露语法」三档 |
| i18n | `settingsLiveReveal*` / `toastLiveRevealOn`（zh+en） |
| 单测 | `nearby` 显露策略用例 |

## Step 4 自动化

- `npm test -- --testPathPattern=gui/editor` ✅

## Step 4 待用户实机（M8-B7）

`mda-cm6=1` + `samples/all-features.md`：

1. **IME**：中文长段组字不丢字、不闪烁
2. **reveal 三档**：设置中切换 block / nearby / never，观察语法标记显露范围
3. **列表**：`-` / `*` / `1.` 混排可编辑
4. **VIS-7**：行内 `` `code` `` 灰色胶囊样式

回复「B7 通过」或问题描述后进入 **M8-C1**。
