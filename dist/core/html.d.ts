/**
 * 原生 HTML 白名单清洗（core 纯函数，无三方依赖）。
 *
 * 为什么必须自己清洗：GUI 预览走 `innerHTML`，任何 `onerror=`/`javascript:` 都会在渲染进程执行；
 * 而 markdown-it 的 `html: true` 会把作者写的 HTML 原样吐出。故渲染前一律按「白名单重建」处理：
 * 只保留已知标签/属性，未知标签丢壳留文，脚本类标签连内容一起丢。
 *
 * 为什么不在清洗结果里补齐未闭合标签：README 常见 `<details>` + 空行 + Markdown 正文 + `</details>`，
 * CommonMark 会在空行处截断 HTML 块。浏览器把后续内容自动嵌进仍未闭合的 `<details>`，
 * 正是 GitHub 的观感；此处若强行闭合，跨块嵌套就会失效。
 */
/**
 * 清洗一段 HTML 片段：标签/属性按白名单重建，脚本类标签连内容丢弃。
 * @param html 原始 HTML（可为空）
 * @returns 可安全 innerHTML 的 HTML
 */
export declare function sanitizeHtml(html: string): string;
//# sourceMappingURL=html.d.ts.map