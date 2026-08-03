'use strict';

const { WidgetType } = require('@codemirror/view');

/** S24 批注行零高度占位 */
class HiddenLineWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-cm-hidden-line';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  eq() {
    return true;
  }
  get estimatedHeight() {
    return 0;
  }
  ignoreEvent() {
    return true;
  }
}

/** M8-B8b：语法标记零宽 replace（须配合 EditorView.atomicRanges） */
class HideMarkWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mda-cm-hide-mark';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

const HIDE_MARK_WIDGET = new HideMarkWidget();

module.exports = {
  HiddenLineWidget: HiddenLineWidget,
  HideMarkWidget: HideMarkWidget,
  HIDE_MARK_WIDGET: HIDE_MARK_WIDGET,
};
