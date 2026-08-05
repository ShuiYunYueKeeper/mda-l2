/**
 * 块 widget 顶栏：语言切换后刷新文案
 */
import * as path from 'path';

const { refreshBlockToolbars } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/widgets/widget-common.js'
));

describe('refreshBlockToolbars', () => {
  test('更新标签、按钮与 title', () => {
    const label = {
      textContent: '',
      getAttribute: (n: string) => (n === 'data-mda-mermaid-kw' ? 'flowchart' : null),
    };
    const btn = { textContent: '', title: '', getAttribute: (n: string) => (n === 'data-i18n-key' ? 'zoomCopySource' : null) };
    const frame = { title: '', getAttribute: () => 'widgetImageDragHint' };
    const root = {
      querySelectorAll(sel: string) {
        if (sel.indexOf('toolbar-label') >= 0) return [label];
        if (sel.indexOf('toolbar-btn') >= 0) return [btn];
        if (sel.indexOf('data-i18n-title') >= 0) return [frame];
        if (sel.indexOf('data-i18n-aria') >= 0) return [];
        return [];
      },
    };

    refreshBlockToolbars(root, function (k: string) {
      if (k === 'mermaidKwFlowchart') return '流程图';
      if (k === 'zoomCopySource') return '复制源码';
      if (k === 'widgetImageDragHint') return '拖动手柄';
      return k;
    });

    expect(label.textContent).toBe('流程图');
    expect(btn.textContent).toBe('复制源码');
    expect(frame.title).toBe('拖动手柄');
  });

  test('mermaid 源码模式按钮显示 Preview', () => {
    const btn = {
      textContent: '',
      title: '',
      getAttribute: (n: string) => {
        if (n === 'data-i18n-key') return 'widgetCodeSource';
        if (n === 'data-i18n-toggle') return 'mermaid-source';
        return null;
      },
      closest: () => ({ classList: { contains: () => true } }),
    };
    const root = {
      querySelectorAll(sel: string) {
        if (sel.indexOf('toolbar-label') >= 0) return [];
        if (sel.indexOf('toolbar-btn') >= 0) return [btn];
        if (sel.indexOf('data-i18n-title') >= 0) return [];
        if (sel.indexOf('data-i18n-aria') >= 0) return [];
        return [];
      },
    };

    refreshBlockToolbars(root, function (k: string) {
      return k === 'widgetMermaidPreview' ? 'Preview' : 'Source';
    });

    expect(btn.textContent).toBe('Preview');
  });
});
