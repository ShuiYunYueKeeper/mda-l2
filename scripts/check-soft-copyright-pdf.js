/**
 * 软著鉴别材料形式自查：在打印前先用浏览器核对 HTML 渲染。
 *
 * 检查项对应形式审查的常见驳回点：
 * - 图片是否真的加载（file:// 路径写错时 PDF 里会是空白框，肉眼翻 PDF 容易漏）
 * - 简易 Markdown 转换器有没有把标记漏成正文（表格分隔行、行首 #、裸反引号/星号）
 * - 说明书是否残留占位符
 *
 * 用法：node scripts/check-soft-copyright-pdf.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'demo', '软著材料');
const SOFTWARE = 'Markdown工作台软件';
const VERSION = 'V1.0';

const STRAY_PATTERNS = [
  ['表格分隔行泄漏', '|---'],
  ['行首井号未转标题', '\n# '],
  ['占位符未替换', '以申请表填写为准'],
  ['裸露四连星号', '****'],
];

async function checkHtml(htmlPath, opts) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--allow-file-access-from-files'],
  });
  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });

    const images = await page.evaluate(() =>
      Array.from(document.images).map((img) => ({
        src: img.getAttribute('src') || '',
        ok: img.naturalWidth > 0,
      })),
    );
    const broken = images.filter((i) => !i.ok);
    for (const b of broken) {
      problems.push(`图片未加载: ${decodeURIComponent(b.src.split('/').pop())}`);
    }

    // 标记泄漏只对说明书成立：源程序是代码逐字打印，注释里本就出现 **** 这类字面量
    if (opts.checkStrayMarkdown) {
      const text = await page.evaluate(() => document.body.innerText);
      for (const [label, needle] of STRAY_PATTERNS) {
        if (text.includes(needle)) problems.push(`疑似 Markdown 标记泄漏（${label}）`);
      }
    }
    if (opts.expectImages && images.length === 0) {
      problems.push('未检出任何插图（说明书应含界面截图）');
    }

    if (opts.shot) await page.screenshot({ path: opts.shot, fullPage: false });
    return { images: images.length, broken: broken.length, problems };
  } finally {
    await browser.close();
  }
}

function countPdfPages(pdfPath) {
  const raw = fs.readFileSync(pdfPath).toString('latin1');
  return (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

async function main() {
  const docHtml = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-操作说明书.html`);
  const srcHtml = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-源程序.html`);
  const docPdf = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-操作说明书.pdf`);
  const srcPdf = path.join(OUT_DIR, `${SOFTWARE}-${VERSION}-源程序.pdf`);

  for (const f of [docHtml, srcHtml, docPdf, srcPdf]) {
    if (!fs.existsSync(f)) {
      throw new Error(`缺少材料，请先运行 generate-soft-copyright-materials.js：${f}`);
    }
  }

  const doc = await checkHtml(docHtml, { expectImages: true, checkStrayMarkdown: true });
  const src = await checkHtml(srcHtml, { expectImages: false, checkStrayMarkdown: false });

  const docPages = countPdfPages(docPdf);
  const srcPages = countPdfPages(srcPdf);

  const notes = [];
  // 一般交存：前 30 + 后 30 页；不足 60 页的整本提交，因此说明书 15 页合规
  if (srcPages < 61) notes.push(`源程序 PDF ${srcPages} 页，应为 1 页编排说明 + 60 页正文`);
  if (docPages < 5) notes.push(`说明书仅 ${docPages} 页，内容偏薄，建议补充操作章节`);

  const problems = [
    ...doc.problems.map((p) => `[说明书] ${p}`),
    ...src.problems.map((p) => `[源程序] ${p}`),
    ...notes,
  ];

  console.log('=== 软著鉴别材料自查 ===');
  console.log(`说明书: ${docPages} 页，插图 ${doc.images} 张（破图 ${doc.broken}）`);
  console.log(`源程序: ${srcPages} 页（含 1 页编排说明）`);
  if (problems.length === 0) {
    console.log('形式检查全部通过。');
  } else {
    console.log('发现问题：');
    problems.forEach((p) => console.log(' -', p));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
