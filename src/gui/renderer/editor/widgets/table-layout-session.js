/**
 * 表格列宽 / 行高会话态（不写 Markdown，跨 widget 重建保留）。
 */
'use strict';

const { hasTableLayoutMeta } = require('../model/parse-table');

/** @type {Map<string, { colWidths: number[], rowHeights: number[] }>} */
const sessions = new Map();

/**
 * @param {string} source
 */
function normalizeSessionKey(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
}

/**
 * @param {string} source
 * @returns {{ colWidths: number[], rowHeights: number[] } | null}
 */
function getTableLayoutSession(source) {
  const key = normalizeSessionKey(source);
  if (!key) return null;
  const sess = sessions.get(key);
  if (!sess) return null;
  return {
    colWidths: sess.colWidths.slice(),
    rowHeights: sess.rowHeights.slice(),
  };
}

/**
 * @param {string} source
 * @param {{ colWidths?: number[], rowHeights?: number[] }} parsed
 */
function setTableLayoutSession(source, parsed) {
  const key = normalizeSessionKey(source);
  if (!key || !parsed || !hasTableLayoutMeta(parsed)) {
    if (key) sessions.delete(key);
    return;
  }
  sessions.set(key, {
    colWidths: (parsed.colWidths || []).slice(),
    rowHeights: (parsed.rowHeights || []).slice(),
  });
}

/**
 * @param {string} oldSource
 * @param {string} newSource
 */
function migrateTableLayoutSession(oldSource, newSource) {
  const oldKey = normalizeSessionKey(oldSource);
  const newKey = normalizeSessionKey(newSource);
  if (!oldKey || !newKey || oldKey === newKey) return;
  const sess = sessions.get(oldKey);
  if (!sess) return;
  sessions.set(newKey, {
    colWidths: sess.colWidths.slice(),
    rowHeights: sess.rowHeights.slice(),
  });
  sessions.delete(oldKey);
}

/**
 * 结构变更后按列数对齐会话布局（新增列补 0，删除列截断）。
 * @param {{ headers: string[], colWidths?: number[], rowHeights?: number[] }} parsed
 * @param {{ colWidths: number[], rowHeights: number[] }} sess
 */
function mergeTableLayoutSession(parsed, sess) {
  if (!parsed || !sess) return;
  const ncol = parsed.headers.length;
  const nrow = 1 + parsed.rows.length;
  if (sess.colWidths.length) {
    const cw = sess.colWidths.slice();
    while (cw.length < ncol) cw.push(0);
    if (cw.length > ncol) cw.length = ncol;
    parsed.colWidths = cw;
  }
  if (sess.rowHeights.length) {
    const rh = sess.rowHeights.slice();
    while (rh.length < nrow) rh.push(0);
    if (rh.length > nrow) rh.length = nrow;
    parsed.rowHeights = rh;
  }
}

/**
 * @param {string} source
 * @param {{ headers: string[], aligns: string[], rows: string[][], colWidths?: number[], rowHeights?: number[] }} parsed
 */
function applyTableLayoutSession(source, parsed) {
  if (!parsed) return;
  const sess = getTableLayoutSession(source);
  if (!sess) return;
  mergeTableLayoutSession(parsed, sess);
}

/**
 * @param {string} source
 */
function clearTableLayoutSession(source) {
  const key = normalizeSessionKey(source);
  if (key) sessions.delete(key);
}

module.exports = {
  getTableLayoutSession: getTableLayoutSession,
  setTableLayoutSession: setTableLayoutSession,
  applyTableLayoutSession: applyTableLayoutSession,
  migrateTableLayoutSession: migrateTableLayoutSession,
  mergeTableLayoutSession: mergeTableLayoutSession,
  clearTableLayoutSession: clearTableLayoutSession,
};
