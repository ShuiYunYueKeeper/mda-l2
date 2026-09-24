/**
 * 自动 URL → Markdown 链接（纯函数，无 EditorView）。
 *
 * - www.* + 收尾符 → [www…](https://www…)
 * - http(s):// 后再输入至少一字 → [url](url)，并可随输入同步扩展
 */
'use strict';

/** URL token 允许的字符（不含收尾符；排除 []() 以免扫进已有 Markdown 链接） */
const URL_TOKEN_RE = /[A-Za-z0-9\-._~:/?#@!$&'*+,;=%]/;

/** www 收尾触发符（本身不进入 token） */
const WWW_TERMINATORS = /[\s,;!?）\]、。；！？\t]/;

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isUrlTokenChar(ch) {
  return ch.length === 1 && URL_TOKEN_RE.test(ch);
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isWwwTerminator(ch) {
  return ch.length === 1 && WWW_TERMINATORS.test(ch);
}

/**
 * 从 pos 向左取连续 URL 安全字符游程（不含 pos 本身若不是 URL 字符）。
 * @param {string} text
 * @param {number} pos 光标位置（token 右端，通常为刚输入后的 head）
 * @returns {{ from: number, to: number, token: string } | null}
 */
function findUrlTokenBefore(text, pos) {
  const s = String(text || '');
  let end = Math.max(0, Math.min(pos | 0, s.length));
  // 若 pos 落在收尾符上，token 止于其前
  if (end > 0 && isWwwTerminator(s.charAt(end - 1)) && !isUrlTokenChar(s.charAt(end - 1))) {
    end -= 1;
  }
  let start = end;
  while (start > 0 && isUrlTokenChar(s.charAt(start - 1))) {
    start -= 1;
  }
  if (start >= end) return null;
  return { from: start, to: end, token: s.slice(start, end) };
}

/**
 * @param {string} token
 * @returns {{ kind: 'scheme' | 'www', text: string, href: string } | null}
 */
function classifyUrlToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith('https://')) {
    // 协议后再至少一字
    if (raw.length <= 'https://'.length) return null;
    return { kind: 'scheme', text: raw, href: raw };
  }
  if (lower.startsWith('http://')) {
    if (raw.length <= 'http://'.length) return null;
    return { kind: 'scheme', text: raw, href: raw };
  }
  // www. 且至少 www.x
  if (/^www\.[^\s/]+/i.test(raw)) {
    return { kind: 'www', text: raw, href: 'https://' + raw };
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} href
 * @returns {string}
 */
function wrapMarkdownLink(text, href) {
  return '[' + text + '](' + href + ')';
}

/**
 * 将 [from,to) 的裸 token 换成 Markdown 链接。
 * @param {number} tokenFrom
 * @param {number} tokenTo
 * @param {{ text: string, href: string }} classified
 * @param {{ caret?: 'textEnd' | 'afterLink' }} [opts]
 * @returns {{ from: number, to: number, insert: string, caret: number }}
 */
function planAutoLinkWrap(tokenFrom, tokenTo, classified, opts) {
  const insert = wrapMarkdownLink(classified.text, classified.href);
  const mode = opts && opts.caret === 'afterLink' ? 'afterLink' : 'textEnd';
  const caret =
    mode === 'afterLink'
      ? tokenFrom + insert.length
      : tokenFrom + 1 + classified.text.length; // after '[' + text
  return { from: tokenFrom, to: tokenTo, insert: insert, caret: caret };
}

/**
 * 若换行被插进 `[text]\n](href)`，规划为把换行挪到整段链接之后。
 * @param {string} doc
 * @param {number} nlPos 换行字符所在位置
 * @returns {{ from: number, to: number, insert: string, caret: number } | null}
 */
function planRepairNewlineInsideLink(doc, nlPos) {
  const s = String(doc || '');
  if (nlPos < 0 || nlPos >= s.length || s.charAt(nlPos) !== '\n') return null;
  // 向前找未转义的 '['
  let open = -1;
  for (let i = nlPos - 1; i >= 0; i--) {
    if (s.charAt(i) === '\n') break;
    if (s.charAt(i) === '[') {
      open = i;
      break;
    }
  }
  if (open < 0) return null;
  // 换行后应为 `](href)`
  const after = s.slice(nlPos + 1);
  const m = /^\]\(([^)]*)\)/.exec(after);
  if (!m) return null;
  const text = s.slice(open + 1, nlPos);
  const href = m[1];
  const linkEnd = nlPos + 1 + m[0].length;
  const insert = wrapMarkdownLink(text, href) + '\n';
  return {
    from: open,
    to: linkEnd,
    insert: insert,
    caret: open + insert.length,
  };
}

/**
 * 解析已是 `[text](href)` 且覆盖 [from,to) 的链接（简单非嵌套）。
 * @param {string} doc
 * @param {number} from
 * @param {number} to
 * @returns {{ text: string, href: string, textFrom: number, textTo: number, hrefFrom: number, hrefTo: number } | null}
 */
function parseSimpleMarkdownLink(doc, from, to) {
  const slice = String(doc || '').slice(from, to);
  const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(slice);
  if (!m) return null;
  const text = m[1];
  const href = m[2];
  const textFrom = from + 1;
  const textTo = textFrom + text.length;
  const hrefFrom = textTo + 2; // ](
  const hrefTo = hrefFrom + href.length;
  return {
    text: text,
    href: href,
    textFrom: textFrom,
    textTo: textTo,
    hrefFrom: hrefFrom,
    hrefTo: hrefTo,
  };
}

/**
 * 判断是否为「自动链」：scheme 时 text===href；www 时 href==='https://'+text。
 * @param {string} text
 * @param {string} href
 * @returns {boolean}
 */
function isAutoLinkedPair(text, href) {
  if (!text || !href) return false;
  if (text === href) {
    const lower = text.toLowerCase();
    return lower.startsWith('https://') || lower.startsWith('http://');
  }
  return href === 'https://' + text && /^www\./i.test(text);
}

/**
 * 自动链随输入扩展：整段重写 [newText](newHref)，caret 在文本末。
 * @param {number} linkFrom 整段 `[...](...)` 起点
 * @param {number} linkTo
 * @param {string} newText
 * @param {string} newHref
 * @returns {{ from: number, to: number, insert: string, caret: number }}
 */
function planGrowAutoLink(linkFrom, linkTo, newText, newHref) {
  const insert = wrapMarkdownLink(newText, newHref);
  const caret = linkFrom + 1 + newText.length;
  return { from: linkFrom, to: linkTo, insert: insert, caret: caret };
}

/**
 * 粘贴纯文本：整段 trim 后若是单一 URL/www，返回包装串；否则 null。
 * @param {string} pasted
 * @returns {string | null}
 */
function planPasteAutoLink(pasted) {
  const raw = String(pasted == null ? '' : pasted);
  // 允许多行两侧空白，但中间不得有换行（否则不是「单一 URL」）
  if (/[\r\n]/.test(raw.trim() ? raw.replace(/^\s+|\s+$/g, '') : '')) {
    const inner = raw.replace(/^\s+|\s+$/g, '');
    if (/[\r\n]/.test(inner)) return null;
  }
  const token = raw.replace(/^\s+|\s+$/g, '');
  if (!token || /\s/.test(token)) return null;
  const classified = classifyUrlToken(token);
  if (!classified) return null;
  // 粘贴 www 不要求收尾符，直接包装；scheme 只要长于协议即可
  return wrapMarkdownLink(classified.text, classified.href);
}

/**
 * 在光标处根据上下文规划一次自动链（裸 token → wrap）。
 * @param {string} docText
 * @param {number} head 当前光标
 * @param {{ justInsertedTerminator?: boolean, justExtendedScheme?: boolean }} [opts]
 * @returns {{ from: number, to: number, insert: string, caret: number } | null}
 */
function planAutoLinkAtHead(docText, head, opts) {
  opts = opts || {};
  const found = findUrlTokenBefore(docText, head);
  if (!found) return null;
  const classified = classifyUrlToken(found.token);
  if (!classified) return null;

  if (classified.kind === 'scheme') {
    // 协议后再至少一字即包装（由 classify 保证）
    if (!opts.justExtendedScheme && !opts.force) {
      // 调用方可要求仅在「刚扩展」时触发；默认允许
    }
    return planAutoLinkWrap(found.from, found.to, classified);
  }

  // www：需要收尾符刚插入，或 force（粘贴）
  if (classified.kind === 'www') {
    if (opts.force) {
      return planAutoLinkWrap(found.from, found.to, classified);
    }
    if (!opts.justInsertedTerminator) return null;
    // head 应在收尾符之后；token 不含收尾符
    if (head > 0 && isWwwTerminator(docText.charAt(head - 1))) {
      return planAutoLinkWrap(found.from, found.to, classified);
    }
    return null;
  }
  return null;
}

/**
 * 打开前规范化：www. 补 https://；已有协议则原样。
 * @param {string} href
 * @returns {string}
 */
function normalizeExternalHref(href) {
  const h = String(href == null ? '' : href).trim();
  if (!h) return h;
  if (/^(https?:|mailto:|file:|tel:)/i.test(h)) return h;
  if (/^\/\//.test(h)) return 'https:' + h;
  if (/^www\./i.test(h)) return 'https://' + h;
  return h;
}

module.exports = {
  isUrlTokenChar: isUrlTokenChar,
  isWwwTerminator: isWwwTerminator,
  findUrlTokenBefore: findUrlTokenBefore,
  classifyUrlToken: classifyUrlToken,
  wrapMarkdownLink: wrapMarkdownLink,
  planAutoLinkWrap: planAutoLinkWrap,
  parseSimpleMarkdownLink: parseSimpleMarkdownLink,
  isAutoLinkedPair: isAutoLinkedPair,
  planGrowAutoLink: planGrowAutoLink,
  planPasteAutoLink: planPasteAutoLink,
  planAutoLinkAtHead: planAutoLinkAtHead,
  normalizeExternalHref: normalizeExternalHref,
  planRepairNewlineInsideLink: planRepairNewlineInsideLink,
};
