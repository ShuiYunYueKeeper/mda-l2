/**
 * editor/config.js — 发布闸门与分阶段 widget
 */
import * as path from 'path';

const editorConfig = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/config.js'
));

describe('editor config', () => {
  test('开发构建默认：点击诊断开、widget 阶段 math', () => {
    expect(editorConfig.RELEASE).toBe(false);
    expect(editorConfig.clickDebugEnabled()).toBe(true);
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
