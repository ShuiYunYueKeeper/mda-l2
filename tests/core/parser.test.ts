import { parseAnnotations, findParagraphByLine } from '../../src/core/parser';
import { Annotation, Paragraph } from '../../src/core/model';

// ---- 辅助函数 ----
function makeText(lines: string[]): string {
  return lines.join('\n');
}

function makeAnnoLine(anno: Partial<Annotation> & { id: string }): string {
  const a: Annotation = {
    content: '',
    tags: [],
    level: 'info',
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
    ...anno,
  };
  return `[comment]: <> (@anno ${JSON.stringify(a)})`;
}

// ---- E1-E25 ----

describe('parser — 边界测试 E1-E25', () => {
  test('E1: 文件为空', () => {
    const result = parseAnnotations('');
    expect(result.annotations).toEqual([]);
    expect(result.paragraphs).toEqual([]);
  });

  test('E2: 文件无批注', () => {
    const text = makeText(['# 标题', '', '正文内容。']);
    const result = parseAnnotations(text);
    expect(result.annotations).toEqual([]);
    expect(result.paragraphs.length).toBeGreaterThan(0);
  });

  test('E3: 单个批注 + 单个段落', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: 'test', level: 'major' }),
      '这是正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('a1');
    expect(result.annotations[0].line).toBe(1);
    expect(result.paragraphs[0].annotations[0].id).toBe('a1');
    expect(result.paragraphs[0].text).toBe('这是正文。');
  });

  test('E4: 批注与段落之间有空行', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: 'test' }),
      '',
      '这是正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('a1');
    // 批注仍归属于空行下方的段落
    expect(result.paragraphs[0].annotations[0].id).toBe('a1');
    expect(result.paragraphs[0].text).toBe('这是正文。');
  });

  test('E5: 3 个连续批注排列在同一段落上方', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: 'one' }),
      makeAnnoLine({ id: 'a2', content: 'two' }),
      makeAnnoLine({ id: 'a3', content: 'three' }),
      '正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(3);
    expect(result.paragraphs[0].annotations).toHaveLength(3);
    expect(result.paragraphs[0].annotations.map(a => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  test('E6: 多个段落各有批注', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: 'one' }),
      '段落 A。',
      '',
      makeAnnoLine({ id: 'a2', content: 'two' }),
      '段落 B。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(2);
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[0].annotations[0].id).toBe('a1');
    expect(result.paragraphs[1].annotations[0].id).toBe('a2');
  });

  test('E7: 批注在文件末尾无后续正文', () => {
    const text = makeText([
      '段落 A。',
      '',
      makeAnnoLine({ id: 'a1', content: 'orphan' }),
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('a1');
    // 无归属段落
    const hasOrphan = result.annotations.some(
      a => a.id === 'a1' && !result.paragraphs.some(p => p.annotations.includes(a)),
    );
    expect(hasOrphan).toBe(true);
  });

  test('E8: @anno JSON 非法', () => {
    const text = makeText([
      '[comment]: <> (@anno {invalid json)',
      '正文。',
    ]);
    const result = parseAnnotations(text);
    // 不崩溃，跳过非法行
    expect(result.annotations).toHaveLength(0);
  });

  test('E9: @anno JSON 字段缺失', () => {
    const text = makeText([
      '[comment]: <> (@anno {"id":"x"})',
      '正文。',
    ]);
    const result = parseAnnotations(text);
    // 字段不完整，跳过
    expect(result.annotations.filter(a => a.id === 'x')).toHaveLength(0);
  });

  test('E10: JSON 特殊字符 — \\n, \\", \\\\, Unicode', () => {
    const text = makeText([
      makeAnnoLine({
        id: 'a1',
        content: 'line1\\nline2\\n\\"quoted\\"\\\\backslash',
        tags: ['emoji'],
      }),
      '正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].content).toContain('\\n');
    expect(result.annotations[0].content).toContain('\\"');
  });

  test('E11: content 含多行文本', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: '第一行\\n第二行\\n第三行' }),
      '正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].content).toContain('\\n');
  });

  test('E12: UUID 格式无效仍接受', () => {
    const text = makeText([
      makeAnnoLine({ id: 'not-a-uuid', content: 'test' }),
      '正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('not-a-uuid');
  });

  test('E13: 普通注释不被识别为批注', () => {
    const text = makeText([
      '[comment]: <> (这是普通注释)',
      '正文。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(0);
  });

  test('E14: 正文含 @anno 字符串', () => {
    const text = makeText([
      '正文中提到 @anno 语法。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(0);
  });

  test('E15: 文件不存在时 CLI 报错（parser 不负责文件读取，跳过）', () => {
    // parser 单元测试不涵盖文件 I/O，此用例由 CLI 集成测试覆盖
  });

  test('E16: 行号越界（parser 不负责行号校验，由 writer/add 命令处理）', () => {
    // 由 writer 单元测试覆盖
  });

  test('E17: ID 不存在（parser 不负责 ID 查找校验，由 writer 处理）', () => {
    // 由 writer 单元测试覆盖
  });

  test('E18: 目录输入（parser 不处理目录，由 CLI 处理）', () => {
    // 由 CLI 集成测试覆盖
  });

  test('E19: 递归扫描（parser 不处理目录）', () => {
    // 由 CLI 集成测试覆盖
  });

  test('E20: 路径含空格/中文（parser 不处理路径）', () => {
    // 由 CLI 集成测试覆盖
  });

  test('E21: CRLF 换行', () => {
    const text = makeText([
      makeAnnoLine({ id: 'a1', content: 'test' }),
      '正文。',
    ]).replace(/\n/g, '\r\n');
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('a1');
  });

  test('E22: 段落无空行 — @anno 归属其下方第一个正文段落', () => {
    const text = makeText([
      '段落 A。',
      makeAnnoLine({ id: 'a1', content: 'belongs to B' }),
      '段落 B。',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    // 由于无空行分隔，解析器将 A、@anno、B 视为同一段落
    // 批注归属于该合并段落
    const para = result.paragraphs[0];
    expect(para.annotations[0].id).toBe('a1');
    // 段落包含 A 和 B 的内容
    expect(para.text).toContain('段落 A。');
    expect(para.text).toContain('段落 B。');
  });

  test('E23: 写回保护（parser 只读，不涉及写回）', () => {
    // 由 writer 单元测试覆盖
  });

  test('E24: 大文件性能（1MB+）', () => {
    const anno = makeAnnoLine({ id: 'a1', content: 'test' });
    const lines: string[] = [];
    // 生成约 1MB 的文件（~20000 行）
    for (let i = 0; i < 5000; i++) {
      lines.push(anno);
      lines.push(`段落 ${i} 的正文内容。`);
      lines.push('');
    }
    const text = lines.join('\n');
    const start = Date.now();
    const result = parseAnnotations(text);
    const elapsed = Date.now() - start;
    expect(result.annotations).toHaveLength(5000);
    expect(elapsed).toBeLessThan(3000); // 3 秒内
  });

  test('E25: 删除后空行压缩 — parser 不负责压缩，由 writer 处理', () => {
    // 由 writer 单元测试覆盖
  });
});

describe('围栏代码块内的批注样例不识别为真实批注', () => {
  test('``` 代码块内的 @anno 行被忽略', () => {
    const text = makeText([
      '# 标题',
      '',
      makeAnnoLine({ id: 'real-0001', content: '真实批注' }),
      '正文段落。',
      '',
      '```markdown',
      makeAnnoLine({ id: 'fake-0002', content: '代码块示例，不应识别' }),
      '```',
    ]);
    const result = parseAnnotations(text);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].id).toBe('real-0001');
  });

  test('~~~ 围栏同样生效', () => {
    const text = makeText([
      '~~~',
      makeAnnoLine({ id: 'fake-0003', content: 'x' }),
      '~~~',
    ]);
    expect(parseAnnotations(text).annotations).toHaveLength(0);
  });
});

describe('findParagraphByLine', () => {
  test('找到行号所属段落', () => {
    const paragraphs: Paragraph[] = [
      { startLine: 1, endLine: 3, text: 'para1', annotations: [] },
      { startLine: 5, endLine: 7, text: 'para2', annotations: [] },
    ];
    expect(findParagraphByLine(paragraphs, 2)).toBe(paragraphs[0]);
    expect(findParagraphByLine(paragraphs, 6)).toBe(paragraphs[1]);
    expect(findParagraphByLine(paragraphs, 4)).toBeNull();
    expect(findParagraphByLine(paragraphs, 8)).toBeNull();
  });
});
