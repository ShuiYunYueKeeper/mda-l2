// 预览 / 源码选区 ↔ UTF-16 anchor 映射（M4）
(function (global) {
  function lineOffsetUtf16(text, line1Based) {
    if (!text || line1Based <= 1) return 0;
    var lines = text.split(/\r?\n/);
    var idx = Math.min(line1Based - 1, lines.length);
    if (idx <= 0) return 0;
    return lines.slice(0, idx).join('\n').length + 1;
  }

  function paragraphEndLine(text, line1Based) {
    var lines = text.split(/\r?\n/);
    var idx = Math.max(0, Math.min(line1Based - 1, lines.length - 1));
    while (idx < lines.length - 1 && lines[idx + 1].trim() !== '') idx++;
    return idx + 1;
  }

  function paragraphBounds(text, line1Based) {
    var endLine = paragraphEndLine(text, line1Based);
    var lines = text.split(/\r?\n/);
    var startIdx = Math.max(0, line1Based - 1);
    var endIdx = Math.min(endLine - 1, lines.length - 1);
    var start = lineOffsetUtf16(text, line1Based);
    var end = start + lines.slice(startIdx, endIdx + 1).join('\n').length;
    return { start: start, end: end, endLine: endLine };
  }

  function anchorToLine(text, start) {
    if (!text || start <= 0) return 1;
    return text.slice(0, start).split(/\r?\n/).length;
  }

  /** 将段落内 Markdown 映射为 plain 文本及 plain 下标 → 源码下标 */
  function buildPlainTextMap(markdown) {
    var plain = '';
    var toSource = [];
    var i = 0;

    function emit(ch, srcIdx) {
      plain += ch;
      toSource.push(srcIdx);
    }

    while (i < markdown.length) {
      if (markdown[i] === '`') {
        var close = markdown.indexOf('`', i + 1);
        if (close > i) {
          for (var j = i + 1; j < close; j++) emit(markdown[j], j);
          i = close + 1;
          continue;
        }
      }
      if (markdown.slice(i, i + 2) === '**') {
        var endB = markdown.indexOf('**', i + 2);
        if (endB > i) {
          for (var j2 = i + 2; j2 < endB; j2++) emit(markdown[j2], j2);
          i = endB + 2;
          continue;
        }
      }
      if (markdown.slice(i, i + 2) === '__') {
        var endU = markdown.indexOf('__', i + 2);
        if (endU > i) {
          for (var j3 = i + 2; j3 < endU; j3++) emit(markdown[j3], j3);
          i = endU + 2;
          continue;
        }
      }
      if (markdown[i] === '[') {
        var rb = markdown.indexOf(']', i + 1);
        var lp = rb >= 0 ? markdown.indexOf('(', rb) : -1;
        var rp = lp >= 0 ? markdown.indexOf(')', lp) : -1;
        if (rb > i && lp === rb + 1 && rp > lp) {
          for (var j4 = i + 1; j4 < rb; j4++) emit(markdown[j4], j4);
          i = rp + 1;
          continue;
        }
      }
      if (markdown.slice(i, i + 2) === '~~') {
        var endS = markdown.indexOf('~~', i + 2);
        if (endS > i) {
          for (var j5 = i + 2; j5 < endS; j5++) emit(markdown[j5], j5);
          i = endS + 2;
          continue;
        }
      }
      if (markdown[i] === '*' || markdown[i] === '_' || markdown[i] === '~') {
        i++;
        continue;
      }
      emit(markdown[i], i);
      i++;
    }
    return { plain: plain, toSource: toSource };
  }

  function mapPlainRangeToSource(map, plainStart, plainLen) {
    if (!map || plainLen <= 0 || plainStart < 0 || plainStart >= map.plain.length) return null;
    var endPlain = Math.min(plainStart + plainLen, map.plain.length);
    var startSrc = map.toSource[plainStart];
    var endSrc = map.toSource[endPlain - 1];
    if (startSrc === undefined || endSrc === undefined) return null;
    return { start: startSrc, end: endSrc + 1 };
  }

  function findQuoteInRegion(region, quote, renderedStart, renderedLen) {
    if (!quote) return -1;
    var matches = [];
    var pos = 0;
    while (pos <= region.length) {
      var idx = region.indexOf(quote, pos);
      if (idx < 0) break;
      matches.push(idx);
      pos = idx + 1;
    }
    if (matches.length === 0) return -1;
    if (matches.length === 1) return matches[0];
    var ratio = renderedLen > 0 ? renderedStart / renderedLen : 0;
    var target = Math.floor(ratio * region.length);
    var best = matches[0];
    var bestDist = Math.abs(matches[0] - target);
    for (var m = 1; m < matches.length; m++) {
      var d = Math.abs(matches[m] - target);
      if (d < bestDist) {
        best = matches[m];
        bestDist = d;
      }
    }
    return best;
  }

  function resolveQuoteOffsets(region, quote, renderedStart, renderedText) {
    var direct = findQuoteInRegion(region, quote, renderedStart, renderedText.length);
    if (direct >= 0) return { start: direct, end: direct + quote.length };

    var map = buildPlainTextMap(region);
    var plainIdx = findQuoteInRegion(map.plain, quote, renderedStart, renderedText.length);
    if (plainIdx < 0) return null;
    var mapped = mapPlainRangeToSource(map, plainIdx, quote.length);
    if (!mapped) return null;
    return mapped;
  }

  function detectEol(text) {
    return text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  }

  function charOffsetAtLineIndex(lines, lineIndex0, eol) {
    if (lineIndex0 <= 0) return 0;
    if (lineIndex0 >= lines.length) {
      return lines.join(eol).length + (lines.length > 0 ? eol.length : 0);
    }
    return lines.slice(0, lineIndex0).join(eol).length + eol.length;
  }

  /** 围栏代码块内容区在源码中的偏移（不含 ``` 行） */
  function extractFenceContentRegions(sourceText) {
    var bom = sourceText.charCodeAt(0) === 0xfeff ? 1 : 0;
    var stripped = bom ? sourceText.slice(1) : sourceText;
    var lines = stripped.split(/\r?\n/);
    var eol = detectEol(stripped);
    var regions = [];
    var i = 0;
    while (i < lines.length) {
      var open = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
      if (!open) {
        i++;
        continue;
      }
      var fenceChar = open[1][0];
      var fenceLen = open[1].length;
      var contentStartLine = i + 1;
      if (contentStartLine >= lines.length) break;
      var contentStart = charOffsetAtLineIndex(lines, contentStartLine, eol);
      var j = contentStartLine;
      while (j < lines.length) {
        var close = lines[j].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
          var contentEnd = charOffsetAtLineIndex(lines, j, eol);
          regions.push({
            contentStart: contentStart + bom,
            contentEnd: contentEnd + bom,
            content: stripped.slice(contentStart, contentEnd),
          });
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= lines.length) break;
    }
    return regions;
  }

  function isFenceCodeNode(node) {
    var el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !el.closest) return false;
    if (el.closest('.mda-code, .mda-code-pre, .mda-code-scroll')) return true;
    var pre = el.closest('pre');
    if (pre && pre.querySelector('code') && !pre.closest('p, li, td, th')) return true;
    return false;
  }

  function findFenceCodeElement(node) {
    var el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !el.closest) return null;
    return el.closest('.mda-code-pre code') || el.closest('pre code');
  }

  function isSelectionUiChrome(node) {
    var el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !el.closest) return false;
    return !!el.closest('.mda-zoom, .mda-code-copy, .mda-code-gutter, .katex');
  }

  function isForbiddenNode(node) {
    return isSelectionUiChrome(node);
  }

  function fenceContentMatches(blockText, fenceContent) {
    var a = (blockText || '').replace(/\n$/, '');
    var b = (fenceContent || '').replace(/\n$/, '');
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  function selectionFromCodeFence(range, quote, sourceText) {
    var codeEl = findFenceCodeElement(range.commonAncestorContainer);
    if (!codeEl) return null;
    var blockText = codeEl.textContent.replace(/\n$/, '');
    var renderedStart = getRenderedOffsetInBlock(codeEl, range.startContainer, range.startOffset);
    var regions = extractFenceContentRegions(sourceText);
    var best = null;
    var bestDist = Infinity;

    for (var r = 0; r < regions.length; r++) {
      var reg = regions[r];
      if (!fenceContentMatches(blockText, reg.content)) continue;
      var rel = resolveQuoteOffsets(reg.content, quote, renderedStart, blockText);
      if (!rel) continue;
      var absStart = reg.contentStart + rel.start;
      var dist = Math.abs(renderedStart - rel.start);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          start: absStart,
          end: reg.contentStart + rel.end,
          quote: sourceText.slice(absStart, reg.contentStart + rel.end),
        };
      }
    }

    if (best) return best;

    for (var s = 0; s < regions.length; s++) {
      var reg2 = regions[s];
      var idx = reg2.content.indexOf(quote);
      if (idx < 0) continue;
      var start = reg2.contentStart + idx;
      return { start: start, end: start + quote.length, quote: sourceText.slice(start, start + quote.length) };
    }
    return null;
  }

  function findTextRangeInElementPlain(root, searchText) {
    if (!root || !searchText) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var full = '';
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      nodes.push({ node: node, start: full.length });
      full += node.textContent || '';
    }
    var idx = full.indexOf(searchText);
    if (idx < 0) return null;
    return createRangeFromTextOffsets(nodes, idx, idx + searchText.length);
  }

  function getRenderedOffsetInBlock(block, container, offset) {
    if (!block) return 0;
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    var count = 0;
    var node;
    while ((node = walker.nextNode())) {
      if (node === container) return count + offset;
      count += (node.textContent || '').length;
    }
    return count;
  }

  function getBlockRenderedText(block) {
    return block ? (block.textContent || '') : '';
  }

  function selectionFromEditor(editorEl) {
    if (!editorEl) return null;
    var start = editorEl.selectionStart;
    var end = editorEl.selectionEnd;
    if (start === end) return null;
    var quote = editorEl.value.slice(start, end);
    if (!quote) return null;
    return { start: start, end: end, quote: quote };
  }

  function selectionFromPreview(previewEl, sourceText, selOrSnapshot) {
    var range;
    var quote;
    if (selOrSnapshot && selOrSnapshot.range) {
      range = selOrSnapshot.range;
      quote = selOrSnapshot.quote || '';
    } else {
      var sel = selOrSnapshot || (typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null);
      if (!previewEl || !sourceText || !sel || sel.isCollapsed || !sel.rangeCount) return null;
      range = sel.getRangeAt(0);
      quote = sel.toString();
    }
    if (!previewEl || !sourceText || !range || !quote) return null;

    if (!previewEl.contains(range.commonAncestorContainer)) return null;
    if (isSelectionUiChrome(range.commonAncestorContainer)) return null;

    if (isFenceCodeNode(range.commonAncestorContainer)) {
      return selectionFromCodeFence(range, quote, sourceText);
    }

    var startBlock = findDataLineBlock(range.startContainer);
    var endBlock = findDataLineBlock(range.endContainer);
    if (!startBlock || !endBlock) return null;

    var startLine = parseInt(startBlock.getAttribute('data-line'), 10);
    var endLine = parseInt(endBlock.getAttribute('data-line'), 10);
    if (isNaN(startLine) || isNaN(endLine)) return null;

    var renderedStart = getRenderedOffsetInBlock(startBlock, range.startContainer, range.startOffset);
    var startBounds = paragraphBounds(sourceText, startLine);
    var endBounds = paragraphBounds(sourceText, endLine);
    var regionStart = startBounds.start;
    var regionEnd = endBounds.end;
    var region = sourceText.slice(regionStart, regionEnd);

    var renderedContext = getBlockRenderedText(startBlock);
    if (startLine !== endLine || startBlock !== endBlock) {
      renderedContext = quote;
      renderedStart = 0;
      regionStart = startBounds.start;
      regionEnd = endBounds.end;
      region = sourceText.slice(regionStart, regionEnd);
    }

    var rel = resolveQuoteOffsets(region, quote, renderedStart, renderedContext);
    if (!rel) return null;

    return {
      start: regionStart + rel.start,
      end: regionStart + rel.end,
      quote: sourceText.slice(regionStart + rel.start, regionStart + rel.end),
    };
  }

  function findDataLineBlock(node) {
    var el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el || !el.closest) return null;
    return el.closest('[data-line]');
  }

  function createRangeFromTextOffsets(nodes, startIdx, endIdx) {
    if (!nodes.length) return null;
    var startNode = null;
    var startOff = 0;
    var endNode = null;
    var endOff = 0;
    for (var i = 0; i < nodes.length; i++) {
      var entry = nodes[i];
      var len = (entry.node.textContent || '').length;
      var nodeEnd = entry.start + len;
      if (!startNode && startIdx >= entry.start && startIdx <= nodeEnd) {
        startNode = entry.node;
        startOff = startIdx - entry.start;
      }
      if (endIdx >= entry.start && endIdx <= nodeEnd) {
        endNode = entry.node;
        endOff = endIdx - entry.start;
        break;
      }
    }
    if (!startNode || !endNode) return null;
    var domRange = document.createRange();
    try {
      domRange.setStart(startNode, startOff);
      domRange.setEnd(endNode, endOff);
      return domRange;
    } catch (e) {
      return null;
    }
  }

  function findTextRangeInElement(root, searchText) {
    if (!root || !searchText) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('code, pre, .mda-code')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var full = '';
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      nodes.push({ node: node, start: full.length });
      full += node.textContent || '';
    }
    var idx = full.indexOf(searchText);
    if (idx < 0) return null;
    return createRangeFromTextOffsets(nodes, idx, idx + searchText.length);
  }

  function anchorPlainQuote(sourceText, anchor) {
    if (!anchor) return '';
    var slice = sourceText.slice(anchor.start, anchor.end);
    return buildPlainTextMap(slice).plain || slice;
  }

  function anchorToPreviewRange(previewEl, sourceText, anchor) {
    if (!previewEl || !sourceText || !anchor) return null;
    if (anchor.start < 0 || anchor.end <= anchor.start || anchor.end > sourceText.length) return null;

    var quote = sourceText.slice(anchor.start, anchor.end);
    var fences = extractFenceContentRegions(sourceText);
    for (var f = 0; f < fences.length; f++) {
      var reg = fences[f];
      if (anchor.start >= reg.contentStart && anchor.end <= reg.contentEnd) {
        var codes = previewEl.querySelectorAll('.mda-code-pre code, pre code');
        for (var c = 0; c < codes.length; c++) {
          var codeRange = findTextRangeInElementPlain(codes[c], quote);
          if (codeRange) return codeRange;
        }
      }
    }

    var line = anchorToLine(sourceText, anchor.start);
    var block = previewEl.querySelector('[data-line="' + line + '"]');
    if (!block) return null;

    var plain = anchorPlainQuote(sourceText, anchor);
    if (!plain) return null;

    var range = findTextRangeInElement(block, plain);
    if (range) return range;

    return findTextRangeInElement(previewEl, plain);
  }

  function validateAnchor(text, anchor) {
    return !!(
      anchor &&
      anchor.start >= 0 &&
      anchor.end <= text.length &&
      anchor.start < anchor.end
    );
  }

  function isAnchorStale(text, ann) {
    var anchor = ann && ann.anchor;
    if (!anchor || !anchor.quote) return false;
    if (!validateAnchor(text, anchor)) return true;
    return text.slice(anchor.start, anchor.end) !== anchor.quote;
  }

  function scrollEditorToAnchor(editorEl, anchor, syncFn) {
    if (!editorEl || !anchor) return;
    var LINE_H = 21;
    var line = anchorToLine(editorEl.value, anchor.start);
    editorEl.scrollTop = Math.max(0, (line - 1) * LINE_H - Math.floor(editorEl.clientHeight / 3));
    editorEl.setSelectionRange(anchor.start, anchor.end);

    var lineStart = editorEl.value.lastIndexOf('\n', anchor.start - 1) + 1;
    var before = editorEl.value.slice(lineStart, anchor.start);
    var matchText = editorEl.value.slice(anchor.start, anchor.end);
    var mirror = document.createElement('div');
    mirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;';
    var style = window.getComputedStyle(editorEl);
    mirror.style.font = style.font;
    mirror.style.tabSize = style.tabSize || '2';
    mirror.textContent = before;
    var xStart = mirror.offsetWidth;
    mirror.textContent = before + (matchText || ' ');
    var xEnd = mirror.offsetWidth;
    document.body.appendChild(mirror);
    document.body.removeChild(mirror);

    var cs = window.getComputedStyle(editorEl);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    var viewW = Math.max(0, editorEl.clientWidth - padL - padR);
    var margin = 48;
    var scrollLeft = editorEl.scrollLeft;
    if (xStart < scrollLeft + margin) scrollLeft = Math.max(0, xStart - margin);
    else if (xEnd > scrollLeft + viewW - margin) scrollLeft = Math.max(0, xEnd - viewW + margin);
    editorEl.scrollLeft = scrollLeft;
    if (syncFn) syncFn();
  }

  var api = {
    lineOffsetUtf16: lineOffsetUtf16,
    paragraphBounds: paragraphBounds,
    buildPlainTextMap: buildPlainTextMap,
    anchorToLine: anchorToLine,
    selectionFromEditor: selectionFromEditor,
    selectionFromPreview: selectionFromPreview,
    anchorToPreviewRange: anchorToPreviewRange,
    anchorPlainQuote: anchorPlainQuote,
    validateAnchor: validateAnchor,
    isAnchorStale: isAnchorStale,
    scrollEditorToAnchor: scrollEditorToAnchor,
    extractFenceContentRegions: extractFenceContentRegions,
    isForbiddenNode: isForbiddenNode,
    isSelectionUiChrome: isSelectionUiChrome,
    isFenceCodeNode: isFenceCodeNode,
  };

  global.MDASelectionAnchor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
