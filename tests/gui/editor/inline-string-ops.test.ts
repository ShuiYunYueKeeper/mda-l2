/**
 * 字符串层定界符规划（表格单元格复用正文规则）。
 *
 * 判据与正文一致：编辑后的 Markdown 里不得留下「渲染时会露出来」的定界符
 * —— 空定界符对、相邻同类样式段各留一对。
 */
import * as path from 'path';

const ops = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/state/inline-string-ops.js'
));

const ALL_OFF = { bold: false, italic: false, underline: false, strike: false, code: false };
const marksOf = (key: string) => Object.assign({}, ALL_OFF, { [key]: true });

/** 段名在测试文本里唯一，用它定位内容区 */
function contentRange(text: string, seg: string) {
  const i = text.indexOf(seg);
  return { from: i, to: i + seg.length };
}

describe('inline-string-ops 单元格定界符规则', () => {
  test('E100 选区包裹吸收紧邻的同类样式段，不留相邻定界符', () => {
    const text = '**加粗**文字';
    const r = contentRange(text, '文字');
    const out = ops.toggleInlineMarkInText(text, r.from, r.to, 'bold');
    expect(out.value).toBe('**加粗文字**');
  });

  test('E101 选区包裹与已有样式段相交时融合成一对', () => {
    const text = 'AA**加粗**BB';
    const out = ops.toggleInlineMarkInText(text, 0, text.length, 'bold');
    expect(out.value).toBe('**AA加粗BB**');
  });

  test('E102 部分取消拆分成左右两段，而不是留下裸定界符', () => {
    const text = '**加粗文字**';
    const r = contentRange(text, '粗文');
    const out = ops.toggleInlineMarkInText(text, r.from, r.to, 'bold');
    expect(out.value).toBe('**加**粗文**字**');
  });

  test('E103 整段取消时定界符成对删除', () => {
    const text = '**加粗**';
    const r = contentRange(text, '加粗');
    const out = ops.toggleInlineMarkInText(text, r.from, r.to, 'bold');
    expect(out.value).toBe('加粗');
  });

  test('E104 五类标记都能包裹并取消', () => {
    const cases: [string, string][] = [
      ['bold', '**'],
      ['italic', '*'],
      ['underline', '~'],
      ['strike', '~~'],
      ['code', '`'],
    ];
    for (const [key, delim] of cases) {
      const wrapped = ops.toggleInlineMarkInText('文字', 0, 2, key);
      expect(`${key}:${wrapped.value}`).toBe(`${key}:${delim}文字${delim}`);
      const back = ops.toggleInlineMarkInText(
        wrapped.value,
        delim.length,
        delim.length + 2,
        key
      );
      expect(`${key}:${back.value}`).toBe(`${key}:文字`);
    }
  });

  test('E105 头前/尾后待输入插入并入已有样式段，不另包一层', () => {
    const text = 'AA**加粗**BB';
    const head = text.indexOf('**');
    const tail = text.indexOf('BB');
    expect(ops.planTypedInsertInText(text, head, '测试', marksOf('bold')).value).toBe(
      'AA**测试加粗**BB'
    );
    expect(ops.planTypedInsertInText(text, tail, '测试', marksOf('bold')).value).toBe(
      'AA**加粗测试**BB'
    );
  });

  test('E106 待输入取消样式时在段内输入会拆分，不留空对', () => {
    const text = '**加粗**';
    const mid = text.indexOf('加') + 1;
    const out = ops.planTypedInsertInText(text, mid, 'X', ALL_OFF);
    expect(out.value).toBe('**加**X**粗**');
  });

  test('E107 纯文本处带格式输入正常包裹', () => {
    expect(ops.planTypedInsertInText('AABB', 2, '测试', marksOf('italic')).value).toBe(
      'AA*测试*BB'
    );
  });

  test('E109 光标落在样式段内时报告该样式为选中态（工具栏高亮依据）', () => {
    const text = 'AA**加粗**BB';
    const inside = text.indexOf('加') + 1;
    const st = ops.inlineStateInText(text, inside, inside);
    expect(st.bold).toEqual({ on: true, mixed: false });
    expect(st.italic.on).toBe(false);

    const outside = text.indexOf('BB') + 3;
    expect(ops.inlineStateInText(text, outside, outside).bold.on).toBe(false);
  });

  test('E110 选区横跨样式边界时报告 mixed', () => {
    const text = 'AA**加粗**BB';
    const st = ops.inlineStateInText(text, 0, text.length);
    expect(st.bold.mixed).toBe(true);
  });

  test('E111 五类标记的光标态都能识别', () => {
    const cases: [string, string][] = [
      ['bold', '**'],
      ['italic', '*'],
      ['underline', '~'],
      ['strike', '~~'],
      ['code', '`'],
    ];
    for (const [key, delim] of cases) {
      const text = `${delim}文字${delim}`;
      const at = delim.length + 1;
      const st = ops.inlineStateInText(text, at, at);
      expect(`${key}:${st[key].on}`).toBe(`${key}:true`);
    }
  });

  test('E108 markKeyForDelims 覆盖工具栏传入的定界符对', () => {
    expect(ops.markKeyForDelims('**', '**')).toBe('bold');
    expect(ops.markKeyForDelims('*', '*')).toBe('italic');
    expect(ops.markKeyForDelims('~', '~')).toBe('underline');
    expect(ops.markKeyForDelims('~~', '~~')).toBe('strike');
    expect(ops.markKeyForDelims('`', '`')).toBe('code');
    expect(ops.markKeyForDelims('[', ']')).toBeNull();
  });

  test('E127 格内同一段同时下划线+删除线', () => {
    let out = ops.toggleInlineMarkInText('测试文字', 0, 4, 'underline');
    expect(out.value).toBe('~测试文字~');
    const from = out.value.indexOf('测');
    const to = out.value.indexOf('字') + 1;
    out = ops.toggleInlineMarkInText(out.value, from, to, 'strike');
    expect(out.value).toBe('~~~测试文字~~~');
    out = ops.toggleInlineMarkInText(
      out.value,
      out.value.indexOf('测'),
      out.value.indexOf('字') + 1,
      'strike'
    );
    expect(out.value).toBe('~测试文字~');
  });
});
