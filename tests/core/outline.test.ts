import { extractHeadings } from '../../src/core/outline';

describe('outline', () => {
  test('空文档', () => {
    expect(extractHeadings('')).toEqual([]);
  });

  test('单级标题', () => {
    const roots = extractHeadings('# Title\n\nbody');
    expect(roots).toHaveLength(1);
    expect(roots[0].level).toBe(1);
    expect(roots[0].title).toBe('Title');
    expect(roots[0].line).toBe(1);
  });

  test('嵌套标题树', () => {
    const text = '# H1\n## H2\n### H3\n## H2b\n# H1b';
    const roots = extractHeadings(text);
    expect(roots).toHaveLength(2);
    expect(roots[0].children).toHaveLength(2);
    expect(roots[0].children[0].children[0].title).toBe('H3');
    expect(roots[1].title).toBe('H1b');
  });

  test('围栏内 # 忽略', () => {
    const text = '```\n# not heading\n```\n# Real';
    const roots = extractHeadings(text);
    expect(roots).toHaveLength(1);
    expect(roots[0].title).toBe('Real');
  });
});
