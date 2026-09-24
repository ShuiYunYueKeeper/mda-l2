/**
 * 自动 URL → Markdown 链接（纯函数）
 */
import * as path from 'path';

const {
  findUrlTokenBefore,
  classifyUrlToken,
  planAutoLinkWrap,
  planGrowAutoLink,
  planPasteAutoLink,
  planAutoLinkAtHead,
  isAutoLinkedPair,
  parseSimpleMarkdownLink,
  wrapMarkdownLink,
  isWwwTerminator,
} = require(path.join(__dirname, '../../../src/gui/renderer/editor/model/auto-link.js'));

describe('auto-link model', () => {
  test('www.baidu.com + 空格 → 包装与 caret', () => {
    const doc = 'www.baidu.com ';
    const head = doc.length;
    const plan = planAutoLinkAtHead(doc, head, { justInsertedTerminator: true });
    expect(plan).not.toBeNull();
    expect(plan!.insert).toBe('[www.baidu.com](https://www.baidu.com)');
    expect(plan!.from).toBe(0);
    expect(plan!.to).toBe('www.baidu.com'.length);
    // caret 在可见文本末（] 前）
    expect(plan!.caret).toBe(1 + 'www.baidu.com'.length);
    expect(isWwwTerminator(' ')).toBe(true);
  });

  test('https:// + w → 立即包装', () => {
    const token = 'https://w';
    const classified = classifyUrlToken(token);
    expect(classified).toEqual({ kind: 'scheme', text: token, href: token });
    const plan = planAutoLinkWrap(0, token.length, classified!);
    expect(plan.insert).toBe('[https://w](https://w)');
    expect(plan.caret).toBe(1 + token.length);
  });

  test('https://  alone 不包装', () => {
    expect(classifyUrlToken('https://')).toBeNull();
    expect(classifyUrlToken('http://')).toBeNull();
  });

  test('再输入使 https://ww → text/href 同步', () => {
    const link = '[https://w](https://w)';
    const parsed = parseSimpleMarkdownLink(link, 0, link.length);
    expect(parsed).not.toBeNull();
    expect(isAutoLinkedPair(parsed!.text, parsed!.href)).toBe(true);
    const plan = planGrowAutoLink(0, link.length, 'https://ww', 'https://ww');
    expect(plan.insert).toBe('[https://ww](https://ww)');
    expect(plan.caret).toBe(1 + 'https://ww'.length);
  });

  test('findUrlTokenBefore 遇收尾符止于其前', () => {
    const doc = 'see www.baidu.com ';
    const found = findUrlTokenBefore(doc, doc.length);
    expect(found).toEqual({
      from: 4,
      to: 4 + 'www.baidu.com'.length,
      token: 'www.baidu.com',
    });
  });

  test('粘贴 https://example.com', () => {
    expect(planPasteAutoLink('https://example.com')).toBe(
      '[https://example.com](https://example.com)'
    );
    expect(planPasteAutoLink('  https://example.com\n')).toBe(
      '[https://example.com](https://example.com)'
    );
  });

  test('粘贴 www.example.com', () => {
    expect(planPasteAutoLink('www.example.com')).toBe(
      '[www.example.com](https://www.example.com)'
    );
  });

  test('粘贴非单一 URL 不转换', () => {
    expect(planPasteAutoLink('see https://a.com')).toBeNull();
    expect(planPasteAutoLink('https://a.com\nhttps://b.com')).toBeNull();
    expect(planPasteAutoLink('not a url')).toBeNull();
  });

  test('normalizeExternalHref：www 补 https', () => {
    const { normalizeExternalHref } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/auto-link.js'
    ));
    expect(normalizeExternalHref('www.baidu.com')).toBe('https://www.baidu.com');
    expect(normalizeExternalHref('https://www.baidu.com')).toBe('https://www.baidu.com');
    expect(normalizeExternalHref('//cdn.example.com/a')).toBe('https://cdn.example.com/a');
  });

  test('wrapMarkdownLink', () => {
    expect(wrapMarkdownLink('a', 'b')).toBe('[a](b)');
  });

  test('planAutoLinkWrap：收尾后 caret 在整段链接后', () => {
    const classified = classifyUrlToken('www.baidu.com')!;
    const plan = planAutoLinkWrap(0, 13, classified, { caret: 'afterLink' });
    expect(plan.caret).toBe(plan.insert.length);
    expect(plan.insert.endsWith(')')).toBe(true);
  });

  test('planRepairNewlineInsideLink：把链内换行挪到链接后', () => {
    const { planRepairNewlineInsideLink } = require(path.join(
      __dirname,
      '../../../src/gui/renderer/editor/model/auto-link.js'
    ));
    const broken = '[https://www.baidu.com\n](https://www.baidu.com)';
    const nl = broken.indexOf('\n');
    const plan = planRepairNewlineInsideLink(broken, nl);
    expect(plan).not.toBeNull();
    expect(plan!.insert).toBe('[https://www.baidu.com](https://www.baidu.com)\n');
    expect(plan!.caret).toBe(plan!.insert.length);
  });

  test('findUrlTokenBefore：不把已有 Markdown 链接扫成 token', () => {
    const linked = '[www.baidu.com](https://www.baidu.com)\n\n';
    expect(findUrlTokenBefore(linked, linked.length - 1)).toBeNull();
    expect(findUrlTokenBefore(linked, linked.length)).toBeNull();
  });
});
