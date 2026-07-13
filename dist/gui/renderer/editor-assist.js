// Markdown 辅助编辑（纯函数，可单测）
(function (global) {
  function splice(value, start, deleteCount, insert) {
    return value.slice(0, start) + insert + value.slice(start + deleteCount);
  }

  function lineRange(value, start, end) {
    var lineStart = value.lastIndexOf('\n', start - 1) + 1;
    var lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    return { lineStart: lineStart, lineEnd: lineEnd };
  }

  function lineIndexAt(value, pos) {
    var n = 0;
    for (var i = 0; i < pos && i < value.length; i++) {
      if (value.charAt(i) === '\n') n++;
    }
    return n;
  }

  function cursorLineAt(value, pos) {
    return lineIndexAt(value, pos) + 1;
  }

  function isInsideFence(fenceMask, lineIdx) {
    return !!(fenceMask && fenceMask[lineIdx]);
  }

  function wrapSelection(value, start, end, before, after, placeholder) {
    before = before || '';
    after = after || '';
    placeholder = placeholder == null ? '' : placeholder;
    if (start === end) {
      var ins = before + placeholder + after;
      return {
        value: splice(value, start, 0, ins),
        selectionStart: start + before.length,
        selectionEnd: start + before.length + placeholder.length,
      };
    }
    var selected = value.slice(start, end);
    var wrapped = before + selected + after;
    return {
      value: splice(value, start, end - start, wrapped),
      selectionStart: start + before.length,
      selectionEnd: start + before.length + selected.length,
    };
  }

  function applyToLines(value, start, end, lineFn, fenceMask) {
    var lr = lineRange(value, start, end);
    var chunk = value.slice(lr.lineStart, lr.lineEnd);
    var lines = chunk.split('\n');
    var baseLine = lineIndexAt(value, lr.lineStart);
    var out = [];
    var changed = false;
    for (var i = 0; i < lines.length; i++) {
      if (isInsideFence(fenceMask, baseLine + i)) {
        out.push(lines[i]);
        continue;
      }
      var nl = lineFn(lines[i], i);
      if (nl !== lines[i]) changed = true;
      out.push(nl);
    }
    if (!changed) return null;
    var newChunk = out.join('\n');
    return {
      value: splice(value, lr.lineStart, lr.lineEnd - lr.lineStart, newChunk),
      selectionStart: lr.lineStart,
      selectionEnd: lr.lineStart + newChunk.length,
    };
  }

  function toggleHeadingLevel(value, cursorPos, delta, fenceMask) {
    var lineIdx = lineIndexAt(value, cursorPos);
    if (isInsideFence(fenceMask, lineIdx)) return null;
    var lr = lineRange(value, cursorPos, cursorPos);
    var line = value.slice(lr.lineStart, lr.lineEnd);
    var cursorInLine = cursorPos - lr.lineStart;
    var m = line.match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
    var prefix = '';
    var level = 0;
    var rest = line;
    if (m) {
      prefix = m[1];
      level = m[2].length;
      rest = m[4];
    } else {
      var lead = line.match(/^( {0,3})/);
      prefix = lead ? lead[1] : '';
      rest = line.slice(prefix.length);
    }
    var newLevel = level + delta;
    if (newLevel < 0) newLevel = 0;
    if (newLevel > 6) newLevel = 6;
    var newLine;
    if (newLevel === 0) {
      newLine = prefix + rest;
    } else {
      newLine = prefix + '#'.repeat(newLevel) + ' ' + rest.replace(/^#+\s*/, '');
    }
    var newCursor = lr.lineStart + Math.min(cursorInLine, newLine.length);
    return {
      value: splice(value, lr.lineStart, lr.lineEnd - lr.lineStart, newLine),
      selectionStart: newCursor,
      selectionEnd: newCursor,
    };
  }

  function setHeadingLevel(value, cursorPos, level, fenceMask) {
    var lineIdx = lineIndexAt(value, cursorPos);
    if (isInsideFence(fenceMask, lineIdx)) return null;
    var lr = lineRange(value, cursorPos, cursorPos);
    var line = value.slice(lr.lineStart, lr.lineEnd);
    var cursorInLine = cursorPos - lr.lineStart;
    var m = line.match(/^( {0,3})(#{0,6}\s*)(.*)$/);
    if (!m) return null;
    var lv = Math.max(1, Math.min(6, level));
    var body = m[3].replace(/^#+\s*/, '');
    var newLine = m[1] + '#'.repeat(lv) + (body ? ' ' + body : ' ');
    var newCursor = lr.lineStart + Math.min(cursorInLine, newLine.length);
    return {
      value: splice(value, lr.lineStart, lr.lineEnd - lr.lineStart, newLine),
      selectionStart: newCursor,
      selectionEnd: newCursor,
    };
  }

  function toggleLinePrefix(value, start, end, prefix, fenceMask) {
    return applyToLines(value, start, end, function (line) {
      var m = line.match(/^( {0,3})(.*)$/);
      var indent = m ? m[1] : '';
      var body = m ? m[2] : line;
      if (body.indexOf(prefix) === 0) return indent + body.slice(prefix.length);
      return indent + prefix + body;
    }, fenceMask);
  }

  function indentLines(value, start, end, deltaSpaces, fenceMask) {
    if (!deltaSpaces) return null;
    return applyToLines(value, start, end, function (line) {
      if (!line.trim()) return line;
      if (deltaSpaces > 0) return ' '.repeat(deltaSpaces) + line;
      var trim = Math.min(deltaSpaces, line.match(/^ */)[0].length);
      return line.slice(trim);
    }, fenceMask);
  }

  function insertLink(value, start, end) {
    if (start === end) {
      return wrapSelection(value, start, end, '[', '](url)', 'text');
    }
    var selected = value.slice(start, end);
    return wrapSelection(value, start, end, '[', '](' + selected + ')', '');
  }

  function wrapCodeFence(value, start, end, lang) {
    lang = lang || '';
    var lr = lineRange(value, start, end);
    var chunk = value.slice(lr.lineStart, lr.lineEnd);
    var block = '```' + lang + '\n' + chunk + '\n```';
    return {
      value: splice(value, lr.lineStart, lr.lineEnd - lr.lineStart, block),
      selectionStart: lr.lineStart + 4 + lang.length,
      selectionEnd: lr.lineStart + 4 + lang.length + chunk.length,
    };
  }

  function insertHorizontalRule(value, cursorPos, fenceMask) {
    var lineIdx = lineIndexAt(value, cursorPos);
    if (isInsideFence(fenceMask, lineIdx)) return null;
    var lr = lineRange(value, cursorPos, cursorPos);
    var ins = '---\n';
    var atLineStart = lr.lineStart === cursorPos;
    if (!atLineStart) ins = '\n' + ins;
    return {
      value: splice(value, cursorPos, 0, ins),
      selectionStart: cursorPos + ins.length,
      selectionEnd: cursorPos + ins.length,
    };
  }

  function moveLine(value, cursorPos, direction, fenceMask) {
    var lineIdx = lineIndexAt(value, cursorPos);
    if (isInsideFence(fenceMask, lineIdx)) return null;
    var lr = lineRange(value, cursorPos, cursorPos);
    var line = value.slice(lr.lineStart, lr.lineEnd);
    var before = value.slice(0, lr.lineStart);
    var after = value.slice(lr.lineEnd);
    if (direction < 0) {
      var prevEnd = before.replace(/\n$/, '').lastIndexOf('\n');
      if (prevEnd < 0 && before.length === 0) return null;
      var prevStart = prevEnd < 0 ? 0 : prevEnd + 1;
      var prevLine = value.slice(prevStart, prevEnd < 0 ? before.length : prevEnd);
      if (isInsideFence(fenceMask, lineIndexAt(value, prevStart))) return null;
      var mid = prevLine + '\n' + line;
      var nv = value.slice(0, prevStart) + line + '\n' + prevLine + after;
      return { value: nv, selectionStart: prevStart, selectionEnd: prevStart + line.length };
    }
    var nextNl = after.indexOf('\n');
    if (nextNl < 0 && !after.length) return null;
    var nextLineEnd = nextNl < 0 ? value.length : lr.lineEnd + 1 + nextNl;
    var nextLine = value.slice(lr.lineEnd + 1, nextLineEnd);
    if (isInsideFence(fenceMask, lineIndexAt(value, lr.lineEnd + 1))) return null;
    var nv2 = before + nextLine + '\n' + line + value.slice(nextLineEnd);
    return { value: nv2, selectionStart: lr.lineStart + nextLine.length + 1, selectionEnd: lr.lineStart + nextLine.length + 1 + line.length };
  }

  function duplicateLine(value, cursorPos, fenceMask) {
    var lineIdx = lineIndexAt(value, cursorPos);
    if (isInsideFence(fenceMask, lineIdx)) return null;
    var lr = lineRange(value, cursorPos, cursorPos);
    var line = value.slice(lr.lineStart, lr.lineEnd);
    var ins = line + '\n';
    return {
      value: splice(value, lr.lineEnd, 0, '\n' + line),
      selectionStart: lr.lineEnd + 1,
      selectionEnd: lr.lineEnd + 1 + line.length,
    };
  }

  function applyEdit(editor, result) {
    if (!result || !editor) return false;
    var oldVal = editor.value;
    var newVal = result.value;
    if (oldVal === newVal) return false;

    // 用 insertText 保留 textarea 撤销栈（直接赋 value 会清空 Ctrl+Z）
    var a = 0;
    while (a < oldVal.length && a < newVal.length && oldVal.charAt(a) === newVal.charAt(a)) a++;
    var b = 0;
    while (
      b < oldVal.length - a && b < newVal.length - a &&
      oldVal.charAt(oldVal.length - 1 - b) === newVal.charAt(newVal.length - 1 - b)
    ) b++;
    var delStart = a;
    var delEnd = oldVal.length - b;
    var inserted = newVal.slice(a, newVal.length - b);

    editor.focus();
    editor.setSelectionRange(delStart, delEnd);
    var ok = false;
    try {
      ok = document.execCommand('insertText', false, inserted);
    } catch (e) { /* fallback below */ }
    if (!ok) {
      editor.value = newVal;
    }
    editor.selectionStart = result.selectionStart;
    editor.selectionEnd = result.selectionEnd;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  var api = {
    splice: splice,
    lineRange: lineRange,
    lineIndexAt: lineIndexAt,
    cursorLineAt: cursorLineAt,
    isInsideFence: isInsideFence,
    wrapSelection: wrapSelection,
    toggleHeadingLevel: toggleHeadingLevel,
    setHeadingLevel: setHeadingLevel,
    toggleLinePrefix: toggleLinePrefix,
    indentLines: indentLines,
    insertLink: insertLink,
    wrapCodeFence: wrapCodeFence,
    insertHorizontalRule: insertHorizontalRule,
    moveLine: moveLine,
    duplicateLine: duplicateLine,
    applyEdit: applyEdit,
  };

  global.MDAEditorAssist = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
