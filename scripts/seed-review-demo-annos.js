/**
 * 给 samples/review-demo.md 铺一组演示批注（四个级别 + 一条选区批注）。
 *
 * 同文件连续 add 会让其后行号整体 +1，故按目标行**自下而上**串行写入；
 * 选区 anchor 的 UTF-16 偏移由 quote 在当前磁盘文本里检索得到，
 * 再交给 writer 的 shiftAnchorForInsert 随插入行修正。
 *
 * 用法：node scripts/seed-review-demo-annos.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../dist/core');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'samples', 'review-demo.md');

/** 段落级批注：anchorAt 为落点所在段落的首行原文 */
const PARAGRAPH_NOTES = [
  {
    lineStartsWith: '传统 Markdown 编辑器把',
    content: '「直接在渲染结果上编辑」是与同类工具的主要差异，建议在 README 首屏就点明。',
    tags: ['定位'],
    level: 'info',
  },
  {
    lineStartsWith: '挖掉全部隐藏区后的',
    content: '这条判据是整个方案的立足点，务必在 AGENTS 隐性规范里写死，避免后人改回成对检查。',
    tags: ['架构', '约束'],
    level: 'critical',
  },
  {
    lineStartsWith: '取材刻意限制在',
    content: '行窗口的边界条件需要补一条 10 万字文稿的压测数据，否则「肉眼可见」缺少依据。',
    tags: ['性能'],
    level: 'major',
  },
  {
    lineStartsWith: '方案通过评审',
    content: '结论段建议补上复用规划器后新增的回归用例编号，便于验收对照。',
    tags: ['验收'],
    level: 'minor',
  },
];

/** 选区级批注：quote 必须逐字出现在正文里 */
const SELECTION_NOTE = {
  lineStartsWith: '原因是 CommonMark',
  quote: 'flanking 规则',
  content: '这里最好加一个脚注链接到 CommonMark 规范原文，评审时有人问过具体条款。',
  tags: ['文档'],
  level: 'major',
};

function lineNumberOf(text, prefix) {
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(prefix)) return i + 1;
  }
  throw new Error(`未找到以「${prefix}」开头的行`);
}

async function main() {
  const original = fs.readFileSync(DOC, 'utf8');
  if (core.parseAnnotations(original).annotations.length > 0) {
    throw new Error('文档已有批注，请先还原 samples/review-demo.md 再运行');
  }

  const planned = PARAGRAPH_NOTES.map((n) => ({
    line: lineNumberOf(original, n.lineStartsWith),
    input: { content: n.content, tags: n.tags, level: n.level },
  })).sort((a, b) => b.line - a.line);

  for (const item of planned) {
    // eslint-disable-next-line no-await-in-loop
    await core.addAnnotation(DOC, item.line, item.input);
  }

  // 选区批注留到最后：此时正文偏移不再变动，quote 检索结果即为最终 anchor，
  // 本条自身插入引起的位移由 writer 在序列化时迭代修正。
  const seeded = fs.readFileSync(DOC, 'utf8');
  const quoteStart = seeded.indexOf(SELECTION_NOTE.quote);
  if (quoteStart < 0) throw new Error(`正文中找不到 quote：${SELECTION_NOTE.quote}`);
  await core.addAnnotation(DOC, lineNumberOf(seeded, SELECTION_NOTE.lineStartsWith), {
    content: SELECTION_NOTE.content,
    tags: SELECTION_NOTE.tags,
    level: SELECTION_NOTE.level,
    anchor: {
      start: quoteStart,
      end: quoteStart + SELECTION_NOTE.quote.length,
      quote: SELECTION_NOTE.quote,
    },
  });

  const after = fs.readFileSync(DOC, 'utf8');
  const scan = core.parseAnnotations(after);
  const anchored = scan.annotations.filter((a) => a.anchor);
  for (const a of anchored) {
    if (!core.validateAnchor(after, a.anchor)) {
      throw new Error(`锚点失效：${a.id}`);
    }
  }
  process.stdout.write(
    `已写入 ${scan.annotations.length} 条批注（其中选区批注 ${anchored.length} 条）\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
