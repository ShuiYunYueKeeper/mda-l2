/**
 * 生成软著「一般交存」鉴别材料 PDF：
 * - 源程序：前 30 页 + 后 30 页（每页 ≥50 行）
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

const SOURCE_GLOBS = [
  'src/core',
  'src/cli',
  'src/mcp',
  'src/gui',
];

const SOURCE_EXT = new Set(['.ts', '.js', '.html', '.css']);
const SKIP_NAME = /mermaid\.min|katex\.min|\.min\.js$/i;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'fonts') continue;
      walk(p, acc);
    } else {
      const ext = path.extname(name);
      if (!SOURCE_EXT.has(ext)) continue;
      if (SKIP_NAME.test(name)) continue;
      acc.push(p);
    }
  }
  return acc;
}

function collectSourceFiles() {
  const files = [];
  for (const rel of SOURCE_GLOBS) {
    walk(path.join(ROOT, rel), files);
  }
  // 稳定顺序：core → cli → mcp → gui，同目录按路径排序
  const rank = (p) => {
    const n = p.replace(/\\/g, '/');
    if (n.includes('/core/')) return 1;
    if (n.includes('/cli/')) return 2;
    if (n.includes('/mcp/')) return 3;
    if (n.includes('/gui/')) return 4;
    return 9;
  };
  files.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return files;
}

function buildSourceLines(files) {
  const lines = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const body = text.split(/\r\n|\n|\r/);
    lines.push(`// ===== FILE: ${rel} =====`);
    for (const row of body) {
      // 软著页按「行」计，过长行拆开以免一页视觉过空、打印溢出
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
    return { pages, note: `全文共 ${pages.length} 页（不足 ${frontN + backN} 页，整本交存）` };
  }
  const selected = pages.slice(0, frontN).concat(pages.slice(-backN));
  return {
    pages: selected,
    note: `共选取前 ${frontN} 页 + 后 ${backN} 页（源程序总计 ${pages.length} 页）`,
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
  @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
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

function mdToSimpleHtml(md, title) {
  // 轻量转换：够打印成说明书；不追求完美 Markdown
  let html = escapeHtml(md);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^\| .+\|$/gm, (row) => {
    if (/^\|\s*-+/.test(row)) return '';
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (m) => `<table>${m}</table>`);
  html = html.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
    return `<pre class="code">${inner}</pre>`;
  });
  html = html.replace(/\n\n/g, '</p><p>');
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
</style></head><body>
<div class="hdr-print"><span>${SOFTWARE} ${VERSION}</span><span>操作说明书</span></div>
<p>${html}</p>
</body></html>`;
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
    mdToSimpleHtml(manualMd, `${SOFTWARE} ${VERSION} 操作说明书`),
    'utf8',
  );

  const browser = findBrowser();
  const summary = {
    software: SOFTWARE,
    version: VERSION,
    sourceFiles: files.length,
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
    `# 软著鉴别材料 — 上传说明

## 已生成文件

| 表单栏位 | 文件 | 说明 |
|----------|------|------|
| 程序鉴别材料（一般交存） | \`${SOFTWARE}-${VERSION}-源程序.pdf\` | ${note} |
| 文档鉴别材料（一般交存） | \`${SOFTWARE}-${VERSION}-操作说明书.pdf\` | 用户操作说明书全文 |
| 其他证明文件 | 通常可空 | 个人登记一般不强制；有权利归属证明再传 |

对应 HTML 源文件亦在同目录，便于核对或重新打印。

## 上传注意

1. 仅上传 **PDF**
2. 程序材料页眉为「${SOFTWARE} ${VERSION}」
3. 文档材料与申请表软件全称、版本号保持一致
4. 「其他相关证明文件」无额外材料可跳过

## 重新生成

\`\`\`bash
node scripts/generate-soft-copyright-materials.js
\`\`\`
`,
    'utf8',
  );
  summary.outputs.push(readmePath);

  console.log(JSON.stringify(summary, null, 2));
}

main();
