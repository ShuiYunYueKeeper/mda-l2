/**
 * 行内成对定界符编辑：纯规划函数（融合包裹 / 拆分取消 / 空对清理 / 隐藏 run 跳过）。
 */
import * as path from 'path';
import { ChangeSet } from '@codemirror/state';

const {
  snapOutOfDelimiters,
  planDeleteRangePreservingPairs,
  planFusedWrap,
  planSplitUnwrap,
  planRegionCleanup,
  skipHiddenRuns,
  toChangeSet,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/inline-delimiters.js'));

type Span = { from: number; to: number };
type Region = {
  key: string;
  open: Span;
  content: Span;
  close: Span;
  openLen?: number;
  closeLen?: number;
};

/** 依据 `**内容**` 的字面位置造一个样式段。 */
function region(text: string, key: string, delim: string, occurrence = 0): Region {
  let idx = -1;
  for (let i = 0; i <= occurrence; i++) idx = text.indexOf(delim, idx + 1);
  const openFrom = idx;
  const openTo = openFrom + delim.length;
  const closeFrom = text.indexOf(delim, openTo);
  return {
    key,
    open: { from: openFrom, to: openTo },
    content: { from: openTo, to: closeFrom },
    close: { from: closeFrom, to: closeFrom + delim.length },
  };
}

function applyText(text: string, changes: { from: number; to: number; insert: string }[]) {
  const sorted = changes.slice().sort((a, b) => a.from - b.from);
  let out = '';
  let cur = 0;
  for (const c of sorted) {
    out += text.slice(cur, c.from) + c.insert;
    cur = c.to;
  }
  return out + text.slice(cur);
}

function deleteChanges(ranges: { from: number; to: number }[]) {
  return ranges.map((r) => ({ from: r.from, to: r.to, insert: '' }));
}

describe('inline-delimiters 定界符规划', () => {
  test('E60 snapOutOfDelimiters 把落在定界符内部的端点推到外侧', () => {
    const runs = [
      { from: 2, to: 4 },
      { from: 8, to: 10 },
    ];
    expect(snapOutOfDelimiters(runs, 3, 9)).toEqual({ from: 2, to: 10 });
    expect(snapOutOfDelimiters(runs, 4, 8)).toEqual({ from: 4, to: 8 });
  });

  test('E61 planFusedWrap 吸收紧邻同类样式段，只留一对定界符', () => {
    const text = '**加粗**尾巴';
    const r = region(text, 'bold', '**');
    const plan = planFusedWrap(text, [r], 6, 7, '**');
    expect(plan).not.toBeNull();
    expect(applyText(text, plan.changes)).toBe('**加粗尾**巴');
  });

  test('E62 planFusedWrap 吸收相交样式段，不产生 `****`', () => {
    const text = 'AA**BB**CC';
    const r = region(text, 'bold', '**');
    const plan = planFusedWrap(text, [r], 0, text.length, '**');
    expect(applyText(text, plan.changes)).toBe('**AABBCC**');
  });

  test('E63 planFusedWrap 空内容不生成定界符对', () => {
    expect(planFusedWrap('****', [region('****', 'bold', '**')], 2, 2, '**')).toBeNull();
  });

  test('E64 planSplitUnwrap 部分取消 → 拆分为左右两段', () => {
    const text = '**加粗文字**';
    const r = region(text, 'bold', '**');
    const plan = planSplitUnwrap(text, [r], 3, 5);
    expect(applyText(text, plan.changes)).toBe('**加**粗文**字**');
  });

  test('E65 planSplitUnwrap 整段取消 → 定界符成对删除，不留单边', () => {
    const text = '**加粗文字**';
    const r = region(text, 'bold', '**');
    const plan = planSplitUnwrap(text, [r], 2, 6);
    expect(applyText(text, plan.changes)).toBe('加粗文字');
  });

  test('E66 planSplitUnwrap 同时摘掉多种标记（清除格式）', () => {
    const text = '~~删~~和**粗**';
    const strike = region(text, 'strike', '~~');
    const bold = region(text, 'bold', '**');
    const plan = planSplitUnwrap(text, [strike, bold], 0, text.length);
    expect(applyText(text, plan.changes)).toBe('删和粗');
  });

  test('E67 planRegionCleanup 删除内容被掏空的样式段整对定界符', () => {
    const text = 'AA****BB';
    const r: Region = {
      key: 'bold',
      open: { from: 2, to: 4 },
      content: { from: 4, to: 4 },
      close: { from: 4, to: 6 },
      openLen: 2,
      closeLen: 2,
    };
    expect(applyText(text, planRegionCleanup([r]))).toBe('AABB');
  });

  test('E68 planDeleteRangePreservingPairs 只覆盖一侧定界符时保留它', () => {
    const text = 'AA**BB**CC';
    const r = region(text, 'bold', '**');
    // 从开定界符左侧选到内容中间（预览里用户只看到选中了 B）：保留开定界符
    expect(planDeleteRangePreservingPairs([r], 2, 5)).toEqual([{ from: 4, to: 5 }]);
    expect(applyText(text, deleteChanges(planDeleteRangePreservingPairs([r], 2, 5)))).toBe(
      'AA**B**CC'
    );
    // 从内容中间选到闭定界符右侧：保留闭定界符
    expect(applyText(text, deleteChanges(planDeleteRangePreservingPairs([r], 5, 8)))).toBe(
      'AA**B**CC'
    );
    // 内容被整段覆盖 → 定界符一并删除，不留空对
    expect(applyText(text, deleteChanges(planDeleteRangePreservingPairs([r], 4, 6)))).toBe('AACC');
    // 整对都在区间内 → 原样删除
    expect(planDeleteRangePreservingPairs([r], 2, 8)).toEqual([{ from: 2, to: 8 }]);
  });

  test('E68a planDeleteRangePreservingPairs 跨越样式段外的选区不误保内容', () => {
    const text = 'AA**BB**CC';
    const r = region(text, 'bold', '**');
    // 从段前正文一直选到内容中间：AA 照删，只留下开定界符
    expect(applyText(text, deleteChanges(planDeleteRangePreservingPairs([r], 0, 5)))).toBe(
      '**B**CC'
    );
  });

  test('E68b planRegionCleanup 回避被本次变更重写过的定界符', () => {
    // IME 上屏会把「内容+闭定界符」整段重写，闭定界符映射后长度变化，
    // 此时拿旧坐标清理会把刚写进去的定界符当残余删掉
    const rewritten: Region = {
      key: 'bold',
      open: { from: 2, to: 4 },
      content: { from: 4, to: 10 },
      close: { from: 10, to: 10 },
      openLen: 2,
      closeLen: 2,
    };
    expect(planRegionCleanup([rewritten])).toEqual([]);
  });

  test('E69 planRegionCleanup 融合紧邻的同类样式段', () => {
    const text = '**A****B**';
    const a: Region = {
      key: 'bold',
      open: { from: 0, to: 2 },
      content: { from: 2, to: 3 },
      close: { from: 3, to: 5 },
      openLen: 2,
      closeLen: 2,
    };
    const b: Region = {
      key: 'bold',
      open: { from: 5, to: 7 },
      content: { from: 7, to: 8 },
      close: { from: 8, to: 10 },
      openLen: 2,
      closeLen: 2,
    };
    expect(applyText(text, planRegionCleanup([a, b]))).toBe('**AB**');
  });

  test('E70 planRegionCleanup 保留结构完好的样式段', () => {
    const text = 'AA**BB**CC';
    const r = region(text, 'bold', '**');
    r.openLen = 2;
    r.closeLen = 2;
    expect(planRegionCleanup([r])).toEqual([]);
  });

  test('E71 skipHiddenRuns 跨过连续隐藏定界符定位到可见字符', () => {
    const runs = [
      { from: 4, to: 6 },
      { from: 6, to: 8 },
    ];
    expect(skipHiddenRuns(runs, 4, false)).toBe(4);
    expect(skipHiddenRuns(runs, 8, false)).toBe(4);
    expect(skipHiddenRuns(runs, 4, true)).toBe(8);
  });

  test('E72 toChangeSet 剔除空转变更并排序', () => {
    const set = toChangeSet(
      [
        { from: 5, to: 5, insert: '' },
        { from: 3, to: 4, insert: '' },
        { from: 0, to: 0, insert: 'X' },
      ],
      10
    );
    expect(set instanceof ChangeSet).toBe(true);
    expect(set.newLength).toBe(10);
  });
});
