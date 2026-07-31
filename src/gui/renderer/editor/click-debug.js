/**
 * CM6 点击 vs 光标错位诊断（仅开发构建 + config.clickDebug）。
 */
'use strict';

const { EditorView } = require('@codemirror/view');
const editorConfig = require('./config');

var HUD_ID = 'mda-cm6-click-debug-hud';
var MARKER_CLASS = 'mda-cm6-click-debug-marker';

function clearMarkers() {
  if (typeof document === 'undefined') return;
  var nodes = document.querySelectorAll('.' + MARKER_CLASS);
  for (var i = 0; i < nodes.length; i++) nodes[i].remove();
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 */
function posLabel(view, pos) {
  if (pos == null || pos < 0) return '—';
  var doc = view.state.doc;
  if (pos > doc.length) pos = doc.length;
  var line = doc.lineAt(pos);
  return 'pos ' + pos + ' L' + line.number + ':' + (pos - line.from + 1);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 */
function caretAtPos(view, pos) {
  var rect = view.coordsAtPos(pos, 1);
  if (!rect) return null;
  return {
    x: rect.left,
    y: (rect.top + rect.bottom) / 2,
    rect: rect,
  };
}

function placeMarker(x, y, color, title) {
  if (typeof document === 'undefined') return;
  var m = document.createElement('div');
  m.className = MARKER_CLASS;
  m.title = title;
  m.setAttribute('aria-hidden', 'true');
  var h = 18;
  m.style.cssText =
    'position:fixed;left:' +
    (x - 1) +
    'px;top:' +
    (y - h / 2) +
    'px;width:2px;height:' +
    h +
    'px;background:' +
    color +
    ';box-shadow:0 0 0 1px rgba(0,0,0,.45);z-index:100000;pointer-events:none;';
  document.body.appendChild(m);
}

function updateHud(html) {
  if (typeof document === 'undefined') return;
  var hud = document.getElementById(HUD_ID);
  if (!hud) {
    hud = document.createElement('div');
    hud.id = HUD_ID;
    hud.style.cssText =
      'position:fixed;left:8px;bottom:8px;max-width:min(520px,92vw);padding:8px 10px;' +
      'font:12px/1.45 Consolas,monospace;color:#e6edf3;background:rgba(15,17,23,.92);' +
      'border:1px solid #30363d;border-radius:8px;z-index:100001;pointer-events:none;' +
      'white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.35);';
    document.body.appendChild(hud);
  }
  hud.innerHTML = html;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {MouseEvent} event
 */
function reportClickDebug(view, event) {
  var clickX = event.clientX;
  var clickY = event.clientY;
  var mappedPos = view.posAtCoords({ x: clickX, y: clickY }, 1);
  if (mappedPos == null) mappedPos = view.posAtCoords({ x: clickX, y: clickY }, -1);
  var selHead = view.state.selection.main.head;
  var mappedCaret = mappedPos != null ? caretAtPos(view, mappedPos) : null;
  var cursorCaret = caretAtPos(view, selHead);

  clearMarkers();
  placeMarker(clickX, clickY, '#e74c3c', '鼠标点击 (红)');
  if (mappedCaret) {
    placeMarker(mappedCaret.x, mappedCaret.y, '#3498db', 'posAtCoords 映射 (蓝)');
  }
  if (cursorCaret) {
    placeMarker(cursorCaret.x, cursorCaret.y, '#2ecc71', '实际光标 head (绿)');
  }

  var clickToCursor =
    cursorCaret != null
      ? {
          dx: Math.round((cursorCaret.x - clickX) * 10) / 10,
          dy: Math.round((cursorCaret.y - clickY) * 10) / 10,
        }
      : null;
  var mappedToCursor =
    mappedCaret && cursorCaret
      ? {
          dx: Math.round((cursorCaret.x - mappedCaret.x) * 10) / 10,
          dy: Math.round((cursorCaret.y - mappedCaret.y) * 10) / 10,
        }
      : null;

  var lines = [
    '<b style="color:#f0b429">CM6 点击诊断</b>  红/蓝/绿=竖线',
    '点击 client: (' + clickX + ', ' + clickY + ')',
    'posAtCoords → ' + posLabel(view, mappedPos),
    'selection.head → ' + posLabel(view, selHead),
  ];
  if (clickToCursor) {
    lines.push('点击→光标 Δ: (' + clickToCursor.dx + 'px, ' + clickToCursor.dy + 'px)');
  }
  if (mappedCaret) {
    lines.push(
      '点击→映射 Δ: (' +
        Math.round((mappedCaret.x - clickX) * 10) / 10 +
        'px, ' +
        Math.round((mappedCaret.y - clickY) * 10) / 10 +
        'px)'
    );
  }
  if (mappedToCursor) {
    lines.push('映射→光标 Δ: (' + mappedToCursor.dx + 'px, ' + mappedToCursor.dy + 'px)');
  }
  if (mappedPos != null && mappedPos !== selHead) {
    lines.push('<span style="color:#ff7b72">pos 与 head 不一致 (差 ' + (selHead - mappedPos) + ')</span>');
  }
  updateHud(lines.join('\n'));

  console.log('[mda-editor-click-debug]', {
    client: { x: clickX, y: clickY },
    posAtCoords: mappedPos,
    selectionHead: selHead,
    clickToCursorPx: clickToCursor,
    mappedToCursorPx: mappedToCursor,
    posMismatch: mappedPos !== selHead,
  });
}

function createClickDebugExtension() {
  return EditorView.domEventHandlers({
    mouseup: function (event, view) {
      if (!editorConfig.clickDebugEnabled() || event.button !== 0) return false;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          reportClickDebug(view, event);
        });
      });
      return false;
    },
  });
}

module.exports = {
  createClickDebugExtension: createClickDebugExtension,
  reportClickDebug: reportClickDebug,
};
