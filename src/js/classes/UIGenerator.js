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
    this.tableCounter = 0;
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
        .field-postfix { flex: 0 0 auto; color: #6b7280; font-size: .85rem; white-space: nowrap; }
        .group-content.direction-horizontal { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: start; }
        .group-content.direction-vertical { display: block; }
        .ui-table-wrap { margin-top: 12px; }
        .ui-table { width: 100%; border-collapse: collapse; background: white; }
        .ui-table th, .ui-table td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
        .ui-table th { font-size: .8rem; color: #6b7280; font-weight: 600; }
        .ui-table td input { width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 7px; }
        .ui-table .remove-table-row { width: auto; padding: 4px 8px; }
        .add-table-row { margin-top: 8px; }
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
    // Канонический сахар: label / placeholder / required / postfix.
    if (parts.length >= 4 && parts[3]) result.postfix = parts[3];
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
    const direction = String((n.props && n.props['направление']) || '').toLowerCase();
    const directionClass = direction.includes('горизонт')
      ? ' direction-horizontal'
      : (direction.includes('вертик') ? ' direction-vertical' : '');

    if (isTile) {
      return `<fieldset class="fieldset-card"><legend>${this.escapeHtml(title)}</legend>` +
        `<div class="group-content${directionClass}">${children}</div></fieldset>`;
    }
    return `<div class="group-content${directionClass}">${children}</div>`;
  }

  renderCorrespondenceTable(n) {
    const tableId = 'corr-' + (++this.tableCounter);
    const columns = [];

    n.children.forEach(field => {
      if (field.nodeType !== 'MEANING') return;
      this.parseKeyAndId(field);
      this.extractShorthand(field);
      const parsed = this.parseSugaredValue(field.value || '');
      const fieldProps = {};
      const values = [];
      (field.children || []).forEach(child => {
        if (child.nodeType !== 'MEANING' || child.prefix !== '.') return;
        fieldProps[child.key] = child.value;
        if (child.key === 'значение') values.push(child.value);
      });
      const label = parsed.label || field.value || field.key || 'field-' + columns.length;
      const name = field.id || label;
      columns.push({
        name: name,
        label: label,
        placeholder: parsed.placeholder || '',
        postfix: parsed.postfix || fieldProps['постфикс'] || '',
        values: values,
        type: this.mapFieldType(field.type || field.key || 'текст'),
      });
    });

    if (!columns.length) return '';

    const header = columns
      .map(column => `<th>${this.escapeHtml(column.label)}</th>`)
      .join('') + '<th></th>';

    const makeRow = (rowIndex) => {
      const cells = columns.map(column => {
        const value = rowIndex >= 0 && column.values[rowIndex] !== undefined
          ? column.values[rowIndex] : '';
        return `<td><input type="${this.escapeHtml(column.type)}" name="${this.escapeHtml(column.name)}" data-field="${this.escapeHtml(column.name)}" value="${this.escapeHtml(value)}" placeholder="${this.escapeHtml(column.placeholder)}" />` +
          (column.postfix ? `<span class="field-postfix">${this.escapeHtml(column.postfix)}</span>` : '') +
          '</td>';
      }).join('');
      return `<tr data-ui-table-row>${cells}` +
        '<td><button type="button" class="btn-secondary remove-table-row" aria-label="Удалить строку">✖</button></td></tr>';
    };

    const rowCount = Math.max(1, ...columns.map(column => column.values.length));
    const rows = [];
    for (let index = 0; index < rowCount; index++) rows.push(makeRow(index));
    const blankRow = makeRow(-1);

    return `<div class="ui-table-wrap" data-ui-table="${tableId}">` +
      `<table class="ui-table"><thead><tr>${header}</tr></thead><tbody>${rows.join('')}</tbody></table>` +
      '<button type="button" class="btn-secondary add-table-row">+ Добавить строку</button>' +
      `<template class="ui-table-row-template">${blankRow}</template>` +
      '</div>';
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
    const postfix = n.parsedValue?.postfix || (n.props && n.props['постфикс']) || '';
    const isSelect = fieldType === 'выбор';
    const clear = String((n.props && n.props['доп-функционал']) || '').includes('очистить');

    const attrs = [];
    if (!isSelect) attrs.push(`type="${this.mapFieldType(fieldType)}"`);
    attrs.push(`name="${this.escapeHtml(n.id || n.key || label)}"`);
    if (n.props && n.props['тип-данных']) {
      attrs.push(`data-type="${this.escapeHtml(n.props['тип-данных'])}"`);
    }
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
        <div class="field-row">${control}${postfix ? `<span class="field-postfix">${this.escapeHtml(postfix)}</span>` : ''}${clearButton}</div>
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