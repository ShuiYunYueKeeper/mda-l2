/**
 * AI 渲染层纯函数：作用范围 / 载荷 / 输出清洗 / diff / 采纳写入规划
 */
import * as path from 'path';

const base = path.join(__dirname, '../../../src/gui/renderer/editor/ai/model');
const ctx = require(path.join(base, 'ai-context.js'));
const out = require(path.join(base, 'ai-output.js'));
const diff = require(path.join(base, 'ai-diff.js'));
const apply = require(path.join(base, 'ai-apply.js'));

const ANNO = '[comment]: <> (@anno {"id":"a1","content":"note","tags":[],"level":"info","status":"open","created_at":"2026-01-01T00:00:00Z"})';

function applyChanges(text: string, changes: { from: number; to: number; insert: string }[]) {
  let res = text;
  const sorted = changes.slice().sort((a, b) => b.from - a.from);
  for (const c of sorted) res = res.slice(0, c.from) + c.insert + res.slice(c.to);
  return res;
}

describe('ai-context resolveAiScope', () => {
  test('selection inside one line stays inline', () => {
    const text = '第一段有一句话。';
    const r = ctx.resolveAiScope(text, { from: 3, to: 6 }, 'rewrite');
    expect(r).toMatchObject({ ok: true, from: 3, to: 6, inline: true, source: 'selection' });
  });

  test('selection covering the whole line is a block scope', () => {
    const text = 'abc\n  整行内容  \nxyz';
    const r = ctx.resolveAiScope(text, { from: 6, to: 10 }, 'rewrite');
    expect(r).toMatchObject({ ok: true, from: 4, to: 12, inline: false });
  });

  test('multi-line selection expands to whole lines', () => {
    const text = '- 列表一\n- 列表二\n- 列表三';
    const r = ctx.resolveAiScope(text, { from: 3, to: 9 }, 'rewrite');
    expect(r.ok).toBe(true);
    expect(text.slice(r.from, r.to)).toBe('- 列表一\n- 列表二');
  });

  test('empty selection → current paragraph', () => {
    const text = '标题前\n\n段落第一行\n段落第二行\n\n后一段';
    const pos = text.indexOf('第一行');
    const r = ctx.resolveAiScope(text, { from: pos, to: pos }, 'rewrite');
    expect(text.slice(r.from, r.to)).toBe('段落第一行\n段落第二行');
    expect(r.source).toBe('block');
  });

  test('heading line is its own block', () => {
    const text = '## 标题\n正文紧跟';
    const r = ctx.resolveAiScope(text, { from: 3, to: 3 }, 'rewrite');
    expect(text.slice(r.from, r.to)).toBe('## 标题');
  });

  test('rewrite inside code fence is rejected, explain gets the whole fence', () => {
    const text = '前文\n\n```js\nconst a = 1;\n```\n\n```\nb\n```';
    const pos = text.indexOf('const');
    expect(ctx.resolveAiScope(text, { from: pos, to: pos }, 'rewrite')).toEqual({ ok: false, reason: 'widget' });
    const r = ctx.resolveAiScope(text, { from: pos, to: pos }, 'read');
    expect(text.slice(r.from, r.to)).toBe('```js\nconst a = 1;\n```');
  });

  test('blank line → empty', () => {
    const text = 'a\n\nb';
    expect(ctx.resolveAiScope(text, { from: 2, to: 2 }, 'rewrite')).toEqual({ ok: false, reason: 'empty' });
  });

  test('annotation lines are excluded from scope text', () => {
    const text = `${ANNO}\n正文一\n正文二`;
    const r = ctx.resolveAiScope(text, { from: 0, to: text.length }, 'rewrite');
    expect(r.ok).toBe(true);
    expect(r.hasAnno).toBe(true);
    expect(r.scopeText).not.toContain('@anno');
    expect(r.scopeText).toContain('正文二');
  });

  test('annotation-only scope → anno-only', () => {
    const r = ctx.resolveAiScope(ANNO, { from: 0, to: ANNO.length }, 'read');
    expect(r).toEqual({ ok: false, reason: 'anno-only' });
  });

  test('annotation inside a fence is literal text, not stripped', () => {
    const text = '```\n' + ANNO + '\n```';
    const r = ctx.resolveAiScope(text, { from: 5, to: 5 }, 'read');
    expect(r.scopeText).toContain('@anno');
  });
});

describe('ai-context payload', () => {
  test('generate payload strips annotations and clamps', () => {
    const text = 'x'.repeat(7000) + '\n' + ANNO + '\n末尾';
    const scope = ctx.resolveAiScope(text, { from: text.length, to: text.length }, 'generate');
    const p = ctx.buildAiPayload(text, scope, 'generate', { fileName: 'a.md' });
    expect(p.before).not.toContain('@anno');
    expect(p.before.length).toBeLessThanOrEqual(6000);
    expect(p.before.endsWith('末尾')).toBe(true);
    expect(p.fileName).toBe('a.md');
  });

  test('heading path skips fenced pseudo headings', () => {
    const text = '# A\n## B\n```\n# fake\n```\n### C\n正文';
    expect(ctx.headingPathAt(text, text.indexOf('正文'))).toEqual(['A', 'B', 'C']);
  });
});

describe('ai-output cleanAiOutput', () => {
  test('unwraps a whole-answer markdown fence', () => {
    expect(out.cleanAiOutput('```markdown\n# 标题\n正文\n```').text).toBe('# 标题\n正文');
  });

  test('keeps fence when the original itself is a fence', () => {
    const r = out.cleanAiOutput('```js\nx\n```', { original: '```js\ny\n```' });
    expect(r.text).toBe('```js\nx\n```');
  });

  test('drops preamble line', () => {
    expect(out.cleanAiOutput('以下是润色后的内容：\n\n更好的句子。').text).toBe('更好的句子。');
  });

  test('strips injected annotation lines', () => {
    const r = out.cleanAiOutput(`正文\n${ANNO}\n更多`);
    expect(r.text).not.toContain('@anno');
    expect(r.strippedAnno).toBe(true);
  });

  test('inline scope joins lines (CJK without space)', () => {
    const r = out.cleanAiOutput('第一句\n第二句\nand more', { inline: true });
    expect(r.text).toBe('第一句第二句 and more');
    expect(r.joinedLines).toBe(true);
  });
});

describe('ai-diff', () => {
  test('identical text → single eq', () => {
    expect(diff.diffText('abc', 'abc')).toEqual([{ op: 'eq', text: 'abc' }]);
  });

  test('ops reconstruct both sides', () => {
    const a = '这是一个不太通顺的句子，需要 polish it now。';
    const b = '这是一句表述更清晰的句子，需要 refine it now！';
    const ops = diff.diffText(a, b);
    expect(ops.filter((o: any) => o.op !== 'ins').map((o: any) => o.text).join('')).toBe(a);
    expect(ops.filter((o: any) => o.op !== 'del').map((o: any) => o.text).join('')).toBe(b);
  });

  test('english diff is word-level', () => {
    const ops = diff.diffText('the quick fox', 'the slow fox');
    expect(ops).toEqual([
      { op: 'eq', text: 'the ' },
      { op: 'del', text: 'quick' },
      { op: 'ins', text: 'slow' },
      { op: 'eq', text: ' fox' },
    ]);
  });
});

describe('ai-apply', () => {
  test('replace without annotations is a single change', () => {
    const text = '前\n\n旧段落\n\n后';
    const scope = { from: 3, to: 6 };
    const plan = apply.planReplace(text, scope, '新段落');
    expect(plan.ok).toBe(true);
    expect(applyChanges(text, plan.changes)).toBe('前\n\n新段落\n\n后');
  });

  test('replace keeps annotation lines byte-for-byte when paragraph counts match', () => {
    const text = `段一\n\n${ANNO}\n段二`;
    const plan = apply.planReplace(text, { from: 0, to: text.length }, '新一\n\n新二');
    expect(plan.ok).toBe(true);
    const next = applyChanges(text, plan.changes);
    expect(next).toBe(`新一\n\n${ANNO}\n新二`);
  });

  test('paragraph count mismatch across annotations is refused', () => {
    const text = `段一\n\n${ANNO}\n段二`;
    expect(apply.planReplace(text, { from: 0, to: text.length }, '合并成一段')).toEqual({ ok: false, reason: 'anno-split' });
  });

  test('insertAfter separates with one blank line on both sides', () => {
    const text = '第一段\n第二段紧跟';
    const plan = apply.planInsertAfter(text, { from: 0, to: 3 }, '译文');
    expect(applyChanges(text, plan.changes)).toBe('第一段\n\n译文\n\n第二段紧跟');
  });

  test('insert on a blank line right below an annotation moves above it', () => {
    const text = `前文\n\n${ANNO}\n\n归属段`;
    const blankPos = text.indexOf('\n\n归属段') + 1;
    const plan = apply.planInsertAtCursor(text, blankPos, '新内容');
    const next = applyChanges(text, plan.changes);
    expect(next.indexOf('新内容')).toBeLessThan(next.indexOf('@anno'));
    expect(next).toContain(`${ANNO}\n\n归属段`);
  });

  test('continue mid-line appends inline', () => {
    const text = '我们今天';
    const plan = apply.planInsertAtCursor(text, text.length, '讨论三件事。');
    expect(applyChanges(text, plan.changes)).toBe('我们今天讨论三件事。');
  });

  test('continue at line end with block result starts a new paragraph', () => {
    const text = '要点如下：';
    const plan = apply.planInsertAtCursor(text, text.length, '- 一\n- 二');
    expect(applyChanges(text, plan.changes)).toBe('要点如下：\n\n- 一\n- 二');
  });
});
