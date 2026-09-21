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

  /**
   * 开关成对标记。空选区：插入成对定界符并把光标放中间（不插入占位词）；
   * 已在空定界符对之间则去掉。有选区：已包则拆，否则包。
   * 空选插入零宽空格，避免 `****` 被当成分割线、空 `**` 露出源码。
   */
  var WRAP_ZWSP = '\u200b';

  function toggleWrap(value, start, end, before, after) {
    before = before || '';
    after = after || '';
    if (start === end) {
      if (
        before &&
        start >= before.length &&
        value.slice(start - before.length, start) === before
      ) {
        if (value.slice(start, start + after.length) === after) {
          return {
            value: splice(value, start - before.length, before.length + after.length, ''),
            selectionStart: start - before.length,
            selectionEnd: start - before.length,
          };
        }
        if (
          value.charAt(start) === WRAP_ZWSP &&
          value.slice(start + 1, start + 1 + after.length) === after
        ) {
          return {
            value: splice(value, start - before.length, before.length + 1 + after.length, ''),
            selectionStart: start - before.length,
            selectionEnd: start - before.length,
          };
        }
      }
      if (
        before &&
        start >= before.length + 1 &&
        value.charAt(start - 1) === WRAP_ZWSP &&
        value.slice(start - 1 - before.length, start - 1) === before &&
        value.slice(start, start + after.length) === after
      ) {
        return {
          value: splice(value, start - 1 - before.length, before.length + 1 + after.length, ''),
          selectionStart: start - 1 - before.length,
          selectionEnd: start - 1 - before.length,
        };
      }
      return {
        value: splice(value, start, 0, before + WRAP_ZWSP + after),
        selectionStart: start + before.length,
        selectionEnd: start + before.length + 1,
      };
    }
    var selected = value.slice(start, end);
    if (
      selected.length >= before.length + after.length &&
      selected.slice(0, before.length) === before &&
      selected.slice(selected.length - after.length) === after
    ) {
      var inner = selected.slice(before.length, selected.length - after.length);
      return {
        value: splice(value, start, end - start, inner),
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }
    if (
      before &&
      start >= before.length &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after
    ) {
      var unwrapped = splice(value, end, after.length, '');
      unwrapped = splice(unwrapped, start - before.length, before.length, '');
      return {
        value: unwrapped,
        selectionStart: start - before.length,
        selectionEnd: end - before.length,
      };
    }
    return wrapSelection(value, start, end, before, after, '');
  }

  function unwrapEmphasisStars(text) {
    var out = '';
    var i = 0;
    while (i < text.length) {
      if (text.charAt(i) === '*' && text.charAt(i + 1) === '*') {
        out += '**';
        i += 2;
        continue;
      }
      if (text.charAt(i) === '*') {
        var close = -1;
        var j = i + 1;
        while (j < text.length) {
          if (text.charAt(j) === '\n' || text.charAt(j) === '\r') break;
          if (text.charAt(j) === '*' && text.charAt(j + 1) === '*') {
            j += 2;
            continue;
          }
          if (text.charAt(j) === '*') {
            close = j;
            break;
          }
          j += 1;
        }
        if (close > i) {
          out += text.slice(i + 1, close);
          i = close + 1;
          continue;
        }
      }
      out += text.charAt(i);
      i += 1;
    }
    return out;
  }

  function unwrapThisDelim(text, before, after) {
    if (before === '~' && after === '~') return unwrapSingleTilde(text);
    if (before === '*') return unwrapEmphasisStars(text);
    return unwrapDelim(text, before);
  }

  function tryUnwrapAround(value, start, end, before, after) {
    var selected = value.slice(start, end);
    if (before === '~' && after === '~') {
      if (isSingleTildeWrapped(selected)) {
        var innerT = selected.slice(1, selected.length - 1);
        return {
          value: splice(value, start, end - start, innerT),
          selectionStart: start,
          selectionEnd: start + innerT.length,
        };
      }
      if (
        start >= 1 &&
        isSingleTildeAt(value, start - 1) &&
        end < value.length &&
        isSingleTildeAt(value, end)
      ) {
        var u = splice(value, end, 1, '');
        u = splice(u, start - 1, 1, '');
        return { value: u, selectionStart: start - 1, selectionEnd: end - 1 };
      }
      return null;
    }
    if (
      selected.length >= before.length + after.length &&
      selected.slice(0, before.length) === before &&
      selected.slice(selected.length - after.length) === after
    ) {
      var inner = selected.slice(before.length, selected.length - after.length);
      return {
        value: splice(value, start, end - start, inner),
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }
    if (
      before &&
      start >= before.length &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after
    ) {
      var unwrapped = splice(value, end, after.length, '');
      unwrapped = splice(unwrapped, start - before.length, before.length, '');
      return {
        value: unwrapped,
        selectionStart: start - before.length,
        selectionEnd: end - before.length,
      };
    }
    return null;
  }

  /**
   * 有选区：全选已具该格式则取消，否则对整段选区应用（混合态也是应用）。
   * 无选区返回 null，由 pending 层处理后续输入。
   */
  function applyOrToggleWrap(value, start, end, before, after, fullyOn) {
    before = before || '';
    after = after || '';
    if (start === end) return null;
    if (fullyOn) {
      var around = tryUnwrapAround(value, start, end, before, after);
      if (around) return around;
    }
    var selected = value.slice(start, end);
    var lines = selected.split('\n');
    var newLines = [];
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (!line) {
        newLines.push(line);
        continue;
      }
      var inner = unwrapThisDelim(line, before, after);
      newLines.push(fullyOn ? inner : before + inner + after);
    }
    var next = newLines.join('\n');
    if (next === selected) return null;
    return {
      value: splice(value, start, end - start, next),
      selectionStart: start,
      selectionEnd: start + next.length,
    };
  }

  function applyOrToggleUnderline(value, start, end, fullyOn) {
    return applyOrToggleWrap(value, start, end, '~', '~', fullyOn);
  }

  function isSingleTildeAt(value, pos) {
    if (pos < 0 || pos >= value.length || value.charAt(pos) !== '~') return false;
    if (pos > 0 && value.charAt(pos - 1) === '~') return false;
    if (pos + 1 < value.length && value.charAt(pos + 1) === '~') return false;
    return true;
  }

  function isSingleTildeWrapped(selected) {
    var s = String(selected || '');
    if (s.length < 2) return false;
    if (s.charAt(0) !== '~' || s.charAt(s.length - 1) !== '~') return false;
    if (s.charAt(1) === '~') return false;
    if (s.length >= 3 && s.charAt(s.length - 2) === '~') return false;
    return true;
  }

  /** 下划线：`~text~`（不与 `~~删除线~~` 混淆） */
  function toggleUnderline(value, start, end) {
    var before = '~';
    var after = '~';
    if (start === end) {
      if (
        start >= 1 &&
        isSingleTildeAt(value, start - 1) &&
        start < value.length &&
        isSingleTildeAt(value, start)
      ) {
        return {
          value: splice(value, start - 1, 2, ''),
          selectionStart: start - 1,
          selectionEnd: start - 1,
        };
      }
      if (
        start >= 1 &&
        isSingleTildeAt(value, start - 1) &&
        value.charAt(start) === WRAP_ZWSP &&
        start + 1 < value.length &&
        isSingleTildeAt(value, start + 1)
      ) {
        return {
          value: splice(value, start - 1, 3, ''),
          selectionStart: start - 1,
          selectionEnd: start - 1,
        };
      }
      if (
        start >= 2 &&
        value.charAt(start - 1) === WRAP_ZWSP &&
        isSingleTildeAt(value, start - 2) &&
        start < value.length &&
        isSingleTildeAt(value, start)
      ) {
        return {
          value: splice(value, start - 2, 3, ''),
          selectionStart: start - 2,
          selectionEnd: start - 2,
        };
      }
      return {
        value: splice(value, start, 0, before + WRAP_ZWSP + after),
        selectionStart: start + 1,
        selectionEnd: start + 2,
      };
    }
    var selected = value.slice(start, end);
    if (isSingleTildeWrapped(selected)) {
      var inner = selected.slice(1, selected.length - 1);
      return {
        value: splice(value, start, end - start, inner),
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }
    if (
      start >= 1 &&
      isSingleTildeAt(value, start - 1) &&
      end < value.length &&
      isSingleTildeAt(value, end)
    ) {
      var unwrapped = splice(value, end, 1, '');
      unwrapped = splice(unwrapped, start - 1, 1, '');
      return {
        value: unwrapped,
        selectionStart: start - 1,
        selectionEnd: end - 1,
      };
    }
    return wrapSelection(value, start, end, before, after, '');
  }

  var LIST_PATTERNS = [
    { type: 'task', re: /^(\s*)[-*+]\s+\[[ xX]\]\s+/ },
    { type: 'ol', re: /^(\s*)\d+\.\s+/ },
    { type: 'ul', re: /^(\s*)[-*+]\s+/ },
  ];

  function stripListPrefix(line) {
    for (var i = 0; i < LIST_PATTERNS.length; i++) {
      var m = line.match(LIST_PATTERNS[i].re);
      if (m) {
        return { type: LIST_PATTERNS[i].type, indent: m[1], body: line.slice(m[0].length) };
      }
    }
    var lead = line.match(/^(\s*)/);
    var indent = lead ? lead[1] : '';
    return { type: null, indent: indent, body: line.slice(indent.length) };
  }

  function listPrefixFor(type) {
    if (type === 'ol') return '1. ';
    if (type === 'task') return '- [ ] ';
    if (type === 'ul') return '- ';
    return '';
  }

  function stripHeadingPrefix(indent, body) {
    var m = String(indent + body).match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
    if (!m) return { indent: indent, body: body };
    return { indent: m[1], body: m[4] };
  }

  function toggleListType(value, start, end, type, fenceMask) {
    var prefix = listPrefixFor(type);
    if (!prefix) return null;
    var collapsed = start === end;
    var lr = lineRange(value, start, end);
    var chunk = value.slice(lr.lineStart, lr.lineEnd);
    var lines = chunk.split('\n');
    var baseLine = lineIndexAt(value, lr.lineStart);
    var allSame = true;
    var saw = false;
    for (var i = 0; i < lines.length; i++) {
      if (isInsideFence(fenceMask, baseLine + i)) continue;
      if (!lines[i].trim()) {
        if (collapsed) {
          saw = true;
          allSame = false;
        }
        continue;
      }
      saw = true;
      if (stripListPrefix(lines[i]).type !== type) allSame = false;
    }
    var remove = saw && allSame;
    return applyToLines(
      value,
      start,
      end,
      function (line) {
        if (!line.trim()) {
          if (collapsed && !remove) return prefix;
          return line;
        }
        var info = stripListPrefix(line);
        // 无序/有序列表项内可直接嵌 ATX 标题（`- ## 标题` 仍解析为标题），故保留；
        // 任务项首块必须是段落，`- [ ] ## 标题` 的 # 会退化成字面文本，只能先降为正文。
        if (type === 'task' && !remove) {
          var heading = stripHeadingPrefix(info.indent, info.body);
          info = { type: info.type, indent: heading.indent, body: heading.body };
        }
        if (remove) return info.indent + info.body;
        return info.indent + prefix + info.body;
      },
      fenceMask
    );
  }

  function setHeadingLevelRange(value, start, end, level, fenceMask) {
    var lv = level == null ? 0 : Math.max(0, Math.min(6, level));
    var collapsed = start === end;
    return applyToLines(
      value,
      start,
      end,
      function (line) {
        if (!line.trim()) {
          if (!collapsed) return line;
          if (!lv) return line;
          return '#'.repeat(lv) + ' ';
        }
        var m = line.match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
        var indent = '';
        var body = line;
        if (m) {
          indent = m[1];
          body = m[4];
        } else {
          var lead = line.match(/^( {0,3})/);
          indent = lead ? lead[1] : '';
          body = line.slice(indent.length);
          var listed = stripListPrefix(indent + body);
          indent = listed.indent;
          body = listed.body;
        }
        if (!lv) return indent + body;
        return indent + '#'.repeat(lv) + (body ? ' ' + body : ' ');
      },
      fenceMask
    );
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
      var lead = (line.match(/^ */) || [''])[0].length;
      var n = Math.min(-deltaSpaces, lead);
      if (n > 0) return line.slice(n);
      var info = stripListPrefix(line);
      if (info.type) return info.indent + info.body;
      return line;
    }, fenceMask);
  }

  function unwrapDelim(text, delim) {
    if (!delim) return text;
    var dlen = delim.length;
    var out = '';
    var i = 0;
    while (i < text.length) {
      var open = text.indexOf(delim, i);
      if (open < 0) {
        out += text.slice(i);
        break;
      }
      var close = text.indexOf(delim, open + dlen);
      if (close < 0) {
        out += text.slice(i);
        break;
      }
      var nl = text.indexOf('\n', open);
      if (nl >= 0 && nl < close) {
        out += text.slice(i, open + dlen);
        i = open + dlen;
        continue;
      }
      out += text.slice(i, open) + text.slice(open + dlen, close);
      i = close + dlen;
    }
    return out;
  }

  function unwrapSingleTilde(text) {
    var out = '';
    var i = 0;
    while (i < text.length) {
      if (text.charAt(i) === '~' && text.charAt(i + 1) === '~') {
        out += '~~';
        i += 2;
        continue;
      }
      if (text.charAt(i) === '~') {
        var close = -1;
        var j = i + 1;
        while (j < text.length) {
          if (text.charAt(j) === '\n' || text.charAt(j) === '\r') break;
          if (text.charAt(j) === '~' && text.charAt(j + 1) === '~') {
            j += 2;
            continue;
          }
          if (text.charAt(j) === '~') {
            close = j;
            break;
          }
          j += 1;
        }
        if (close > i) {
          out += text.slice(i + 1, close);
          i = close + 1;
          continue;
        }
      }
      out += text.charAt(i);
      i += 1;
    }
    return out;
  }

  function stripInlineMarks(text) {
    var next = unwrapDelim(text, '**');
    next = unwrapDelim(next, '~~');
    next = unwrapDelim(next, '`');
    next = unwrapDelim(next, '*');
    next = unwrapSingleTilde(next);
    return next;
  }

  function stripBlockLine(line) {
    if (!line.trim()) return line;
    var m = line.match(/^( {0,3})(#{1,6})(\s+)(.*)$/);
    var indent = '';
    var body = line;
    if (m) {
      indent = m[1];
      body = m[4];
    }
    var listed = stripListPrefix(indent + body);
    return listed.indent + listed.body;
  }

  /**
   * 清除选区字符格式，并将覆盖段落还原为正文（去标题/列表）。
   * 无选区不改已有文本（待输入格式由 pending 层清除）。
   */
  function clearFormats(value, start, end, fenceMask) {
    if (start === end) return null;
    var selected = value.slice(start, end);
    var cleared = selected
      .split('\n')
      .map(function (line) {
        return stripInlineMarks(line);
      })
      .join('\n');
    var v2 = splice(value, start, end - start, cleared);
    var newEnd = start + cleared.length;
    var r2 = applyToLines(v2, start, newEnd, stripBlockLine, fenceMask);
    if (r2) return r2;
    if (cleared === selected) return null;
    return { value: v2, selectionStart: start, selectionEnd: newEnd };
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
    toggleWrap: toggleWrap,
    applyOrToggleWrap: applyOrToggleWrap,
    applyOrToggleUnderline: applyOrToggleUnderline,
    toggleUnderline: toggleUnderline,
    WRAP_ZWSP: WRAP_ZWSP,
    toggleHeadingLevel: toggleHeadingLevel,
    setHeadingLevel: setHeadingLevel,
    setHeadingLevelRange: setHeadingLevelRange,
    toggleLinePrefix: toggleLinePrefix,
    toggleListType: toggleListType,
    indentLines: indentLines,
    clearFormats: clearFormats,
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
