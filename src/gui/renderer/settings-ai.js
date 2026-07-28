/**
 * 设置弹窗 — Pro 面板（License 激活 + AI Provider）。
 * 由 app.js 挂载；依赖 window.mdaAPI 与 MDAI18n。
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

  /**
   * @param {{ license?: object, ai?: object }} data
   */
  function buildProPaneHtml(data) {
    const lic = data.license || {};
    const ai = data.ai || {};
    const isPro = !!(lic.isPro && lic.valid);
    const statusText = isPro
      ? t('proStatusActive')
      : (lic.reason === 'expired' ? t('proStatusExpired') : t('proStatusInactive'));
    const providers = (ai.providers || []).map(function (p) {
      return '<option value="' + esc(p.id) + '"' +
        (ai.provider === p.id ? ' selected' : '') + '>' +
        esc(p.label) + '</option>';
    }).join('');

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
        '<div class="mda-settings-group" style="margin-top:16px;">' +
          '<div class="mda-settings-row">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('aiProviderTitle')) + '</div>' +
              '<div class="mda-settings-row-desc">' + esc(t('aiProviderDesc')) + '</div>' +
            '</div>' +
            '<div class="mda-settings-row-ctrl">' +
              '<select id="settings-ai-provider" class="mda-settings-select">' + providers + '</select>' +
            '</div>' +
          '</div>' +
          '<div class="mda-settings-row">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('aiBaseUrlTitle')) + '</div>' +
              '<div class="mda-settings-row-desc">' + esc(t('aiBaseUrlDesc')) + '</div>' +
            '</div>' +
            '<div class="mda-settings-row-ctrl" style="flex:1;max-width:280px;">' +
              '<input type="text" id="settings-ai-baseurl" class="mda-settings-select" style="width:100%;" ' +
                'value="' + esc(ai.baseUrl || '') + '" spellcheck="false" />' +
            '</div>' +
          '</div>' +
          '<div class="mda-settings-row">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('aiModelTitle')) + '</div>' +
            '</div>' +
            '<div class="mda-settings-row-ctrl" style="flex:1;max-width:280px;">' +
              '<input type="text" id="settings-ai-model" class="mda-settings-select" style="width:100%;" ' +
                'value="' + esc(ai.model || '') + '" spellcheck="false" />' +
            '</div>' +
          '</div>' +
          '<div class="mda-settings-row">' +
            '<div class="mda-settings-row-text">' +
              '<div class="mda-settings-row-title">' + esc(t('aiKeyTitle')) + '</div>' +
              '<div class="mda-settings-row-desc">' +
                esc(ai.hasKey ? t('aiKeyConfigured') : t('aiKeyMissing')) +
              '</div>' +
            '</div>' +
            '<div class="mda-settings-row-ctrl" style="flex:1;max-width:280px;">' +
              '<input type="password" id="settings-ai-key" class="mda-settings-select" style="width:100%;" ' +
                'placeholder="' + esc(ai.hasKey ? t('aiKeyPlaceholderKeep') : t('aiKeyPlaceholder')) + '" ' +
                'autocomplete="off" />' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /**
   * @param {HTMLElement} overlay
   * @param {{
   *   api: any,
   *   toast?: (msg: string) => void,
   *   alert?: (msg: string) => void|Promise<void>,
   *   confirm?: (msg: string) => Promise<boolean>,
   *   openSettingsPane?: (pane: string) => void,
   * }} ctx
   */
  function wireProPane(overlay, ctx) {
    const api = ctx.api;
    const toast = ctx.toast || function () {};
    const alertFn = ctx.alert || function () {};
    const confirmFn = ctx.confirm || function () { return Promise.resolve(false); };

    const providerSel = overlay.querySelector('#settings-ai-provider');
    if (providerSel && api.getAiSettings) {
      api.getAiSettings().then(function (r) {
        if (!r || !r.success || !r.value) return;
        const presets = r.value.providers || [];
        providerSel.addEventListener('change', function () {
          const id = providerSel.value;
          const p = presets.find(function (x) { return x.id === id; });
          if (!p) return;
          const base = overlay.querySelector('#settings-ai-baseurl');
          const model = overlay.querySelector('#settings-ai-model');
          if (id !== 'custom') {
            if (base) base.value = p.defaultBaseUrl || '';
            if (model) model.value = p.defaultModel || '';
          }
        });
      });
    }

    const buy = overlay.querySelector('#settings-pro-buy-link');
    if (buy) {
      buy.addEventListener('click', function (e) {
        e.preventDefault();
        if (api.openExternal) {
          api.openExternal('https://github.com/ShuiYunYueKeeper/mda-l2/blob/main/docs/pro-activation.md');
        }
      });
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
          const st = overlay.querySelector('#settings-pro-status');
          if (st) st.textContent = t('proStatusActive');
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
            const st = overlay.querySelector('#settings-pro-status');
            if (st) st.textContent = t('proStatusInactive');
            clearBtn.remove();
          });
        });
      });
    }
  }

  /**
   * 从 Pro 面板收集 AI 设置 patch（不含空 Key）。
   * @param {HTMLElement} overlay
   */
  function collectAiSettingsPatch(overlay) {
    const provider = overlay.querySelector('#settings-ai-provider');
    const baseUrl = overlay.querySelector('#settings-ai-baseurl');
    const model = overlay.querySelector('#settings-ai-model');
    const keyEl = overlay.querySelector('#settings-ai-key');
    const patch = {
      provider: provider ? provider.value : 'openai',
      baseUrl: baseUrl ? baseUrl.value : '',
      model: model ? model.value : '',
    };
    const key = keyEl ? String(keyEl.value || '').trim() : '';
    if (key) patch.apiKey = key;
    return patch;
  }

  global.MDASettingsAi = {
    buildProPaneHtml: buildProPaneHtml,
    wireProPane: wireProPane,
    collectAiSettingsPatch: collectAiSettingsPatch,
  };
})(typeof window !== 'undefined' ? window : global);
