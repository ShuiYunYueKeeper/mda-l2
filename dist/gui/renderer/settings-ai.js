/**
 * 设置弹窗 — Pro 面板（仅 License）与 AI 面板（Provider / Key / 模型列表 / 偏好）。
 * 由 app.js 挂载；依赖 window.mdaAPI 与 MDAI18n。Key 明文只在输入框里停留，保存后由 main 加密，
 * 面板永远只拿到 hasKey。
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function t(key, vars) {
    if (global.MDAI18n && typeof global.MDAI18n.t === 'function') {
      return global.MDAI18n.t(key, vars);
    }
    return key;
  }

  /** IPC 失败结果 → 可读文案（gate / 错误码均经 i18n，detail 已由 main 脱敏） */
  function describeFailure(r) {
    if (global.MDAEditor && typeof global.MDAEditor.describeAiFailure === 'function') {
      return global.MDAEditor.describeAiFailure(r, t);
    }
    if (r && r.gate) return t('aiGate_' + r.gate);
    return t('aiErr_' + ((r && r.code) || 'E_UNKNOWN'));
  }

  const MODEL_ID_RE = /^[\x21-\x7e]{1,128}$/;

  function row(title, desc, ctrlHtml, opts) {
    const o = opts || {};
    return (
      '<div class="mda-settings-row"' + (o.id ? ' id="' + o.id + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '>' +
        '<div class="mda-settings-row-text">' +
          '<div class="mda-settings-row-title">' + esc(title) + '</div>' +
          (desc || o.descId ? '<div class="mda-settings-row-desc"' + (o.descId ? ' id="' + o.descId + '"' : '') + '>' + esc(desc) + '</div>' : '') +
        '</div>' +
        '<div class="mda-settings-row-ctrl"' + (o.ctrlStyle ? ' style="' + o.ctrlStyle + '"' : '') + '>' + ctrlHtml + '</div>' +
      '</div>'
    );
  }

  /** @param {{ license?: object }} data */
  function buildProPaneHtml(data) {
    const lic = data.license || {};
    const isPro = !!(lic.isPro && lic.valid);
    const statusText = isPro
      ? t('proStatusActive')
      : (lic.reason === 'expired' ? t('proStatusExpired') : t('proStatusInactive'));
    return (
      '<div class="mda-settings-body" data-pane-panel="pro" hidden>' +
        '<h2 class="mda-settings-heading">' + esc(t('settingsNavPro')) + '</h2>' +
        '<div class="mda-settings-group">' +
          '<div class="mda-settings-row" style="flex-direction:column;align-items:stretch;gap:10px;">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('proLicenseTitle')) + '</div>' +
              '<div class="mda-settings-row-desc">' + esc(t('proLicenseDesc')) + '</div>' +
              '<div class="mda-settings-row-desc" id="settings-pro-status" style="margin-top:6px;font-weight:600;">' +
                esc(statusText) +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
              '<input type="text" id="settings-license-key" class="mda-settings-select" ' +
                'style="flex:1;min-width:180px;" placeholder="' + esc(t('proLicensePlaceholder')) + '" ' +
                'autocomplete="off" spellcheck="false" />' +
              '<button type="button" id="settings-license-activate" class="mda-settings-btn mda-settings-btn-primary">' +
                esc(t('proActivate')) +
              '</button>' +
              (isPro
                ? '<button type="button" id="settings-license-clear" class="mda-settings-btn">' +
                    esc(t('proDeactivate')) + '</button>'
                : '') +
            '</div>' +
            '<div class="mda-settings-row-desc">' +
              '<a href="#" id="settings-pro-buy-link">' + esc(t('proBuyLink')) + '</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /** @param {{ license?: object, ai?: object }} data */
  function buildAiPaneHtml(data) {
    const lic = data.license || {};
    const ai = data.ai || {};
    const isPro = !!(lic.isPro && lic.valid);
    const providers = (ai.providerList || []).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (ai.provider === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>';
    }).join('');
    const prefs = ai.prefs || {};
    const langOpts = ['auto', 'zh', 'en'].map(function (id) {
      return '<option value="' + id + '"' + ((prefs.outputLang || 'auto') === id ? ' selected' : '') + '>' +
        esc(t('aiOutputLang_' + id)) + '</option>';
    }).join('');
    const wide = 'flex:1;max-width:320px;';
    return (
      '<div class="mda-settings-body" data-pane-panel="ai" hidden>' +
        '<h2 class="mda-settings-heading">' + esc(t('settingsNavAi')) + '</h2>' +
        (isPro ? '' :
          '<div class="mda-ai-settings-notice" id="settings-ai-need-pro">' +
            '<span>' + esc(t('aiPaneNeedPro')) + '</span>' +
            '<button type="button" class="mda-settings-btn" id="settings-ai-go-pro">' + esc(t('aiPaneGoPro')) + '</button>' +
          '</div>') +
        '<div class="mda-settings-group">' +
          row(t('aiProviderEnabled'), t('aiProviderEnabledDesc'),
            '<label class="mda-settings-switch" title="' + esc(t('aiProviderEnabled')) + '">' +
              '<input type="checkbox" id="settings-ai-enabled"' + (ai.providerEnabled !== false ? ' checked' : '') + ' />' +
              '<span class="mda-settings-switch-track" aria-hidden="true"></span>' +
            '</label>') +
          row(t('aiProviderTitle'), t('aiProviderDesc'),
            '<select id="settings-ai-provider" class="mda-settings-select">' + providers + '</select>') +
          row(t('aiBaseUrlTitle'), t('aiBaseUrlDesc'),
            '<input type="text" id="settings-ai-baseurl" class="mda-settings-select" style="width:100%;" spellcheck="false" />',
            { ctrlStyle: wide }) +
          row(t('aiKeyTitle'), '',
            '<input type="password" id="settings-ai-key" class="mda-settings-select" style="flex:1;min-width:0;" autocomplete="off" />' +
            '<button type="button" id="settings-ai-key-clear" class="mda-settings-btn">' + esc(t('aiKeyClear')) + '</button>',
            { ctrlStyle: wide + 'display:flex;gap:8px;align-items:center;', descId: 'settings-ai-key-status' }) +
        '</div>' +
        '<div class="mda-settings-group" style="margin-top:16px;">' +
          '<div class="mda-settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('aiModelsTitle')) + '</div>' +
              '<div class="mda-settings-row-desc">' + esc(t('aiModelsDesc')) + '</div>' +
            '</div>' +
            '<div id="settings-ai-models" class="mda-ai-model-list"></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
              '<input type="text" id="settings-ai-model-add" class="mda-settings-select" style="flex:1;min-width:160px;" ' +
                'spellcheck="false" placeholder="' + esc(t('aiModelAddPlaceholder')) + '" />' +
              '<button type="button" id="settings-ai-model-add-btn" class="mda-settings-btn">' + esc(t('aiModelAdd')) + '</button>' +
              '<button type="button" id="settings-ai-fetch" class="mda-settings-btn">' + esc(t('aiFetchModels')) + '</button>' +
              '<button type="button" id="settings-ai-test" class="mda-settings-btn">' + esc(t('aiTestModel')) + '</button>' +
            '</div>' +
            '<div class="mda-settings-row-desc" id="settings-ai-probe-msg" aria-live="polite"></div>' +
          '</div>' +
          row(t('aiDefaultModelTitle'), '',
            '<select id="settings-ai-default-model" class="mda-settings-select"></select>') +
        '</div>' +
        '<div class="mda-settings-group" style="margin-top:16px;">' +
          row(t('aiOutputLangTitle'), t('aiOutputLangDesc'),
            '<select id="settings-ai-output-lang" class="mda-settings-select">' + langOpts + '</select>') +
          row(t('aiLongTextTitle'), t('aiLongTextDesc'),
            '<input type="number" id="settings-ai-long-text" class="mda-settings-select" min="1000" max="1000000" step="1000" ' +
              'style="width:120px;" value="' + esc(prefs.longTextConfirmChars || 20000) + '" />') +
        '</div>' +
      '</div>'
    );
  }

  function wireLicense(overlay, ctx) {
    const api = ctx.api;
    const toast = ctx.toast || function () {};
    const alertFn = ctx.alert || function () {};
    const confirmFn = ctx.confirm || function () { return Promise.resolve(false); };

    const buy = overlay.querySelector('#settings-pro-buy-link');
    if (buy) {
      buy.addEventListener('click', function (e) {
        e.preventDefault();
        if (api.openProActivation) api.openProActivation();
        else if (api.openExternal) {
          api.openExternal('https://github.com/ShuiYunYueKeeper/mda-l2/blob/main/docs/pro-activation.md');
        }
      });
    }

    function markPro(on) {
      const st = overlay.querySelector('#settings-pro-status');
      if (st) st.textContent = on ? t('proStatusActive') : t('proStatusInactive');
      const notice = overlay.querySelector('#settings-ai-need-pro');
      if (notice) notice.hidden = !!on;
    }

    const actBtn = overlay.querySelector('#settings-license-activate');
    if (actBtn) {
      actBtn.addEventListener('click', function () {
        const input = overlay.querySelector('#settings-license-key');
        const key = input ? String(input.value || '').trim() : '';
        if (!key) {
          alertFn(t('proActivateEmpty'));
          return;
        }
        api.activateLicense(key).then(function (r) {
          if (!r || !r.success) {
            alertFn(t('proActivateFail', { error: (r && r.error) || '' }));
            return;
          }
          toast(t('proActivateOk'));
          markPro(true);
          if (input) input.value = '';
        });
      });
    }

    const clearBtn = overlay.querySelector('#settings-license-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        confirmFn(t('proDeactivateConfirm')).then(function (yes) {
          if (!yes) return;
          api.clearLicense().then(function (r) {
            if (!r || !r.success) {
              alertFn(t('proDeactivateFail', { error: (r && r.error) || '' }));
              return;
            }
            toast(t('proDeactivateOk'));
            markPro(false);
            clearBtn.remove();
          });
        });
      });
    }
  }

  /**
   * 表单草稿按 Provider 分桶：切换 Provider 只切换显示，不丢其他桶里未保存的编辑。
   * 状态挂在 overlay 上，collectAiSettingsPatch 从这里取。
   */
  function wireAiPane(overlay, ctx, ai) {
    const api = ctx.api;
    const toast = ctx.toast || function () {};
    const q = function (sel) { return overlay.querySelector(sel); };
    const presets = {};
    (ai.providerList || []).forEach(function (p) { presets[p.id] = p; });

    const drafts = {};
    Object.keys(ai.buckets || {}).forEach(function (id) {
      const b = ai.buckets[id];
      drafts[id] = {
        baseUrl: b.baseUrl || '',
        hasKey: !!b.hasKey,
        apiKey: '',
        clearKey: false,
        models: (b.models || []).map(function (m) { return Object.assign({}, m); }),
        defaultModelId: b.defaultModelId || '',
        touched: false,
      };
    });
    const state = { current: ai.provider || 'openai', drafts: drafts };
    overlay.__mdaAiState = state;

    const providerSel = q('#settings-ai-provider');
    const baseInp = q('#settings-ai-baseurl');
    const keyInp = q('#settings-ai-key');
    const keyStatus = q('#settings-ai-key-status');
    const keyClear = q('#settings-ai-key-clear');
    const listEl = q('#settings-ai-models');
    const defSel = q('#settings-ai-default-model');
    const addInp = q('#settings-ai-model-add');
    const probeMsg = q('#settings-ai-probe-msg');

    function cur() { return state.drafts[state.current]; }
    function touch() { cur().touched = true; }

    function setProbeMsg(text, kind) {
      if (!probeMsg) return;
      probeMsg.textContent = text || '';
      probeMsg.classList.toggle('is-error', kind === 'error');
      probeMsg.classList.toggle('is-ok', kind === 'ok');
    }

    function renderKey() {
      const d = cur();
      if (keyInp) {
        keyInp.value = d.apiKey;
        keyInp.placeholder = d.hasKey && !d.clearKey ? t('aiKeyPlaceholderKeep') : t('aiKeyPlaceholder');
      }
      if (keyStatus) {
        keyStatus.textContent = d.clearKey
          ? t('aiKeyClearPending')
          : (d.hasKey ? t('aiKeyConfigured') : t('aiKeyMissing'));
      }
      if (keyClear) keyClear.hidden = !d.hasKey || d.clearKey;
    }

    function syncDefault() {
      const d = cur();
      const enabled = d.models.filter(function (m) { return m.enabled; });
      if (!enabled.some(function (m) { return m.id === d.defaultModelId; })) {
        d.defaultModelId = enabled[0] ? enabled[0].id : '';
      }
      if (!defSel) return;
      defSel.innerHTML = enabled.length
        ? enabled.map(function (m) {
          return '<option value="' + esc(m.id) + '"' + (m.id === d.defaultModelId ? ' selected' : '') + '>' +
            esc(m.label || m.id) + '</option>';
        }).join('')
        : '<option value="">' + esc(t('aiDefaultModelNone')) + '</option>';
      defSel.disabled = !enabled.length;
    }

    function renderModels() {
      const d = cur();
      if (listEl) {
        listEl.innerHTML = d.models.length
          ? d.models.map(function (m, i) {
            return '<div class="mda-ai-model-row" data-idx="' + i + '">' +
              '<label class="mda-ai-model-name">' +
                '<input type="checkbox" data-act="toggle"' + (m.enabled ? ' checked' : '') + ' />' +
                '<span title="' + esc(m.id) + '">' + esc(m.label || m.id) + '</span>' +
              '</label>' +
              '<span class="mda-ai-model-src">' + esc(t('aiModelSource_' + m.source)) + '</span>' +
              (m.source === 'preset' ? '' :
                '<button type="button" class="mda-settings-btn mda-ai-model-del" data-act="remove">' +
                  esc(t('aiModelRemove')) + '</button>') +
            '</div>';
          }).join('')
          : '<div class="mda-settings-row-desc">' + esc(t('aiModelsEmpty')) + '</div>';
      }
      syncDefault();
    }

    function renderAll() {
      if (providerSel) providerSel.value = state.current;
      if (baseInp) baseInp.value = cur().baseUrl;
      renderKey();
      renderModels();
      setProbeMsg('');
    }

    if (providerSel) {
      providerSel.addEventListener('change', function () {
        if (!state.drafts[providerSel.value]) return;
        state.current = providerSel.value;
        renderAll();
      });
    }
    if (baseInp) {
      baseInp.addEventListener('input', function () { cur().baseUrl = baseInp.value; touch(); });
    }
    if (keyInp) {
      keyInp.addEventListener('input', function () {
        cur().apiKey = keyInp.value;
        if (keyInp.value.trim()) cur().clearKey = false;
        touch();
      });
    }
    if (keyClear) {
      keyClear.addEventListener('click', function () {
        cur().clearKey = true;
        cur().apiKey = '';
        touch();
        renderKey();
      });
    }
    if (listEl) {
      listEl.addEventListener('change', function (e) {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (!target || target.getAttribute('data-act') !== 'toggle') return;
        const rowEl = target.closest('.mda-ai-model-row');
        const m = rowEl && cur().models[Number(rowEl.getAttribute('data-idx'))];
        if (!m) return;
        m.enabled = !!target.checked;
        touch();
        syncDefault();
      });
      listEl.addEventListener('click', function (e) {
        const btn = e.target && /** @type {HTMLElement} */ (e.target).closest('[data-act="remove"]');
        if (!btn) return;
        const rowEl = btn.closest('.mda-ai-model-row');
        cur().models.splice(Number(rowEl.getAttribute('data-idx')), 1);
        touch();
        renderModels();
      });
    }
    if (defSel) {
      defSel.addEventListener('change', function () { cur().defaultModelId = defSel.value; touch(); });
    }

    function addModels() {
      const raw = addInp ? String(addInp.value || '') : '';
      const ids = raw.split(/[,，\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!ids.length) return;
      const d = cur();
      const dup = [];
      const bad = [];
      let n = 0;
      ids.forEach(function (id) {
        if (!MODEL_ID_RE.test(id)) { bad.push(id); return; }
        if (d.models.some(function (m) { return m.id === id; })) { dup.push(id); return; }
        d.models.push({ id: id, enabled: true, source: 'manual' });
        n += 1;
      });
      const msgs = [];
      if (n) msgs.push(t('aiModelAdded', { n: n }));
      if (dup.length) msgs.push(t('aiModelDuplicate', { ids: dup.join(', ') }));
      if (bad.length) msgs.push(t('aiModelInvalid', { ids: bad.join(', ') }));
      setProbeMsg(msgs.join(' '), dup.length || bad.length ? 'error' : 'ok');
      if (n) {
        touch();
        renderModels();
        if (addInp) addInp.value = '';
      }
    }
    const addBtn = q('#settings-ai-model-add-btn');
    if (addBtn) addBtn.addEventListener('click', addModels);
    if (addInp) {
      addInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addModels(); }
      });
    }

    /** 探测用当前表单值（未保存也可测），Key 留空时 main 回退到已存 Key */
    function probeOpts(extra) {
      const d = cur();
      const en = q('#settings-ai-enabled');
      return Object.assign({
        provider: state.current,
        baseUrl: d.baseUrl,
        apiKey: d.clearKey ? '' : d.apiKey,
        providerEnabled: en ? !!en.checked : true,
      }, extra || {});
    }

    function runProbe(btn, busyText, call, onOk) {
      if (!btn || btn.disabled) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = busyText;
      setProbeMsg('');
      call().then(function (r) {
        if (!r || !r.success) { setProbeMsg(describeFailure(r), 'error'); return; }
        onOk(r.value || {});
      }).catch(function () {
        setProbeMsg(describeFailure(null), 'error');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
    }

    const fetchBtn = q('#settings-ai-fetch');
    if (fetchBtn && api.fetchAiModels) {
      fetchBtn.addEventListener('click', function () {
        const forId = state.current;
        runProbe(fetchBtn, t('aiFetching'), function () { return api.fetchAiModels(probeOpts()); }, function (v) {
          const fetched = Array.isArray(v.models) ? v.models : [];
          const d = state.drafts[forId];
          let added = 0;
          fetched.forEach(function (f) {
            if (!f || !MODEL_ID_RE.test(String(f.id || ''))) return;
            if (d.models.some(function (m) { return m.id === f.id; })) return;
            const entry = { id: f.id, enabled: true, source: 'fetched' };
            if (f.label) entry.label = String(f.label);
            d.models.push(entry);
            added += 1;
          });
          if (added) d.touched = true;
          if (forId === state.current) renderModels();
          setProbeMsg(t('aiFetchModelsOk', { total: fetched.length, added: added }), 'ok');
        });
      });
    }

    const testBtn = q('#settings-ai-test');
    if (testBtn && api.testAiModel) {
      testBtn.addEventListener('click', function () {
        const modelId = cur().defaultModelId;
        runProbe(testBtn, t('aiTesting'), function () { return api.testAiModel(probeOpts({ modelId: modelId })); }, function (v) {
          setProbeMsg(t('aiTestOk', { model: v.model || modelId, ms: v.latencyMs || 0 }), 'ok');
        });
      });
    }

    const goPro = q('#settings-ai-go-pro');
    if (goPro && ctx.switchPane) goPro.addEventListener('click', function () { ctx.switchPane('pro'); });

    renderAll();
  }

  /**
   * @param {HTMLElement} overlay
   * @param {{ api: any, ai?: object, toast?: Function, alert?: Function, confirm?: Function, switchPane?: (id: string) => void }} ctx
   */
  function wireProPane(overlay, ctx) {
    wireLicense(overlay, ctx);
    if (overlay.querySelector('[data-pane-panel="ai"]')) wireAiPane(overlay, ctx, ctx.ai || {});
  }

  /**
   * 收集 AI 设置 patch：只提交改过的桶；Key 为空且未清除时不带 apiKey（保持原 Key）。
   * @param {HTMLElement} overlay
   */
  function collectAiSettingsPatch(overlay) {
    const state = overlay.__mdaAiState;
    if (!state) return null;
    const en = overlay.querySelector('#settings-ai-enabled');
    const lang = overlay.querySelector('#settings-ai-output-lang');
    const longText = overlay.querySelector('#settings-ai-long-text');
    const patch = {
      provider: state.current,
      providerEnabled: en ? !!en.checked : true,
      prefs: {
        outputLang: lang ? lang.value : 'auto',
        longTextConfirmChars: longText ? Number(longText.value) || 20000 : 20000,
      },
      buckets: {},
    };
    Object.keys(state.drafts).forEach(function (id) {
      const d = state.drafts[id];
      if (!d.touched) return;
      const b = {
        baseUrl: d.baseUrl,
        models: d.models,
        defaultModelId: d.defaultModelId,
      };
      if (d.clearKey) b.clearKey = true;
      else if (d.apiKey.trim()) b.apiKey = d.apiKey.trim();
      patch.buckets[id] = b;
    });
    return patch;
  }

  /** 保存成功后用 main 回传的公开设置刷新草稿（清掉已提交的明文 Key）。 */
  function applySavedAiSettings(overlay, ai) {
    const state = overlay.__mdaAiState;
    if (!state || !ai || !ai.buckets) return;
    Object.keys(state.drafts).forEach(function (id) {
      const b = ai.buckets[id];
      const d = state.drafts[id];
      if (!b) return;
      d.hasKey = !!b.hasKey;
      d.apiKey = '';
      d.clearKey = false;
      d.touched = false;
      d.baseUrl = b.baseUrl || '';
      d.models = (b.models || []).map(function (m) { return Object.assign({}, m); });
      d.defaultModelId = b.defaultModelId || '';
    });
    const providerSel = overlay.querySelector('#settings-ai-provider');
    if (providerSel) providerSel.dispatchEvent(new Event('change'));
  }

  global.MDASettingsAi = {
    buildProPaneHtml: buildProPaneHtml,
    buildAiPaneHtml: buildAiPaneHtml,
    wireProPane: wireProPane,
    collectAiSettingsPatch: collectAiSettingsPatch,
    applySavedAiSettings: applySavedAiSettings,
    describeFailure: describeFailure,
  };
})(typeof window !== 'undefined' ? window : global);
