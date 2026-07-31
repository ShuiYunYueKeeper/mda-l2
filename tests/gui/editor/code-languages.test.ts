/**
 * M8-C4：围栏代码块语言列表与归一化
 */
import * as path from 'path';

const {
  CODE_BLOCK_LANGUAGES,
  normalizeCodeBlockLang,
  findCodeLanguage,
  getCodeLangLabel,
  filterCodeLanguages,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/widgets/code-languages.js'));

describe('code-languages', () => {
  test('列表包含竞品截图中的主要语言', () => {
    const labels = CODE_BLOCK_LANGUAGES.map((item: { label: string }) => item.label);
    expect(labels).toContain('Plain Text');
    expect(labels).toContain('TypeScript');
    expect(labels).toContain('Verilog/SystemVerilog');
    expect(labels).toContain('XML/HTML');
    expect(labels).toContain('YAML');
    expect(CODE_BLOCK_LANGUAGES.length).toBeGreaterThanOrEqual(40);
  });

  test('normalizeCodeBlockLang 归一化常见别名', () => {
    expect(normalizeCodeBlockLang('')).toBe('');
    expect(normalizeCodeBlockLang('js')).toBe('javascript');
    expect(normalizeCodeBlockLang('C++')).toBe('cpp');
    expect(normalizeCodeBlockLang('html')).toBe('xml');
    expect(normalizeCodeBlockLang('plaintext')).toBe('');
  });

  test('findCodeLanguage 未知语言保留 id', () => {
    expect(findCodeLanguage('zig').id).toBe('zig');
    expect(findCodeLanguage('python').label).toBe('Python');
  });

  test('getCodeLangLabel 纯文本走 i18n', () => {
    expect(getCodeLangLabel('', (k: string) => 'i18n:' + k)).toBe('i18n:widgetCodeLangPlain');
    expect(getCodeLangLabel('go')).toBe('Go');
  });

  test('filterCodeLanguages 支持按名称过滤', () => {
    const hits = filterCodeLanguages('script');
    const ids = hits.map((item: { id: string }) => item.id);
    expect(ids).toContain('javascript');
    expect(ids).toContain('typescript');
  });
});
