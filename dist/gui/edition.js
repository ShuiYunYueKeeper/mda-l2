/**
 * 发行版能力开关（单一事实来源）。
 *
 * 当前发行版为**完全免费版**：AI 与 Pro（激活 / 许可 / 购买）整体关闭——
 * 主进程不注册对应菜单与 IPC，preload 不向渲染层暴露任何 AI / 许可 API，
 * 渲染层据此隐藏工具栏、右键菜单、块手柄、设置页里的全部相关入口。
 *
 * 主进程与 preload 直接 `require` 本文件；渲染层的独立脚本（app.js / settings-ai.js）
 * 不能 require，改从 preload 暴露的 `window.mdaAPI.features` 读取同一组值。
 * CM6 编辑器打包产物（editor.bundle.js）可以 require。
 *
 * 重新开启某档能力时只改这里，并同步 README / AGENTS 的免费版说明。
 */
const EDITION = {
  /** 完全免费：不出现购买、激活、许可、AI 字样入口 */
  free: true,
  /** 内置 AI（指令条 / 续写 / 润色 / 解释 / 块改写） */
  ai: false,
  /** Pro 许可与激活（含 online 购买入口、许可门禁） */
  pro: false,
};

module.exports = EDITION;
