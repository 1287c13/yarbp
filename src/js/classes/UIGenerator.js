export class UIGenerator {
  constructor(isDark = false) {
    this.isDark = isDark;
    this.renderers = [
      { test: (node) => node.key === 'форма', render: this.form },
      { test: (node) => node.key === 'группа', render: this.group },
      { test: (node) => node.key === 'поле', render: this.field },
      { test: (node) => node.key === 'кнопка', render: this.button },
      { test: (node) => node.key === 'надпись', render: this.label },
      { test: (node) => node.key === 'табы', render: this.tabs },
      { test: (node) => node.key === 'таб', render: this.tab },
      { test: (node) => node.key === 'опция', render: this.option },
    ];
    this.cardCounter = 0;
    this.tabsCounter = 0;
  }

  /**
   * AST — общий кэш парсера: его нельзя менять при рендере. UI-генератор
   * исторически правил узлы (key/type/id/props/parsedValue) прямо в AST;
   * теперь он работает с одноразовой копией, а исходное дерево остаётся
   * пригодным для подсказок и других конвертеров.
   */
  cloneAST(value) {
    if (Array.isArray(value)) return value.map(item => this.cloneAST(item));
    if (value && typeof value === 'object') {
      const copy = {};
      Object.keys(value).forEach(key => {
        copy[key] = this.cloneAST(value[key]);
      });
      return copy;
    }
    return value;
  }

  generateHTML(ast) {
    if (!ast || !ast.children) return '';
    const view = this.cloneAST(ast);
    return `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #f3f4f6; padding: 20px; }
        .form-container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 16px; padding: 24px; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .fieldset-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .fieldset-card legend { font-weight: 600; font-size: 1.1rem; margin-bottom: 12px; padding: 0; }
        .input-group { margin-bottom: 12px; }
        .input-group label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 4px; }
        .input-group input, .input-group select { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; }
        .field-row { display: flex; gap: 6px; align-items: center; }
        .field-row input, .field-row select { flex: 1; min-width: 0; }
        .field-clear { flex: 0 0 auto; width: 30px; height: 30px; padding: 0; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer; font-size: 16px; line-height: 1; color: #6b7280; }
        .field-clear:hover { background: #f3f4f6; color: #111827; }
        .items-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .list-item { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; }
        .btn-secondary { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 0.9rem; width: 100%; }
        .btn-secondary:hover { background: #e5e7eb; }
        .order-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-top: 12px; }
        .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .form-view { display: none; }
        .tabs { margin-bottom: 12px; }
        .tab-nav { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
        .tab-btn { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: none; cursor: pointer; font-size: 0.9rem; color: #6b7280; }
        .tab-btn.active { color: #111827; border-bottom-color: #3b82f6; font-weight: 600; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        .repeatable-item { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .repeatable-header { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }
        .ui-action { margin-top: 8px; }
        .ui-dialog-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(17,24,39,.45); }
        .ui-dialog { width: min(360px, 100%); background: white; border-radius: 12px; padding: 20px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
        .ui-dialog p { margin-bottom: 16px; line-height: 1.4; }
        .ui-dialog button { width: 100%; padding: 9px 12px; border: 0; border-radius: 8px; background: #3b82f6; color: white; cursor: pointer; font-size: .95rem; }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; }
        }
      </style>
      <div class="form-container">
        <form>
          <div class="form-grid">
            ${view.children.map(child => this.renderNode(child)).join('')}
          </div>
        </form>
      </div>
    `;
  }

  generateRuntimeJS() {
    return `
(function() {
  // Переключить активную панель табов. Инлайн-стили сбрасываем: иначе
  // show/back и tab-кнопки будут спорить, кто главнее.
  function activateTab(tabs, target) {
    if (!tabs || !target) return;
    tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabTarget === target);
    });
    tabs.querySelectorAll('.tab-panel').forEach(panel => {
      panel.style.display = '';
      panel.classList.toggle('active', panel.dataset.tabPanel === target);
    });
  }

  // Цель из .источник/.приемник/.навигация: последний сегмент после # или ..
  function targetId(raw) {
    const text = String(raw || '').trim().replace(/^#/, '').replace(/\\s+/g, ' ');
    const parts = text.split(/[.\\s]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function findTab(raw) {
    const id = targetId(raw);
    if (!id) return null;
    const byData = Array.from(document.querySelectorAll('[data-tab-id]'))
      .find(el => el.dataset.tabId === id);
    return byData || document.getElementById(id);
  }

  function findField(raw) {
    const id = targetId(raw);
    if (!id) return null;
    return Array.from(document.querySelectorAll('input, select'))
      .find(el => el.name === id || el.id === id) || null;
  }

  function activateTarget(raw) {
    const tab = findTab(raw);
    if (!tab) return false;
    const tabs = tab.closest('.tabs');
    if (tabs && tab.dataset.tabPanel) {
      activateTab(tabs, tab.dataset.tabPanel);
      return true;
    }
    return false;
  }

  function showDialog(message, okLabel) {
    if (!message) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'ui-dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'ui-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const text = document.createElement('p');
    text.textContent = message;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = okLabel || 'Ок';
    box.appendChild(text);
    box.appendChild(ok);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
    const onKey = event => {
      if (event.key === 'Escape') close();
    };
    ok.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);
    ok.focus();
  }

  function checkAction(button) {
    const check = button.dataset.check;
    if (!check) {
      if (button.dataset.dialog) showDialog(button.dataset.dialog, button.dataset.dialogOk);
      return true;
    }
    const field = findField(check);
    const empty = !field || String(field.value || '').trim() === '';
    const invalid = button.dataset.checkType === 'пусто' ? empty : false;
    if (!invalid) return true;
    if (button.dataset.dialog) showDialog(button.dataset.dialog, button.dataset.dialogOk);
    return button.dataset.checkGoal !== 'запретить';
  }

  function transfer(button) {
    const source = findTab(button.dataset.source);
    const target = findTab(button.dataset.target);
    if (!source || !target) return;
    const fields = Array.from(source.querySelectorAll('input, select'));
    const values = fields.map(field => {
      const label = field.closest('.input-group')?.querySelector('label')?.textContent || field.name;
      return { label: label, value: field.value || '—' };
    }).filter(item => item.value !== '—');
    if (!values.length) return;
    let list = target.querySelector('.items-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'items-list';
      target.appendChild(list);
    }
    const item = document.createElement('div');
    item.className = 'list-item';
    values.forEach(data => {
      const span = document.createElement('span');
      span.textContent = data.label + ': ' + data.value;
      item.appendChild(span);
    });
    list.appendChild(item);
    fields.forEach(field => {
      if (field.tagName === 'SELECT') field.selectedIndex = -1;
      else field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    activateTarget(button.dataset.target);
  }

  document.querySelectorAll('.ui-action').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!checkAction(this)) return;
      if (this.dataset.source && this.dataset.target) {
        transfer(this);
        return;
      }
      if (this.dataset.navigation) activateTarget(this.dataset.navigation);
    });
  });

  // Клик по табу
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      activateTab(this.closest('.tabs'), this.dataset.tabTarget);
    });
  });

  // Показать форму
  document.querySelectorAll('.show-form-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      const tabs = card && card.querySelector('.tabs');
      const formPanel = card && card.querySelector('.form-view');
      if (tabs && formPanel) {
        activateTab(tabs, formPanel.dataset.tabPanel);
        return;
      }
      if (!card) return;
      card.querySelector('.list-view').style.display = 'none';
      card.querySelector('.form-view').style.display = 'block';
    });
  });

  // Назад к списку
  document.querySelectorAll('.back-to-list').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      const tabs = card && card.querySelector('.tabs');
      const listPanel = card && card.querySelector('.list-view');
      if (tabs && listPanel) {
        activateTab(tabs, listPanel.dataset.tabPanel);
        return;
      }
      if (!card) return;
      card.querySelector('.list-view').style.display = 'block';
      card.querySelector('.form-view').style.display = 'none';
    });
  });

  // Очистить поле по .доп-функционал очистить
  document.querySelectorAll('.field-clear').forEach(btn => {
    btn.addEventListener('click', function() {
      const row = this.closest('.field-row');
      const field = row && row.querySelector('input, select');
      if (!field) return;

      if (field.tagName === 'SELECT') field.selectedIndex = -1;
      else field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.focus();
    });
  });

  // Удалить повторяемую строку
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const item = this.closest('.repeatable-item');
      if (item) item.remove();
    });
  });

  // Добавить из формы в список
  document.querySelectorAll('.submit-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      const formView = card.querySelector('.form-view');
      const itemsList = card.querySelector('.items-list');

      // required-поля проверяет браузер: без валидной формы строка не добавляется.
      // Проверяем только поля текущего экрана, иначе пустые поля скрытых
      // form-view (другие группы) блокировали бы добавление.
      const invalid = Array.from(formView.querySelectorAll('input, select'))
        .find(field => typeof field.checkValidity === 'function' && !field.checkValidity());
      if (invalid) {
        if (typeof invalid.reportValidity === 'function') invalid.reportValidity();
        return;
      }

      // Собираем данные
      const data = [];
      formView.querySelectorAll('input, select').forEach(field => {
        const label = field.closest('.input-group')?.querySelector('label')?.textContent || field.name;
        const value = field.value || '—';
        data.push({ label, value });
      });
      
      // Создаем элемент списка
      const item = document.createElement('div');
      item.className = 'list-item';
      data.forEach(d => {
        const span = document.createElement('span');
        span.textContent = d.label + ': ' + d.value;
        item.appendChild(span);
      });
      
      itemsList.appendChild(item);
      
      // Очищаем и возвращаемся
      formView.querySelectorAll('input').forEach(f => f.value = '');
      formView.querySelectorAll('select').forEach(f => f.selectedIndex = 0);
      const tabs = card.querySelector('.tabs');
      const listPanel = card.querySelector('.list-view');
      if (tabs && listPanel) {
        activateTab(tabs, listPanel.dataset.tabPanel);
      } else {
        card.querySelector('.list-view').style.display = 'block';
        formView.style.display = 'none';
      }
    });
  });
})();`;
  }

  extractShorthand(astNode) {
    if (!astNode.children) return;
    const shorthandChild = astNode.children.find(c => c.key === 'shorthand');
    if (shorthandChild && typeof shorthandChild.value === 'string') {
      // Убираем "= " и лишние пробелы
      astNode.value = shorthandChild.value.replace(/^=\s*/, '').trim();
    }
  }

  renderNode(astNode) {
    if (astNode.nodeType !== 'MEANING') return '';

    this.parseKeyAndId(astNode);
    this.extractShorthand(astNode);

    const props = {};
    if (astNode.children) {
      astNode.children.forEach(child => {
        if (child.nodeType === 'MEANING' && child.key !== 'shorthand' && child.prefix === '.') {
          props[child.key] = child.value;
        }
      });
    }
    astNode.props = props;
    astNode.parsedValue = this.parseSugaredValue(astNode.value);

    if (astNode.type === 'таблица-соответствий') {
      return this.renderCorrespondenceTable(astNode);
    }
    if (astNode.type === 'набор-соответствий') {
      return this.renderCorrespondenceSet(astNode);
    }
    if (astNode.key === 'табы') {
      return this.renderTabs(astNode);
    }

    let childrenHTML = '';
    if (astNode.children) {
      astNode.children.forEach(child => {
        if (child.nodeType === 'MEANING') {
          if (child.key === 'shorthand') return;
          if (child.prefix === '.') return;
          childrenHTML += this.renderNode(child);
        }
      });
    }

    const renderer = this.renderers.find(r => r.test(astNode));
    return renderer ? renderer.render.call(this, astNode, childrenHTML) : childrenHTML;
  }

  parseKeyAndId(astNode) {
    if (!astNode.key) return;
    let keyStr = astNode.key;
    const colonIdx = keyStr.indexOf(':');
    if (colonIdx !== -1) {
      astNode.type = keyStr.slice(colonIdx + 1);
      keyStr = keyStr.slice(0, colonIdx);
    }
    const hashIdx = keyStr.indexOf('#');
    if (hashIdx !== -1) {
      astNode.id = keyStr.slice(hashIdx + 1);
      astNode.key = keyStr.slice(0, hashIdx);
    } else {
      astNode.key = keyStr;
    }
  }

  parseSugaredValue(value) {
    if (typeof value !== 'string') return { raw: value };
    const cleanValue = value.replace(/^=\s*/, '').trim();
    const parts = cleanValue.split('/').map(p => p.trim());
    const result = { raw: cleanValue };

    if (parts[0]) result.label = parts[0];
    if (parts.length >= 2 && parts[1]) {
      if (['*', 'да', 'yes'].includes(parts[1])) result.required = true;
      else result.placeholder = parts[1];
    }
    if (parts.length >= 3 && parts[2]) {
      if (['*', 'да', 'yes'].includes(parts[2])) result.required = true;
      else result.postfix = parts[2];
    }
    return result;
  }

  parseOptionValue(value) {
    if (typeof value !== 'string') return { label: '', value: '' };
    const cleanValue = value.replace(/^=\s*/, '').trim();
    const parts = cleanValue.split('/').map(p => p.trim());
    return { label: parts[0] || '', value: parts[1] || parts[0] || '' };
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  form(n, children) {
    return children;
  }

  group(n, children) {
    const title = n.parsedValue?.label || '';
    const isTile = n.type === 'плитка';

    if (isTile) {
      return `<fieldset class="fieldset-card"><legend>${this.escapeHtml(title)}</legend>${children}</fieldset>`;
    }
    return children;
  }

  renderCorrespondenceTable(n) {
    const rows = n.children.map(field => {
      if (field.nodeType !== 'MEANING') return '';
      this.parseKeyAndId(field);
      this.extractShorthand(field);
      const label = field.value || field.key || '';
      const postfix = field.props?.['постфикс'] || '';
      return `<div class="info-row"><span>${this.escapeHtml(label)}:</span><strong>${postfix ? this.escapeHtml(postfix) : '—'}</strong></div>`;
    }).join('');
    return `<div class="order-card">${rows}</div>`;
  }

  renderCorrespondenceSet(n) {
    if (!n.children || n.children.length === 0) {
      return '<div class="items-list"><div style="text-align:center;color:#999;">Список пуст</div></div>';
    }
    const items = n.children.map(field => {
      if (field.nodeType !== 'MEANING') return '';
      this.parseKeyAndId(field);
      this.extractShorthand(field);
      const label = field.value || field.id || field.key || '';
      return `<div class="list-item"><span>${this.escapeHtml(label)}</span><span>—</span></div>`;
    }).join('');
    return `<div class="items-list">${items}</div>`;
  }

  renderTabs(n) {
    const groupId = String((n.props && n.props['ид']) || `tabs-${++this.tabsCounter}`);
    const tabNodes = n.children.filter(c => c.nodeType === 'MEANING' && c.key.startsWith('таб'));
    if (!tabNodes.length) return '';

    const tabs = tabNodes.map((tab, index) => {
      this.parseKeyAndId(tab);
      const id = tab.id || tab.key || `tab-${index}`;
      const isList = id.includes('список');
      const isForm = id.includes('добавить');
      const label = String(tab.value || id).replace(/^=\s*/, '').trim() || 'Таб';
      const panelId = `${groupId}-${index}`;
      const content = this.renderNode(tab);
      const customButtons = (tab.children || []).filter(
        child => child.nodeType === 'MEANING' && child.key === 'кнопка');
      const hasCustomTransfer = customButtons.some(
        button => button.props && button.props['источник'] && button.props['приемник']);
      const hasCustomNavigation = customButtons.some(
        button => button.props && button.props['навигация']);

      let body = content;
      if (isList && !hasCustomNavigation) {
        body += '<button type="button" class="btn-secondary show-form-btn">+ Добавить</button>';
      }
      if (isForm) {
        const autoAdd = hasCustomTransfer
          ? ''
          : '<button type="button" class="btn-secondary submit-item" style="margin-top:12px;">Добавить</button>';
        const autoBack = hasCustomNavigation
          ? ''
          : '<button type="button" class="btn-secondary back-to-list" style="margin-top:8px;">← Назад к списку</button>';
        body = `
          <div class="repeatable-item">
            <div class="repeatable-header">
              <span>Новая запись</span>
              <button type="button" class="btn-secondary remove-item" style="width:auto;padding:4px 8px;">✖</button>
            </div>
            ${content}
            ${autoAdd}
          </div>
          ${autoBack}`;
      }

      const legacyClass = isList ? ' list-view' : (isForm ? ' form-view' : '');
      const activeClass = index === 0 ? ' active' : '';
      return {
        button: `<button type="button" class="tab-btn${activeClass}" data-tab-target="${panelId}">${this.escapeHtml(label)}</button>`,
        panel: `<section class="tab-panel${legacyClass}${activeClass}" data-tab-panel="${panelId}" data-tab-id="${this.escapeHtml(id)}">${body}</section>`
      };
    });

    return `<div class="tabs" data-tabs-id="${groupId}">` +
      `<div class="tab-nav">${tabs.map(tab => tab.button).join('')}</div>` +
      `<div class="tab-panels">${tabs.map(tab => tab.panel).join('')}</div>` +
      `</div>`;
  }

  field(n, children) {
    const fieldType = n.type || 'текст';
    const label = n.parsedValue?.label || n.key || '';
    const placeholder = n.parsedValue?.placeholder || '';
    const required = n.parsedValue?.required;
    const isSelect = fieldType === 'выбор';
    const clear = String((n.props && n.props['доп-функционал']) || '').includes('очистить');

    const attrs = [];
    if (!isSelect) attrs.push(`type="${this.mapFieldType(fieldType)}"`);
    attrs.push(`name="${this.escapeHtml(n.id || n.key || label)}"`);
    if (placeholder) attrs.push(`placeholder="${this.escapeHtml(placeholder)}"`);
    if (required) attrs.push('required');

    const control = isSelect
      ? `<select ${attrs.join(' ')}>${children}</select>`
      : `<input ${attrs.join(' ')} />`;
    const clearButton = clear
      ? '<button type="button" class="field-clear" title="Очистить" aria-label="Очистить">×</button>'
      : '';

    return `
      <div class="input-group">
        <label>${this.escapeHtml(label)}</label>
        <div class="field-row">${control}${clearButton}</div>
      </div>`;
  }

  button(n) {
    const props = n.props || {};
    const label = String(n.parsedValue?.label || n.value || '').replace(/^=\s*/, '').trim();
    if (!label) return '';

    const attrs = [];
    const add = (name, value) => {
      if (value === undefined || value === null || value === '') return;
      attrs.push(`data-${name}="${this.escapeHtml(String(value))}"`);
    };
    add('source', props['источник']);
    add('target', props['приемник']);
    add('navigation', props['навигация']);
    add('check', props['проверить']);
    add('check-type', props['тип_проверки']);
    add('check-goal', props['цель_проверки']);

    const dialog = String(props['диалог'] || '');
    if (dialog) {
      const divider = dialog.indexOf(' / ');
      const message = divider === -1 ? dialog : dialog.slice(0, divider);
      const okLabel = divider === -1 ? 'Ок' : dialog.slice(divider + 3);
      add('dialog', message.trim());
      add('dialog-ok', okLabel.trim() || 'Ок');
    }

    if (!attrs.length) return '';
    return `<button type="button" class="btn-secondary ui-action" ${attrs.join(' ')}>${this.escapeHtml(label)}</button>`;
  }

  label(n) {
    return `<div style="font-weight:500;margin-bottom:8px;">${this.escapeHtml(n.value || '')}</div>`;
  }

  tab(n, children) {
    return children;
  }

  option(n) {
    if (!n.value && n.children) {
      const shorthand = n.children.find(c => c.key === 'shorthand');
      if (shorthand?.value) n.value = shorthand.value.replace(/^=\s*/, '').trim();
    }
    const parsed = this.parseOptionValue(n.value);
    return `<option value="${this.escapeHtml(parsed.value)}">${this.escapeHtml(parsed.label)}</option>`;
  }

  mapFieldType(t) {
    const m = {
      'штрихкод': 'text', 'число': 'number', 'дата': 'date',
      'почта': 'email', 'телефон': 'tel', 'строка': 'text',
      'целое': 'number', 'текст': 'text'
    };
    return m[t] || 'text';
  }
}