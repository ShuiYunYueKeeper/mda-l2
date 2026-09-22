/**
 * 生成软著「一般交存」鉴别材料 PDF：
 * - 源程序：前 30 页 + 后 30 页（每页 ≥50 行），自「代表性源文件」连续编排（补正友好）
 * - 文档：操作说明书全文（不足 60 页则整本交存）
 *
 * 用法：node scripts/generate-soft-copyright-materials.js
 * 依赖：本机 Edge/Chrome（headless --print-to-pdf）；中文直接用系统字体。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'demo', '软著材料');
const SOFTWARE = 'Markdown工作台软件';
const VERSION = 'V1.0';
const LINES_PER_PAGE = 50;
const FRONT_PAGES = 30;
const BACK_PAGES = 30;

/**
 * 按产品叙事顺序编排：批注核心 → CLI/MCP → GUI 批注定位 → CM6 预览编辑。
 * 前 30 + 后 30 页均从此连续序列截取，避免全库拼接后首尾都是脚手架代码。
 */
const REPRESENTATIVE_SOURCE_FILES = [
  'src/config/annotation-schema.json',
  'src/core/model.ts',
  'src/core/parser.ts',
  'src/core/writer.ts',
  'src/core/renderer.ts',
  'src/core/anchor.ts',
  'src/core/outline.ts',
  'src/cli/commands/scan.ts',
  'src/cli/commands/add.ts',
  'src/cli/commands/edit.ts',
  'src/mcp/server.ts',
  'src/mcp/handlers.ts',
  'src/gui/preload.js',
  'src/gui/renderer/selection-anchor.js',
  'src/gui/renderer/doc-coords.js',
  'src/gui/renderer/anchor-highlights.js',
  'src/gui/renderer/sync-scroll.js',
  'src/gui/renderer/editor/pref.js',
  'src/gui/renderer/editor/model/inline-delimiters.js',
  'src/gui/renderer/editor/state/inline-delimiter-ops.js',
  'src/gui/renderer/editor/mount.js',
];

const SOURCE_EXT = new Set(['.ts', '.js', '.html', '.css', '.json']);
const SKIP_NAME = /mermaid\.min|katex\.min|\.min\.js$/i;

function collectSourceFiles() {
  const files = [];
  for (const rel of REPRESENTATIVE_SOURCE_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`代表性源文件不存在: ${rel}`);
    }
    const name = path.basename(abs);
    if (SKIP_NAME.test(name)) continue;
    const ext = path.extname(name);
    if (!SOURCE_EXT.has(ext)) continue;
    files.push(abs);
  }
  return files;
}

function buildSourceLines(files) {
  const lines = [];
  lines.push('// ===== MDA V1.0 程序鉴别材料：代表性源程序（批注核心 / CLI·MCP / GUI 定位 / 预览编辑）=====');
  lines.push(' ');
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const body = text.split(/\r\n|\n|\r/);
    lines.push(`// ===== FILE: ${rel} =====`);
    for (const row of body) {
      if (row.length <= 120) {
        lines.push(row === '' ? ' ' : row);
      } else {
        for (let i = 0; i < row.length; i += 120) {
          lines.push(row.slice(i, i + 120));
        }
      }
    }
    lines.push(' ');
  }
  return lines;
}

function paginate(lines, linesPerPage) {
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    const chunk = lines.slice(i, i + linesPerPage);
    while (chunk.length < linesPerPage) chunk.push(' ');
    pages.push(chunk);
  }
  return pages;
}

function pickFrontBack(pages, frontN, backN) {
  if (pages.length <= frontN + backN) {
    return {
      pages,
      note: `代表性源程序全文共 ${pages.length} 页（不足 ${frontN + backN} 页，整本交存）`,
    };
  }
  const selected = pages.slice(0, frontN).concat(pages.slice(-backN));
  return {
    pages: selected,
    note:
      `自代表性源程序（${pages.length} 页）选取前 ${frontN} 页 + 后 ${backN} 页；` +
      `覆盖 @anno 批注解析与源文件保护、渲染不可见、CLI/MCP、预览选区映射及 CM6 行内定界符编辑逻辑`,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderSourceHtml(selectedPages, metaNote) {
  const parts = [];
  parts.push(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${SOFTWARE} ${VERSION} 源程序鉴别材料</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Consolas", "Courier New", "Microsoft YaHei", monospace; margin: 0; color: #000; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .hdr { font-family: "Microsoft YaHei", sans-serif; font-size: 11px; border-bottom: 1px solid #333;
         padding-bottom: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; }
  pre { font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; margin: 0; }
  /* 说明页须独立成页：否则它与第 1 页代码挤在同一张纸上，页眉标注的 "第 1 / 60 页" 与实际纸张错位 */
  .meta { font-family: "Microsoft YaHei", sans-serif; font-size: 12px; margin: 24px;
          page-break-after: always; }
</style></head><body>`);
  parts.push(`<div class="meta"><p><b>${SOFTWARE} ${VERSION}</b> — 程序鉴别材料（一般交存）</p>
<p>${escapeHtml(metaNote)}</p>
<p>本页为编排说明，其后 ${selectedPages.length} 页为源程序鉴别材料正文，
每页 ${LINES_PER_PAGE} 行，页眉标注软件名称、版本号与连续页码。</p></div>`);

  selectedPages.forEach((pageLines, idx) => {
    const pageNo = idx + 1;
    parts.push(`<div class="page"><div class="hdr"><span>${SOFTWARE} ${VERSION}</span>
<span>源程序 第 ${pageNo} / ${selectedPages.length} 页</span></div>
<pre>${pageLines.map(escapeHtml).join('\n')}</pre></div>`);
  });
  parts.push('</body></html>');
  return parts.join('\n');
}

function resolveManualImage(manualDir, src) {
  const raw = src.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const candidates = [
    path.resolve(manualDir, raw),
    path.resolve(ROOT, raw),
    path.resolve(ROOT, 'docs', 'screenshots', path.basename(raw)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(manualDir, raw);
}

function mdToSimpleHtml(md, title, manualDir) {
  const blocks = [];
  // 剥 BOM：否则首行 "# 标题" 的 # 不在行首，标题会原样打印出 "#"
  const lines = md.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(`<pre class="code">${escapeHtml(codeLines.join('\n'))}</pre>`);
      continue;
    }
    if (/^!\[([^\]]*)\]\(([^)]+)\)/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      const alt = m[1];
      const imgPath = resolveManualImage(manualDir, m[2]);
      const url = 'file:///' + imgPath.replace(/\\/g, '/');
      blocks.push(
        `<figure class="fig"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"/>` +
          `<figcaption>${escapeHtml(alt)}</figcaption></figure>`,
      );
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMd(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }
    // 表格：分隔行（|---|---|）不含空格，故正则不能要求 "| " —— 否则分隔行会漏成正文
    if (/^\|.*\|\s*$/.test(line)) {
      const tableRows = [];
      let isFirstRow = true;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        const row = lines[i].trim();
        i++;
        if (/^\|[\s:-]+\|$/.test(row.replace(/\|/g, '|'))) continue; // 分隔行
        if (/^\|[\s|:-]+$/.test(row)) continue;
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        const tag = isFirstRow ? 'th' : 'td';
        tableRows.push(
          '<tr>' + cells.map((c) => `<${tag}>${inlineMd(escapeHtml(c))}</${tag}>`).join('') + `</tr>`,
        );
        isFirstRow = false;
      }
      blocks.push(`<table>${tableRows.join('')}</table>`);
      continue;
    }
    if (/^---\s*$/.test(line)) {
      blocks.push('<hr/>');
      i++;
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${inlineMd(escapeHtml(lines[i].slice(2)))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inlineMd(escapeHtml(lines[i].replace(/^\d+\.\s*/, '')))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    blocks.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
    i++;
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Microsoft YaHei", "SimSun", sans-serif; font-size: 12px; line-height: 1.7; color: #000; }
  h1 { font-size: 20px; text-align: center; margin: 24px 0; }
  h2 { font-size: 16px; margin-top: 22px; border-bottom: 1px solid #999; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 14px; margin-top: 16px; page-break-after: avoid; }
  p { margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; page-break-inside: avoid; }
  td, th { border: 1px solid #333; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #f0f0f0; }
  pre.code { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; font-size: 11px;
             white-space: pre-wrap; word-break: break-all; }
  h4 { font-size: 13px; margin-top: 14px; page-break-after: avoid; }
  figure.fig { margin: 14px 0; text-align: center; page-break-inside: avoid; }
  /* 截图是宽屏比例；限到 150mm 可让「图 + 一节文字」同页，避免整页只放一张图的稀疏观感 */
  figure.fig img { max-width: 100%; max-height: 150mm; border: 1px solid #ccc; }
  figure.fig figcaption { font-size: 11px; color: #333; margin-top: 6px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  ul, ol { margin: 8px 0 8px 22px; }
  code { font-family: Consolas, monospace; font-size: 11px; background: #f0f0f0; padding: 1px 4px; }
</style></head><body>
${blocks.join('\n')}
</body></html>`;
}

/**
 * 行内标记转换。顺序要紧：先把 code 片段挖成占位符，再处理 **加粗**。
 * 否则 `**` 这类「反引号里含星号」的正文会被加粗规则吞掉，PDF 里出现残缺符号。
 * 双反引号（``…``）优先于单反引号，用于包裹本身含反引号的内容。
 */
function inlineMd(s) {
  const stash = [];
  let out = String(s).replace(/``([\s\S]+?)``|`([^`]+)`/g, (_m, dbl, single) => {
    stash.push(dbl !== undefined ? dbl : single);
    return `\u0000CODE${stash.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => `<code>${stash[Number(idx)]}</code>`);
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * 形式审查要求文档鉴别材料**每页**都有页眉（软件名称 + 版本号）并连续编页码。
 * `chrome --print-to-pdf` 做不到：`--no-pdf-header-footer` 会把页眉页脚全关掉，
 * 不关则带上 file:/// URL 与系统日期。所以走 Playwright 的 headerTemplate/footerTemplate。
 * 源程序 HTML 自身每页已画页眉页码，故 `displayHeaderFooter` 传 false 避免重复。
 */
async function htmlToPdfViaPlaywright(htmlPath, pdfPath, opts) {
  const { chromium } = require('playwright');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 120000 });
    // 页眉/页脚模板须用 pt 且 ≥10pt：Chromium 对模板另有缩放，写 9px 会缩到肉眼不可见
    // （现象是 PDF 页顶只剩一道短横线）；也不要用 flex + padding，居中用 text-align 最稳。
    // 字体名不能带双引号：这段字符串要塞进 style="…" 属性，双引号会提前闭合属性、整个模板作废
    const style =
      "font-family:SimSun,'Microsoft YaHei',serif;font-size:10pt;color:#333;" +
      'width:100%;text-align:center;';
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: Boolean(opts && opts.headerText),
      headerTemplate: opts && opts.headerText
        ? `<div style="${style}">${opts.headerText}</div>`
        : '<div></div>',
      footerTemplate: opts && opts.headerText
        ? `<div style="${style}">第 <span class="pageNumber"></span> 页 / 共 ` +
          '<span class="totalPages"></span> 页</div>'
        : '<div></div>',
      margin: (opts && opts.margin) || {
        top: '20mm',
        bottom: '18mm',
        left: '16mm',
        right: '16mm',
      },
    });
  } finally {
    await browser.close();
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`打印 PDF 失败，可手动打开 HTML 后「打印 → 另存为 PDF」:\n${htmlPath}`);
  }
}

function htmlToPdfViaChromeCli(browser, htmlPath, pdfPath) {
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const r = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      fileUrl,
    ],
    { encoding: 'utf8', timeout: 120000 },
  );
  if (r.status !== 0 || !fs.existsSync(pdfPath)) {
    throw new Error(
      `打印 PDF 失败 (exit=${r.status}): ${r.stderr || r.stdout || 'unknown'}\n` +
        `也可手动用浏览器打开 HTML 后「打印 → 另存为 PDF」:\n${htmlPath}`,
    );
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = collectSourceFiles();
  const allLines = buildSourceLines(files);
  const allPages = paginate(allLines, LINES_PER_PAGE);
  const { pages: srcPages, note } = pickFrontBack(allPages, FRONT_PAGES, BACK_PAGES);

  const srcHtmlPath = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-源程序.html`);
  const srcPdfPath = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-源程序.pdf`);
  fs.writeFileSync(srcHtmlPath, renderSourceHtml(srcPages, note), 'utf8');

  const manualMdPath = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-操作说明书.md`);
  if (!fs.existsSync(manualMdPath)) {
    throw new Error(`缺少说明书: ${manualMdPath}`);
  }
  const manualMd = fs.readFileSync(manualMdPath, 'utf8');
  const docHtmlPath = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-操作说明书.html`);
  const docPdfPath = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-操作说明书.pdf`);
  fs.writeFileSync(
    docHtmlPath,
    mdToSimpleHtml(manualMd, `${SOFTWARE} ${VERSION} 操作说明书`, OUT_DIR),
    'utf8',
  );

  let usePlaywright = true;
  try {
    require.resolve('playwright');
  } catch {
    usePlaywright = false;
  }
  const browser = findBrowser();
  const summary = {
    software: SOFTWARE,
    version: VERSION,
    sourceMode: 'representative',
    sourceFiles: files.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')),
    sourceLines: allLines.length,
    sourceTotalPages: allPages.length,
    sourceDepositPages: srcPages.length,
    sourceNote: note,
    outputs: [],
  };

  if (usePlaywright) {
    console.log('打印引擎: playwright + msedge（每页页眉页码）');
    // Playwright 的 margin 会覆盖 HTML 的 @page，默认为 0；不显式传会让代码贴到纸边被裁切
    await htmlToPdfViaPlaywright(srcHtmlPath, srcPdfPath, {
      margin: { top: '14mm', bottom: '16mm', left: '16mm', right: '12mm' },
    });
    await htmlToPdfViaPlaywright(docHtmlPath, docPdfPath, {
      headerText: `${SOFTWARE} ${VERSION} 操作说明书`,
    });
    summary.outputs.push(srcPdfPath, docPdfPath, srcHtmlPath, docHtmlPath);
    summary.printEngine = 'playwright+msedge';
    console.log('已生成:', srcPdfPath);
    console.log('已生成:', docPdfPath);
  } else if (!browser) {
    console.warn('未找到 playwright 与 Edge/Chrome，已生成 HTML。请手动打开后打印为 PDF：');
    console.warn(' ', srcHtmlPath);
    console.warn(' ', docHtmlPath);
    summary.outputs.push(srcHtmlPath, docHtmlPath);
  } else {
    console.warn('未安装 playwright，退回 Chrome CLI 打印：说明书将缺少每页页眉页码，请人工补。');
    htmlToPdfViaChromeCli(browser, srcHtmlPath, srcPdfPath);
    htmlToPdfViaChromeCli(browser, docHtmlPath, docPdfPath);
    summary.outputs.push(srcPdfPath, docPdfPath, srcHtmlPath, docHtmlPath);
    summary.printEngine = 'chrome-cli';
    console.log('已生成:', srcPdfPath);
    console.log('已生成:', docPdfPath);
  }

  const readmePath = path.join(OUT_DIR, 'README-上传说明.md');
  fs.writeFileSync(
    readmePath,
    `# 软著鉴别材料 — 上传说明（补正版）

## 已生成文件

| 表单栏位 | 文件 | 说明 |
|----------|------|------|
| 程序鉴别材料（一般交存） | \`${SOFTWARE}-${VERSION}-源程序.pdf\` | ${note} |
| 文档鉴别材料（一般交存） | \`${SOFTWARE}-${VERSION}-操作说明书.pdf\` | 含界面截图与 MDA 独创能力说明 |
| 其他证明文件 | 通常可空 | 个人登记一般不强制 |

对应 HTML 源文件亦在同目录，便于核对或重新打印。

## 形式要点（已自查）

| 项目 | 现状 |
|------|------|
| 源程序页眉 | 每页含「${SOFTWARE} ${VERSION}」与「源程序 第 N / 60 页」连续页码 |
| 源程序排布 | 首页为编排说明（独立成页），其后 60 页正文，每页 ${LINES_PER_PAGE} 行，首页起于程序第一行、末页止于程序结尾 |
| 说明书页眉 | 每页含「${SOFTWARE} ${VERSION} 操作说明书」 |
| 说明书页脚 | 每页含「第 N 页 / 共 M 页」 |
| 说明书插图 | 全部取自实机运行截图，由 \`tests/e2e/capture/docs-screenshots.spec.ts\` 驱动真实程序实例采集 |
| 自查命令 | \`node scripts/check-soft-copyright-pdf.js\`（核对插图是否加载、标记是否泄漏、页数是否达标） |

## 针对「模板化程度较高」的处理

1. **源程序**不按全仓库字典序拼接，而按产品叙事连续编排（批注核心 → 命令行与本地服务 → 界面定位 → 预览编辑定界符规划），序列定义于 \`REPRESENTATIVE_SOURCE_FILES\`。
2. **说明书**以真实数据驱动：真实批注行与识别正则、真实锚点偏移值、示例文档全文与其中五条批注的实际数据、命令行真实输出样例、规则配置文件实际内容。
3. **独创算法单列附录**：段落归属推导、定界符融合与拆分、渲染探针、自定义块内的查找坐标映射，均以具体字符序列分步说明，而非功能罗列。

## 仍需申请人确认的事项

1. 申请表「软件全称」须逐字等于「${SOFTWARE}」，版本号为 ${VERSION}，与两份材料的页眉一致。
2. 开发完成日与首次发表日只在申请表填写，材料中未出现具体日期，避免与申请表冲突。
3. 权利归属：如属职务开发，须按要求提供相应证明。
4. 界面截图中的「AI」按钮对应需授权的增值功能，说明书第 16 章已如实说明；若申请表「主要功能」未列该项，保持现有表述即可。

## 上传注意

1. 仅上传 **PDF**
2. 两份材料的页眉均为「${SOFTWARE} ${VERSION}」
3. 文档材料与申请表的软件全称、版本号保持一致

## 重新生成

\`\`\`bash
node scripts/generate-soft-copyright-materials.js   # 生成
node scripts/check-soft-copyright-pdf.js            # 形式自查
\`\`\`

若需重新采集界面截图：

\`\`\`bash
npm run build
$env:MDA_CAPTURE='1'; npx playwright test tests/e2e/capture/docs-screenshots.spec.ts
\`\`\`
`,
    'utf8',
  );
  summary.outputs.push(readmePath);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
