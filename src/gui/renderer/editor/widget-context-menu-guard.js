/**
 * 右键菜单打开期间：暂缓 widget contenteditable 的 blur 提交 / 折叠，避免选区快照失效。
 */
'use strict';

/** @type {boolean} */
let widgetDomMenuGuard = false;

/**
 * @param {boolean} on
 */
function setWidgetDomMenuGuard(on) {
  widgetDomMenuGuard = !!on;
}

function isWidgetDomMenuGuard() {
  return widgetDomMenuGuard;
}

module.exports = {
  setWidgetDomMenuGuard: setWidgetDomMenuGuard,
  isWidgetDomMenuGuard: isWidgetDomMenuGuard,
};
