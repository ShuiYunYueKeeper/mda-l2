/**
 * AI 控制器：入口分发 → 门禁 → 作用范围 → 请求（main 流式回传）→ 审阅 → 采纳写入。
 * 同一时刻只保留一个 AI 会话（命令条 / 结果 / 卡片共用一个浮层）；新入口会先取消旧会话。
 */
'use strict';

const { resolveAiScope, buildAiPayload, stripAnnoInRange, annoRanges, LIMITS } = require('./model/ai-context');
const { cleanAiOutput } = require('./model/ai-output');
const { diffText } = require('./model/ai-diff');
const { planReplace, planInsertAfter, planInsertAtCursor } = require('./model/ai-apply');
const { describeAiFailure, failureNeedsSettings } = require('./errors');
const {
  aiApplyAnnotation,
  setAiSession,
  clearAiSession,
  aiSessionField,
} = require('./state');
const { createAiPanel } = require('./panel');

const ACTION_KIND = {
  continue: 'generate',
  write: 'generate',
  polish: 'rewrite',
  expand: 'rewrite',
  shorten: 'rewrite',
  grammar: 'rewrite',
  translate: 'rewrite',
  custom: 'rewrite',
  explain: 'read',
  summarize: 'read',
};

/** 超过这个总长就不做词级 diff，直接展示结果（LCS 在长文上既慢又难读） */
const DIFF_MAX_CHARS = 4000;
const PANEL_GAP = 6;
const PANEL_MARGIN = 8;
const PANEL_MAX_WIDTH = 760;

let requestSeq = 0;
function newRequestId() {
  requestSeq += 1;
  return 'r' + Date.now().toString(36) + requestSeq.toString(36) + Math.random().toString(36).slice(2, 6);
}

function lineEndAt(text, pos) {
  const nl = text.indexOf('\n', pos);
  return nl < 0 ? text.length : nl;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {{
 *   api: any,
 *   t: (k: string, v?: object) => string,
 *   toast?: (msg: string) => void,
 *   confirm?: (msg: string) => Promise<boolean>,
 *   openSettings?: () => void,
 *   getFileName?: () => string,
 *   renderMarkdown?: (text: string) => { success: boolean, html?: string },
 *   canAnnotate?: () => boolean,
 *   copyText?: (text: string) => void,
 *   onAiToAnnotation?: (req: { content: string, line: number, anchor: { start: number, end: number, quote: string } | null }) => void,
 * }} opts
 */
function createAiController(view, opts) {
  const api = opts.api;
  const t = opts.t;
  const toast = opts.toast || function () {};

  /** @type {any} */
  let s = null;
  let posRaf = 0;
  /** @type {{ models: {id:string,label?:string}[], defaultModelId: string, prefs: any } | null} */
  let settings = null;

  const panel = createAiPanel({
    t: t,
    handlers: {
      onClose: function () { close(); },
      onStop: function () { stop(); },
      onAccept: function () { accept(); },
      onInsertBelow: function () { insertBelow(); },
      onRetry: function () { retry(); },
      onVersion: function (d) { switchVersion(d); },
      onCopy: function () { copyResult(); },
      onToAnno: function () { toAnnotation(); },
      onOpenSettings: function () {
        close();
        if (typeof opts.openSettings === 'function') opts.openSettings();
      },
      onModelChange: function (id) { if (s) s.modelId = id; },
      onAction: function (id, params) { runFromBar(id, params, ''); },
      onSubmit: function (instruction, params) { submitBar(instruction, params); },
      onRefine: function (instruction) { refine(instruction); },
    },
  });

  const unsubscribe = typeof api.onAiEvent === 'function' ? api.onAiEvent(onEvent) : null;
  const onWinChange = function () { schedulePosition(); };
  window.addEventListener('scroll', onWinChange, true);
  window.addEventListener('resize', onWinChange);

  function field() {
    return view.state.field(aiSessionField, false) || null;
  }

  // ---------- 门禁 / 设置 ----------

  function checkGate() {
    if (typeof api.checkAiAccess !== 'function') return Promise.resolve({ allowed: false, reason: 'upgrade' });
    return Promise.resolve(api.checkAiAccess()).then(function (r) {
      if (r && r.success && r.value) return r.value;
      return { allowed: false, reason: 'upgrade' };
    }).catch(function () { return { allowed: false, reason: 'upgrade' }; });
  }

  function loadSettings() {
    if (typeof api.getAiSettings !== 'function') return Promise.resolve();
    return Promise.resolve(api.getAiSettings()).then(function (r) {
      const v = r && r.success && r.value ? r.value : {};
      settings = {
        models: (v.models || []).filter(function (m) { return m && m.enabled; }),
        defaultModelId: v.defaultModelId || '',
        prefs: v.prefs || {},
      };
    }).catch(function () { settings = null; });
  }

  // ---------- 会话 ----------

  /**
   * @param {{ from: number, to: number, inline?: boolean, source?: string, scopeText?: string }} scope
   * @param {string} uiMode  'rewrite' | 'generate' | 'widget' | 'doc'
   */
  function openSession(scope, uiMode) {
    close();
    s = {
      id: newRequestId(),
      scope: scope,
      uiMode: uiMode,
      status: 'input',
      action: '',
      kind: '',
      params: { style: 'quick', targetLang: 'en', instruction: '' },
      modelId: settings && settings.defaultModelId ? settings.defaultModelId : '',
      versions: [],
      vi: -1,
      streamText: '',
      requestId: '',
      original: '',
      note: '',
      failure: null,
      stale: false,
    };
    view.dispatch({
      effects: setAiSession.of({
        id: s.id,
        from: scope.from,
        to: scope.to,
        guard: false,
        highlight: uiMode !== 'generate' && uiMode !== 'doc' && scope.from < scope.to,
      }),
    });
  }

  function close() {
    if (!s) return;
    const old = s;
    s = null;
    if (old.status === 'running' && old.requestId && typeof api.aiCancel === 'function') api.aiCancel(old.requestId);
    panel.render(null);
    if (!view.destroyed && field()) view.dispatch({ effects: clearAiSession.of(old.id) });
  }

  function stop() {
    if (!s || s.status !== 'running') return;
    if (typeof api.aiCancel === 'function') api.aiCancel(s.requestId);
  }

  // ---------- 入口 ----------

  function scopeFailureText(reason) {
    if (reason === 'widget') return t('aiScopeWidget');
    if (reason === 'anno-only') return t('aiScopeAnnoOnly');
    return t('aiScopeEmpty');
  }

  function currentSel(range) {
    if (range) return { from: range.from, to: range.to };
    const m = view.state.selection.main;
    return { from: m.from, to: m.to };
  }

  function generateScope(text, pos) {
    return resolveAiScope(text, { from: pos, to: pos }, 'generate');
  }

  /**
   * 命令条：有可改写范围 → 改写模式；块内容 → 仅解释；空行 / 无范围 → 生成模式。
   * @param {{ generate?: boolean, range?: { from: number, to: number } }} [o]
   */
  function openCommandBar(o) {
    const opt = o || {};
    if (s && s.status === 'input') {
      panel.focusInput();
      return;
    }
    const text = view.state.doc.toString();
    const sel = currentSel(opt.range);
    let scope;
    let mode;
    if (opt.generate) {
      scope = generateScope(text, sel.to);
      mode = 'generate';
    } else {
      const r = resolveAiScope(text, sel, 'rewrite');
      if (r.ok) {
        scope = r;
        mode = 'rewrite';
      } else if (r.reason === 'widget') {
        const rr = resolveAiScope(text, sel, 'read');
        if (!rr.ok) { toast(scopeFailureText(rr.reason)); return; }
        scope = rr;
        mode = 'widget';
      } else if (r.reason === 'empty') {
        scope = generateScope(text, sel.to);
        mode = 'generate';
      } else {
        toast(scopeFailureText(r.reason));
        return;
      }
    }
    withGate(scope, mode, function () {
      render();
      panel.focusInput();
    });
  }

  /**
   * 门禁不过：同样在范围处打开面板，显示原因 + 「打开设置」，不发请求。
   */
  function withGate(scope, mode, next) {
    checkGate().then(function (g) {
      return loadSettings().then(function () { return g; });
    }).then(function (g) {
      if (view.destroyed) return;
      openSession(scope, mode);
      if (!g.allowed) {
        showFailure({ gate: g.reason });
        return;
      }
      next();
    });
  }

  /**
   * 直接执行某个动作（菜单 / 快捷键 / 块手柄 / 右键）。
   * @param {string} action
   * @param {object} [params]
   * @param {{ from: number, to: number }} [range]
   */
  function runDirect(action, params, range) {
    const kind = ACTION_KIND[action];
    if (!kind) return;
    const text = view.state.doc.toString();
    const sel = currentSel(range);
    let scope;
    let mode = kind === 'generate' ? 'generate' : 'rewrite';
    if (kind === 'generate') {
      const pos = range ? lineEndAt(text, Math.max(range.from, range.to - 1)) : sel.to;
      scope = generateScope(text, pos);
    } else if (action === 'summarize' && sel.from === sel.to && !range) {
      const scopeText = stripAnnoInRange(text, 0, text.length, annoRanges(text));
      if (!scopeText.trim()) { toast(t('aiScopeEmpty')); return; }
      scope = { ok: true, from: 0, to: text.length, inline: false, source: 'doc', scopeText: scopeText, hasAnno: false };
      mode = 'doc';
    } else {
      const r = resolveAiScope(text, sel, kind);
      if (!r.ok) { toast(scopeFailureText(r.reason)); return; }
      scope = r;
      if (kind === 'read' && !resolveAiScope(text, sel, 'rewrite').ok) mode = 'widget';
    }
    withGate(scope, mode, function () {
      start(action, Object.assign({}, s.params, params || {}), []);
    });
  }

  function runFromBar(action, params, instruction) {
    if (!s || s.status !== 'input') return;
    if (s.uiMode === 'widget' && ACTION_KIND[action] !== 'read') return;
    start(action, Object.assign({}, s.params, params || {}, { instruction: instruction }), []);
  }

  function submitBar(instruction, params) {
    if (!s || s.status !== 'input') return;
    if (s.uiMode === 'generate') {
      if (instruction) runFromBar('write', params, instruction);
      else runFromBar('continue', params, '');
      return;
    }
    if (s.uiMode === 'widget') {
      runFromBar('explain', params, '');
      return;
    }
    if (!instruction) return;
    runFromBar('custom', params, instruction);
  }

  // ---------- 请求 ----------

  function start(action, params, history) {
    if (!s) return;
    const kind = ACTION_KIND[action];
    const range = field();
    if (!range || range.id !== s.id) { close(); return; }
    const text = view.state.doc.toString();
    const scope = Object.assign({}, s.scope, { from: range.from, to: range.to });
    if (kind !== 'generate') {
      scope.scopeText = stripAnnoInRange(text, scope.from, scope.to, annoRanges(text));
      // 改写结果会整体覆盖范围：发给模型的若被截断，采纳就会丢掉截断外的原文
      if (kind === 'rewrite' && scope.scopeText.length > LIMITS.scope) {
        s.action = action;
        showFailure({ code: 'E_CONTEXT' }, { noRetry: true });
        return;
      }
    }
    s.scope = scope;
    s.action = action;
    s.kind = kind;
    s.params = params;
    s.original = kind === 'rewrite' ? scope.scopeText : '';
    const payload = Object.assign(
      buildAiPayload(text, scope, kind, { fileName: typeof opts.getFileName === 'function' ? opts.getFileName() : '' }),
      {
        style: params.style,
        targetLang: params.targetLang,
        instruction: params.instruction || '',
        history: history || [],
      }
    );
    const sendChars = kind === 'generate'
      ? (payload.before || '').length + (payload.after || '').length
      : (payload.scope || '').length;
    const limit = settings && settings.prefs && settings.prefs.longTextConfirmChars;
    const confirmP = limit && sendChars > limit && typeof opts.confirm === 'function'
      ? Promise.resolve(opts.confirm(t('aiLongConfirm', { n: sendChars })))
      : Promise.resolve(true);
    const sid = s.id;
    confirmP.then(function (ok) {
      if (!s || s.id !== sid) return;
      if (!ok) {
        if (s.versions.length) render();
        else close();
        return;
      }
      send(action, payload);
    });
  }

  function send(action, payload) {
    const requestId = newRequestId();
    const range = field();
    s.requestId = requestId;
    s.status = 'running';
    s.streamText = '';
    s.failure = null;
    s.note = '';
    if (range) {
      view.dispatch({
        effects: setAiSession.of({
          id: s.id,
          from: range.from,
          to: range.to,
          guard: s.kind === 'rewrite',
          highlight: s.kind !== 'generate' && s.uiMode !== 'doc' && range.from < range.to,
        }),
      });
    }
    s.stale = false;
    render();
    Promise.resolve(api.aiRun({
      requestId: requestId,
      action: action,
      payload: payload,
      modelId: s.modelId || undefined,
    })).then(function (r) {
      if (!s || s.requestId !== requestId) {
        if (typeof api.aiCancel === 'function') api.aiCancel(requestId);
        return;
      }
      if (!r || !r.success) showFailure(r || null);
    }).catch(function () {
      if (s && s.requestId === requestId) showFailure(null);
    });
  }

  function onEvent(ev) {
    if (!s || !ev || ev.requestId !== s.requestId || s.status !== 'running') return;
    if (ev.type === 'chunk') {
      s.streamText += ev.text || '';
      panel.appendStream(ev.text || '');
      schedulePosition();
    } else if (ev.type === 'done') {
      finish(ev.text || s.streamText, '');
    } else if (ev.type === 'canceled') {
      const partial = ev.text || s.streamText;
      if (partial && partial.trim()) finish(partial, t('aiCanceledPartial'));
      else if (s.versions.length) { s.status = s.kind === 'read' ? 'read' : 'review'; render(); }
      else close();
    } else if (ev.type === 'error') {
      showFailure({ code: ev.code, detail: ev.detail });
    }
  }

  function finish(raw, note) {
    const c = cleanAiOutput(raw, {
      inline: s.kind === 'rewrite' && !!s.scope.inline,
      original: s.original,
    });
    if (!c.text.trim()) {
      showFailure({ code: 'E_EMPTY' });
      return;
    }
    s.versions.push({ text: c.text, action: s.action, params: s.params, original: s.original, kind: s.kind });
    s.vi = s.versions.length - 1;
    s.note = note || (c.strippedAnno ? t('aiStrippedAnno') : '');
    s.status = s.kind === 'read' ? 'read' : 'review';
    const focusWasInPanel = panel.contains(document.activeElement) || document.activeElement === document.body;
    render();
    // 生成期间用户可能在正文里继续打字，此时不抢焦点
    if (focusWasInPanel) panel.focusInput();
  }

  function showFailure(r, o) {
    if (!s) return;
    s.status = 'error';
    s.failure = r;
    s.failureOpts = o || {};
    render();
  }

  function retry() {
    if (!s) return;
    if (!s.action) {
      // 门禁失败后重试：重新走门禁
      const scope = s.scope;
      const mode = s.uiMode;
      withGate(scope, mode, function () { render(); panel.focusInput(); });
      return;
    }
    start(s.action, s.params, []);
  }

  function refine(instruction) {
    if (!s || (s.status !== 'review' && s.status !== 'read')) return;
    const cur = s.versions[s.vi];
    if (!cur) return;
    start(s.action, s.params, [{ output: cur.text, instruction: instruction }]);
  }

  function switchVersion(d) {
    if (!s || !s.versions.length) return;
    s.vi = Math.max(0, Math.min(s.versions.length - 1, s.vi + d));
    render();
  }

  // ---------- 采纳 ----------

  function currentText() {
    const v = s && s.versions[s.vi];
    return v ? v.text : '';
  }

  function applyPlan(plan) {
    view.dispatch({
      changes: plan.changes,
      selection: { anchor: plan.cursor },
      userEvent: 'ai.apply',
      annotations: aiApplyAnnotation.of(true),
      scrollIntoView: true,
    });
    close();
    toast(t('aiAccepted'));
    view.focus();
  }

  function accept() {
    if (!s || s.status !== 'review') return false;
    const range = field();
    if (!range) { close(); return true; }
    const text = currentText();
    const doc = view.state.doc.toString();
    if (s.kind === 'generate') {
      applyPlan(planInsertAtCursor(doc, range.from, text));
      return true;
    }
    if (s.stale) {
      toast(t('aiStale'));
      return true;
    }
    const plan = planReplace(doc, { from: range.from, to: range.to }, text);
    if (!plan.ok) {
      s.note = t('aiAnnoSplit');
      render();
      return true;
    }
    applyPlan(plan);
    return true;
  }

  function insertBelow() {
    if (!s || (s.status !== 'review' && s.status !== 'read')) return;
    const range = field();
    if (!range) { close(); return; }
    const doc = view.state.doc.toString();
    applyPlan(planInsertAfter(doc, { from: range.from, to: range.to }, currentText()));
  }

  function copyResult() {
    const text = currentText();
    if (!text) return;
    if (typeof opts.copyText === 'function') opts.copyText(text);
    toast(t('aiCopied'));
  }

  /** 解释卡「转为批注」：只预填对话框，写入仍走 core writer（AGENTS §8.5） */
  function toAnnotation() {
    if (!s || s.status !== 'read' || typeof opts.onAiToAnnotation !== 'function') return;
    if (typeof opts.canAnnotate === 'function' && !opts.canAnnotate()) {
      toast(t('aiToAnnoNeedFile'));
      return;
    }
    const range = field();
    if (!range) return;
    const doc = view.state.doc.toString();
    const line = view.state.doc.lineAt(range.from).number;
    const anchor = s.scope.inline && range.from < range.to
      ? { start: range.from, end: range.to, quote: doc.slice(range.from, range.to) }
      : null;
    const content = currentText();
    close();
    opts.onAiToAnnotation({ content: content, line: line, anchor: anchor });
  }

  // ---------- 键盘 / 视图同步 ----------

  function onEscape() {
    if (!s) return false;
    if (s.status === 'running') stop();
    else close();
    return true;
  }

  function onAccept() {
    return accept();
  }

  function onViewUpdate(update) {
    if (!s) return;
    const f = update.state.field(aiSessionField, false);
    if (!f || f.id !== s.id) {
      // setState 换文档 / 外部清空：会话失去锚点，静默结束
      const old = s;
      s = null;
      if (old.status === 'running' && typeof api.aiCancel === 'function') api.aiCancel(old.requestId);
      panel.render(null);
      return;
    }
    if (f.stale && !s.stale) {
      s.stale = true;
      if (s.status === 'review') render();
    }
    if (update.docChanged || update.geometryChanged || update.viewportChanged) schedulePosition();
  }

  function schedulePosition() {
    if (!s || posRaf) return;
    posRaf = requestAnimationFrame(function () {
      posRaf = 0;
      position();
    });
  }

  /** 用高度图定位（lineBlockAt 在大块 widget 下方仍可靠，coordsAtPos 不行，见 AGENTS §4l3） */
  function position() {
    if (!s || !panel.isOpen() || view.destroyed) return;
    const f = field();
    if (!f) return;
    const content = view.contentDOM.getBoundingClientRect();
    const anchorPos = Math.min(f.to, view.state.doc.length);
    const blk = view.lineBlockAt(anchorPos);
    const bottom = view.documentTop + blk.bottom;
    const width = Math.min(PANEL_MAX_WIDTH, Math.max(320, content.width));
    const left = Math.max(PANEL_MARGIN, Math.min(content.left, window.innerWidth - width - PANEL_MARGIN));
    const h = panel.el.offsetHeight || 0;
    const top = Math.max(PANEL_MARGIN, Math.min(bottom + PANEL_GAP, window.innerHeight - h - PANEL_MARGIN));
    panel.el.style.left = Math.round(left) + 'px';
    panel.el.style.top = Math.round(top) + 'px';
    panel.el.style.width = Math.round(width) + 'px';
  }

  // ---------- 渲染 ----------

  function scopeLabel() {
    if (!s) return '';
    const sc = s.scope;
    if (s.uiMode === 'generate') return t('aiCmdScopeCursor');
    if (s.uiMode === 'doc') return '';
    const n = (sc.scopeText || '').length;
    return sc.source === 'selection' ? t('aiCmdScopeSel', { n: n }) : t('aiCmdScopeBlock', { n: n });
  }

  function viewModel() {
    const vm = {
      status: s.status,
      mode: s.uiMode,
      scopeLabel: scopeLabel(),
      models: settings ? settings.models : [],
      modelId: s.modelId,
      style: s.params.style,
      targetLang: s.params.targetLang,
      actionLabel: s.action ? t('aiAct_' + s.action) : 'AI',
      streamText: s.streamText,
      note: s.note,
      stale: false,
      versions: { i: s.vi + 1, n: s.versions.length },
    };
    const ver = s.versions[s.vi];
    if (s.status === 'review' && ver) {
      if (ver.kind === 'rewrite') {
        if (ver.original.length + ver.text.length <= DIFF_MAX_CHARS) vm.diffOps = diffText(ver.original, ver.text);
        else vm.resultText = ver.text;
        vm.stale = s.stale;
        vm.canAccept = !s.stale;
        vm.canInsertBelow = true;
      } else {
        vm.resultText = ver.text;
        vm.canAccept = true;
        vm.canInsertBelow = false;
      }
    } else if (s.status === 'read' && ver) {
      vm.resultText = ver.text;
      if (typeof opts.renderMarkdown === 'function') {
        try {
          const r = opts.renderMarkdown(ver.text);
          if (r && r.success && r.html) vm.readHtml = r.html;
        } catch (_) { /* 退回纯文本 */ }
      }
      vm.canAnnotate = typeof opts.onAiToAnnotation === 'function';
    } else if (s.status === 'error') {
      vm.errorText = describeAiFailure(s.failure, t);
      vm.needsSettings = failureNeedsSettings(s.failure);
      vm.canRetry = !(s.failureOpts && s.failureOpts.noRetry) && !(s.failure && s.failure.gate);
    }
    return vm;
  }

  function render() {
    if (!s) { panel.render(null); return; }
    panel.render(viewModel());
    position();
    schedulePosition();
  }

  return {
    command: function (action) {
      if (action === 'command-bar') openCommandBar();
      else runDirect(action, action === 'polish' ? { style: 'quick' } : null);
    },
    openCommandBar: openCommandBar,
    runDirect: runDirect,
    /** 块手柄：以整块为范围；「更多」打开命令条 */
    runBlockAction: function (id, block) {
      const range = block && typeof block.from === 'number' ? { from: block.from, to: block.to } : null;
      if (id === 'more') openCommandBar({ range: range || undefined });
      else runDirect(id, id === 'polish' ? { style: 'quick' } : null, range || undefined);
    },
    isOpen: function () { return !!s; },
    onEscape: onEscape,
    onAccept: onAccept,
    onViewUpdate: onViewUpdate,
    close: close,
    destroy: function () {
      close();
      if (posRaf) cancelAnimationFrame(posRaf);
      window.removeEventListener('scroll', onWinChange, true);
      window.removeEventListener('resize', onWinChange);
      if (typeof unsubscribe === 'function') unsubscribe();
      panel.destroy();
    },
  };
}

module.exports = { createAiController, ACTION_KIND };
