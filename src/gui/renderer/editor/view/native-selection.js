/**
 * @deprecated 逻辑已并入 tight-selection.js 的 createProseSelectionExtension
 */
'use strict';

const { createProseSelectionExtension } = require('./tight-selection');

function createNativeSelectionTheme() {
  // 仅返回主题部分不够；挂完整 prose 选区扩展由 mount 直接调 createProseSelectionExtension
  return createProseSelectionExtension()[1];
}

module.exports = {
  createNativeSelectionTheme: createNativeSelectionTheme,
};
