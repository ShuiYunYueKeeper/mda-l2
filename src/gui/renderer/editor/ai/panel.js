/**
 * AI 浮层面板（命令条 / 生成中 / 结果审阅 / 只读卡片 / 错误），挂在 document.body。
 * 只在状态切换时重建 innerHTML；流式输出只追加文本节点，避免输入框失焦。
 */
'use strict';

const REWRITE_ACTS = ['polish', 'expand', 'shorten', 'grammar'];
const READ_ACTS = ['explain', 'summarize'];
const STYLES = ['quick', 'formal', 'casual', 'literary', 'concise'];
const LANGS = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ t: (k: string, v?: object) => string, handlers: Record<string, Function> }} opts
 */
function createAiPanel(opts) {
  const t = opts.t;
  const h = opts.handlers;
  const el = document.createElement('div');
  el.className = 'mda-ai-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'AI');
  el.hidden = true;
  document.body.appendChild(el);

  /** @type {any} */
  let last = null;
  let streamNode = /** @type {HTMLElement|null} */ (null);

  function btn(act, label, extra) {
    const e = extra || {};
    return '<button type="button" class="mda-ai-btn' + (e.primary ? ' mda-ai-btn-primary' : '') + '"' +
      ' data-act="' + act + '"' + (e.disabled ? ' disabled' : '') +
      (e.title ? ' title="' + esc(e.title) + '"' : '') + '>' + esc(label) + '</button>';
  }

  function modelSelect(s) {
    const list = s.models || [];
    if (list.length < 2) return '';
    return '<label class="mda-ai-model"><span>' + esc(t('aiModelLabel')) + '</span>' +
      '<select data-role="model">' +
      list.map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === s.modelId ? ' selected' : '') + '>' + esc(m.label || m.id) + '</option>';
      }).join('') +
      '</select></label>';
  }

  function headHtml(s, title) {
    return '<div class="mda-ai-head">' +
      '<span class="mda-ai-badge">AI</span>' +
      '<span class="mda-ai-title">' + esc(title) + '</span>' +
      (s.scopeLabel ? '<span class="mda-ai-scope-label">' + esc(s.scopeLabel) + '</span>' : '') +
      '<span class="mda-ai-spacer"></span>' +
      modelSelect(s) +
      '<button type="button" class="mda-ai-close" data-act="close" aria-label="' + esc(t('aiClose')) + '" title="' + esc(t('aiClose')) + '">×</button>' +
    '</div>';
  }

  function inputHtml(s) {
    const gen = s.mode === 'generate';
    const widget = s.mode === 'widget';
    const chips = [];
    if (gen) {
      chips.push(btn('continue', t('aiAct_continue')));
    } else {
      REWRITE_ACTS.forEach(function (id) {
        chips.push(btn(id, t('aiAct_' + id), { disabled: widget, title: widget ? t('aiScopeWidget') : '' }));
        if (id === 'polish') {
          chips.push('<select data-role="style" class="mda-ai-select"' + (widget ? ' disabled' : '') + '>' +
            STYLES.map(function (st) {
              return '<option value="' + st + '"' + (st === s.style ? ' selected' : '') + '>' + esc(t('aiStyle_' + st)) + '</option>';
            }).join('') + '</select>');
        }
      });
      chips.push(btn('translate', t('aiAct_translate'), { disabled: widget, title: widget ? t('aiScopeWidget') : '' }));
      chips.push('<select data-role="lang" class="mda-ai-select"' + (widget ? ' disabled' : '') + '>' +
        LANGS.map(function (l) {
          return '<option value="' + l + '"' + (l === s.targetLang ? ' selected' : '') + '>' + esc(t('aiLang_' + l)) + '</option>';
        }).join('') + '</select>');
      chips.push('<span class="mda-ai-sep"></span>');
      READ_ACTS.forEach(function (id) { chips.push(btn(id, t('aiAct_' + id))); });
    }
    return headHtml(s, gen ? t('aiAct_write') : (widget ? t('aiAct_explain') : 'AI')) +
      '<div class="mda-ai-input-row">' +
        '<input type="text" class="mda-ai-input" data-role="instruction" spellcheck="false" autocomplete="off"' +
          (widget ? ' disabled' : '') +
          ' placeholder="' + esc(gen ? t('aiCmdPlaceholderGen') : t('aiCmdPlaceholder')) + '" />' +
      '</div>' +
      '<div class="mda-ai-chips">' + chips.join('') + '</div>';
  }

  function runningHtml(s) {
    return headHtml(s, s.actionLabel) +
      '<div class="mda-ai-status"><span class="mda-ai-spinner" aria-hidden="true"></span>' + esc(t('aiWorking')) + '</div>' +
      '<pre class="mda-ai-stream" data-role="stream"></pre>' +
      '<div class="mda-ai-foot">' + btn('stop', t('aiStop'), { primary: true }) + '</div>';
  }

  function versionsHtml(s) {
    if (!s.versions || s.versions.n < 2) return '';
    return '<span class="mda-ai-versions">' +
      '<button type="button" class="mda-ai-icon-btn" data-act="prev"' + (s.versions.i <= 1 ? ' disabled' : '') + '>‹</button>' +
      '<span>' + s.versions.i + '/' + s.versions.n + '</span>' +
      '<button type="button" class="mda-ai-icon-btn" data-act="next"' + (s.versions.i >= s.versions.n ? ' disabled' : '') + '>›</button>' +
    '</span>';
  }

  function bodyForResult(s) {
    if (s.diffOps) {
      return '<div class="mda-ai-result mda-ai-diff">' + s.diffOps.map(function (op) {
        if (op.op === 'eq') return esc(op.text);
        return '<span class="mda-ai-' + op.op + '">' + esc(op.text) + '</span>';
      }).join('') + '</div>';
    }
    return '<div class="mda-ai-result">' + esc(s.resultText || '') + '</div>';
  }

  function reviewHtml(s) {
    const notes = [];
    if (s.stale) notes.push('<div class="mda-ai-note is-warn">' + esc(t('aiStale')) + '</div>');
    if (s.note) notes.push('<div class="mda-ai-note">' + esc(s.note) + '</div>');
    return headHtml(s, s.actionLabel) +
      bodyForResult(s) +
      notes.join('') +
      '<div class="mda-ai-input-row">' +
        '<input type="text" class="mda-ai-input" data-role="refine" spellcheck="false" autocomplete="off" placeholder="' + esc(t('aiRefinePlaceholder')) + '" />' +
      '</div>' +
      '<div class="mda-ai-foot">' +
        btn('accept', t('aiAccept'), { primary: true, disabled: !s.canAccept, title: t('aiResultHint') }) +
        (s.canInsertBelow ? btn('insert-below', t('aiInsertBelow')) : '') +
        btn('retry', t('aiRetry')) +
        btn('discard', t('aiDiscard')) +
        versionsHtml(s) +
        '<span class="mda-ai-spacer"></span>' +
        '<span class="mda-ai-hint">' + esc(t('aiResultHint')) + '</span>' +
      '</div>';
  }

  function readHtml(s) {
    return headHtml(s, s.actionLabel) +
      '<div class="mda-ai-result mda-ai-read markdown-body">' + (s.readHtml || esc(s.resultText || '')) + '</div>' +
      (s.note ? '<div class="mda-ai-note">' + esc(s.note) + '</div>' : '') +
      '<div class="mda-ai-foot">' +
        btn('copy', t('aiCopy'), { primary: true }) +
        btn('insert-below', t('aiInsertBelow')) +
        (s.canAnnotate ? btn('to-anno', t('aiToAnno')) : '') +
        btn('retry', t('aiRetry')) +
        versionsHtml(s) +
        '<span class="mda-ai-spacer"></span>' +
        btn('close', t('aiClose')) +
      '</div>';
  }

  function errorHtml(s) {
    return headHtml(s, s.actionLabel || 'AI') +
      '<div class="mda-ai-note is-error">' + esc(s.errorText) + '</div>' +
      '<div class="mda-ai-foot">' +
        (s.needsSettings ? btn('settings', t('aiGateOpenSettings'), { primary: true }) : '') +
        (s.canRetry ? btn('retry', t('aiRetry'), { primary: !s.needsSettings }) : '') +
        '<span class="mda-ai-spacer"></span>' +
        btn('close', t('aiClose')) +
      '</div>';
  }

  function render(s) {
    last = s;
    streamNode = null;
    if (!s) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.setAttribute('data-status', s.status);
    let html = '';
    if (s.status === 'input') html = inputHtml(s);
    else if (s.status === 'running') html = runningHtml(s);
    else if (s.status === 'review') html = reviewHtml(s);
    else if (s.status === 'read') html = readHtml(s);
    else html = errorHtml(s);
    el.innerHTML = html;
    if (s.status === 'running') {
      streamNode = el.querySelector('[data-role="stream"]');
      if (streamNode && s.streamText) streamNode.textContent = s.streamText;
    }
  }

  function appendStream(text) {
    if (!streamNode || !text) return;
    streamNode.textContent += text;
    streamNode.scrollTop = streamNode.scrollHeight;
  }

  function focusInput() {
    const inp = /** @type {HTMLInputElement|null} */ (
      el.querySelector('[data-role="instruction"]:not([disabled]), [data-role="refine"]')
    );
    if (inp) {
      inp.focus();
      return true;
    }
    const first = /** @type {HTMLElement|null} */ (el.querySelector('.mda-ai-btn-primary:not([disabled]), .mda-ai-btn:not([disabled])'));
    if (first) first.focus();
    return !!first;
  }

  function readParams() {
    const style = /** @type {HTMLSelectElement|null} */ (el.querySelector('[data-role="style"]'));
    const lang = /** @type {HTMLSelectElement|null} */ (el.querySelector('[data-role="lang"]'));
    return {
      style: style ? style.value : 'quick',
      targetLang: lang ? lang.value : 'en',
    };
  }

  el.addEventListener('mousedown', function (e) {
    // 面板内点击不得冒泡到文档级监听（表格 onDocPointer / 右键快照等会把它当成「表外点击」）
    e.stopPropagation();
  });

  el.addEventListener('click', function (e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const b = target && target.closest ? /** @type {HTMLButtonElement|null} */ (target.closest('[data-act]')) : null;
    if (!b || b.disabled) return;
    const act = b.getAttribute('data-act');
    if (!act) return;
    e.preventDefault();
    const params = readParams();
    if (act === 'close') h.onClose();
    else if (act === 'stop') h.onStop();
    else if (act === 'accept') h.onAccept();
    else if (act === 'insert-below') h.onInsertBelow();
    else if (act === 'retry') h.onRetry();
    else if (act === 'discard') h.onClose();
    else if (act === 'prev') h.onVersion(-1);
    else if (act === 'next') h.onVersion(1);
    else if (act === 'copy') h.onCopy();
    else if (act === 'to-anno') h.onToAnno();
    else if (act === 'settings') h.onOpenSettings();
    else h.onAction(act, params);
  });

  el.addEventListener('change', function (e) {
    const target = /** @type {HTMLSelectElement} */ (e.target);
    if (target && target.getAttribute('data-role') === 'model') h.onModelChange(target.value);
  });

  el.addEventListener('keydown', function (e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const role = target && target.getAttribute ? target.getAttribute('data-role') : '';
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (last && last.status === 'running') h.onStop();
      else h.onClose();
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      h.onAccept();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (role === 'instruction' || role === 'refine')) {
      e.preventDefault();
      e.stopPropagation();
      const value = String(/** @type {HTMLInputElement} */ (target).value || '').trim();
      if (role === 'instruction') h.onSubmit(value, readParams());
      else if (value) h.onRefine(value);
    }
  });

  return {
    el: el,
    render: render,
    appendStream: appendStream,
    focusInput: focusInput,
    isOpen: function () { return !el.hidden; },
    contains: function (node) { return !!node && el.contains(node); },
    destroy: function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

module.exports = { createAiPanel, REWRITE_ACTS, READ_ACTS, STYLES, LANGS };
