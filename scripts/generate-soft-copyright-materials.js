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
  pre { font-size: 9.5px; line-height: 1.35; white-space: pre-wrap; word-break: break-all; margin: 0; }
  .meta { font-family: "Microsoft YaHei", sans-serif; font-size: 12px; margin: 24px; }
</style></head><body>`);
  parts.push(`<div class="meta"><p><b>${SOFTWARE} ${VERSION}</b> — 程序鉴别材料（一般交存）</p>
<p>${escapeHtml(metaNote)}</p>
<p>每页 ${LINES_PER_PAGE} 行。页眉含软件名称与页码。</p></div>`);

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
  const lines = md.replace(/\r\n/g, '\n').split('\n');
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
    if (/^# /.test(line)) {
      blocks.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      i++;
      continue;
    }
    if (/^## /.test(line)) {
      blocks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (/^### /.test(line)) {
      blocks.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (/^\| .+\|$/.test(line)) {
      const tableRows = [];
      while (i < lines.length && /^\| .+\|$/.test(lines[i])) {
        const row = lines[i];
        if (!/^\|\s*-+/.test(row)) {
          const cells = row.split('|').slice(1, -1).map((c) => c.trim());
          tableRows.push('<tr>' + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>');
        }
        i++;
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
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
  pre.code { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; font-size: 11px;
             white-space: pre-wrap; word-break: break-all; }
  .hdr-print { display: flex; justify-content: space-between; font-size: 11px; color: #333;
               border-bottom: 1px solid #333; margin-bottom: 16px; padding-bottom: 4px; }
  figure.fig { margin: 14px 0; text-align: center; page-break-inside: avoid; }
  figure.fig img { max-width: 100%; max-height: 220mm; border: 1px solid #ccc; }
  figure.fig figcaption { font-size: 11px; color: #333; margin-top: 6px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  ul, ol { margin: 8px 0 8px 22px; }
  code { font-family: Consolas, monospace; font-size: 11px; background: #f0f0f0; padding: 1px 4px; }
</style></head><body>
<div class="hdr-print"><span>${SOFTWARE} ${VERSION}</span><span>操作说明书</span></div>
${blocks.join('\n')}
</body></html>`;
}

function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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

function htmlToPdf(browser, htmlPath, pdfPath) {
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

function main() {
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

  if (!browser) {
    console.warn('未找到 Edge/Chrome，已生成 HTML。请手动打开后打印为 PDF：');
    console.warn(' ', srcHtmlPath);
    console.warn(' ', docHtmlPath);
    summary.outputs.push(srcHtmlPath, docHtmlPath);
  } else {
    console.log('使用浏览器:', browser);
    htmlToPdf(browser, srcHtmlPath, srcPdfPath);
    htmlToPdf(browser, docHtmlPath, docPdfPath);
    summary.outputs.push(srcPdfPath, docPdfPath, srcHtmlPath, docHtmlPath);
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

## 与首次提交的区别

1. **源程序**不再按全仓库字典序拼接，而是 \`scripts/generate-soft-copyright-materials.js\` 中的 \`REPRESENTATIVE_SOURCE_FILES\` 叙事序列（批注核心 → CLI/MCP → GUI → CM6 编辑）。
2. **说明书**增加技术特点、截图与「预览编辑」章节，突出 \`@anno\` 与源文件保护，降低「模板化」观感。

## 是否写入「最新功能」（如 CM6 编辑）

- **建议写入**：若该能力已在 **V1.0 / 开发完成日** 前交付，且与申请表「主要功能」一致，补正材料应**如实体现**（说明书 + 源程序节选），有利于证明独创性。
- **不建议写入**：未在申请表描述、或明显晚于开发完成日的规划能力（如 Pro AI）；避免材料与申请表时间线矛盾。
- **不必改版本号**：仍为 **V1.0** 补正即可，无需改为 npm 的 2.0-alpha 号。

## 上传注意

1. 仅上传 **PDF**
2. 程序材料页眉为「${SOFTWARE} ${VERSION}」
3. 文档材料与申请表软件全称、版本号保持一致

## 重新生成

\`\`\`bash
node scripts/generate-soft-copyright-materials.js
\`\`\`

生成后可复制到本机归档目录（如 \`Documents\\\\软著材料\`）再上传版权中心「去补正」。
`,
    'utf8',
  );
  summary.outputs.push(readmePath);

  console.log(JSON.stringify(summary, null, 2));
}

main();
