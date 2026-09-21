/**
 * editor/config.js — 发布闸门与分阶段 widget
 */
import * as path from 'path';

const editorConfig = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/config.js'
));

describe('editor config', () => {
  test('开发构建默认：点击诊断关、widget 阶段 math', () => {
    expect(editorConfig.RELEASE).toBe(false);
    // 诊断 HUD 会遮挡正文，默认关闭；排查坐标问题时置 mda-editor-debug-click=1
    expect(editorConfig.clickDebugEnabled()).toBe(false);
    expect(editorConfig.readWidgetPhase()).toBe('math');
    expect(editorConfig.blockWidgetsEnabled()).toBe(true);
    expect(editorConfig.blockWidgetEnabled('image')).toBe(true);
    expect(editorConfig.blockWidgetEnabled('mermaid')).toBe(true);
    expect(editorConfig.blockWidgetEnabled('table')).toBe(true);
    expect(editorConfig.blockWidgetEnabled('code')).toBe(true);
    expect(editorConfig.blockWidgetEnabled('quote-handle')).toBe(true);
    expect(editorConfig.blockWidgetEnabled('hr')).toBe(true);
    expect(editorConfig.mathWidgetEnabled('math-inline')).toBe(true);
    expect(editorConfig.mathWidgetEnabled('math-block')).toBe(true);
  });

  test('暴露阶段常量供文档引用', () => {
    expect(editorConfig.WIDGET_PHASES).toContain('text');
    expect(editorConfig.WIDGET_PHASES).toContain('image');
    expect(editorConfig.WIDGET_PHASES).toContain('full');
  });
});
