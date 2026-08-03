/**
 * 块手柄菜单动作：复制 / 剪切 / 删除 / 插入；AI 占位。
 */
'use strict';

const {
  copyBlockSource,
  insertSnippetNearBlock,
  deleteBlock,
} = require('./block-handle-ops');

/**
 * @param {{
 *   view?: import('@codemirror/view').EditorView,
 *   copyText?: Function,
 *   toast?: Function,
 *   onDeleteMermaidBlock?: Function,
 *   onCopyImageBlock?: Function,
 *   onSoon?: Function,
 *   onAiAction?: Function,
 * }} liveOpts
 */
function createBlockMenuHandlers(liveOpts) {
  const opts = liveOpts || {};

  function getView() {
    if (typeof opts.getView === 'function') return opts.getView();
    return opts.view || null;
  }

  function toast(msg) {
    if (typeof opts.toast === 'function') opts.toast(msg);
  }

  function onCopy(block, kind) {
    if (kind === 'image' && typeof opts.onCopyImageBlock === 'function') {
      opts.onCopyImageBlock(block);
      return;
    }
    const view = getView();
    if (!view) return;
    if (copyBlockSource(view, block, opts.copyText)) {
      if (typeof opts.t === 'function') toast(opts.t('toastCopied'));
    }
  }

  function onCut(block, kind) {
    if (kind === 'image' && typeof opts.onCopyImageBlock === 'function') {
      Promise.resolve(opts.onCopyImageBlock(block)).finally(function () {
        onDelete(block, kind);
      });
      return;
    }
    const view = getView();
    if (!view) return;
    if (!copyBlockSource(view, block, opts.copyText)) return;
    onDelete(block, kind);
  }

  function onDelete(block, kind) {
    const view = getView();
    if (!view) return;
    if (kind === 'mermaid' && typeof opts.onDeleteMermaidBlock === 'function') {
      opts.onDeleteMermaidBlock(block);
      return;
    }
    if (kind === 'code' && typeof opts.onDeleteCodeBlock === 'function') {
      opts.onDeleteCodeBlock(block);
      return;
    }
    if (kind === 'image' && typeof opts.onDeleteImageBlock === 'function') {
      opts.onDeleteImageBlock(block);
      return;
    }
    // 删除后保留内存选中态，便于撤销后恢复蓝框 / 光标
    deleteBlock(view, block);
  }

  function onInsert(where, type, block) {
    const view = getView();
    if (!view) return;
    if (insertSnippetNearBlock(view, block, where, type)) return;
    if (typeof opts.onSoon === 'function') opts.onSoon('insert-' + where, type);
  }

  function onAi(id, block, kind) {
    if (typeof opts.onAiAction === 'function') {
      opts.onAiAction(id, block, kind);
      return;
    }
    if (typeof opts.onSoon === 'function') opts.onSoon('ai', id);
  }

  function onSoon(ctx, id) {
    if (typeof opts.onSoon === 'function') opts.onSoon(ctx, id);
  }

  return {
    onCopy: onCopy,
    onCut: onCut,
    onDelete: onDelete,
    onInsert: onInsert,
    onAi: onAi,
    onSoon: onSoon,
  };
}

module.exports = {
  createBlockMenuHandlers: createBlockMenuHandlers,
};
