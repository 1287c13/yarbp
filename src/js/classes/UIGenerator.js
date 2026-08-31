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
  }

  generateHTML(ast) {
    if (!ast || !ast.children) return '';
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
        .items-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .list-item { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; }
        .btn-secondary { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 0.9rem; width: 100%; }
        .btn-secondary:hover { background: #e5e7eb; }
        .order-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-top: 12px; }
        .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .form-view { display: none; }
        .repeatable-item { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .repeatable-header { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 600; }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; }
        }
      </style>
      <div class="form-container">
        <form>
          <div class="form-grid">
            ${ast.children.map(child => this.renderNode(child)).join('')}
          </div>
        </form>
      </div>
    `;
  }

  generateRuntimeJS() {
    return `
(function() {
  // Показать форму
  document.querySelectorAll('.show-form-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      card.querySelector('.list-view').style.display = 'none';
      card.querySelector('.form-view').style.display = 'block';
    });
  });

  // Назад к списку
  document.querySelectorAll('.back-to-list').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      card.querySelector('.list-view').style.display = 'block';
      card.querySelector('.form-view').style.display = 'none';
    });
  });

  // Добавить из формы в список
  document.querySelectorAll('.submit-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.fieldset-card');
      const formView = card.querySelector('.form-view');
      const itemsList = card.querySelector('.items-list');
      
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
      item.innerHTML = data.map(d => 
        '<span>' + d.label + ': ' + d.value + '</span>'
      ).join('');
      
      itemsList.appendChild(item);
      
      // Очищаем и возвращаемся
      formView.querySelectorAll('input').forEach(f => f.value = '');
      formView.querySelectorAll('select').forEach(f => f.selectedIndex = 0);
      card.querySelector('.list-view').style.display = 'block';
      formView.style.display = 'none';
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
    const cardId = n.props['ид'] || `card-${++this.cardCounter}`;
    const tabNodes = n.children.filter(c => c.nodeType === 'MEANING' && c.key.startsWith('таб'));

    const listTab = tabNodes.find(t => t.id === 'список' || t.key.includes('список'));
    const formTab = tabNodes.find(t => t.id === 'добавить' || t.key.includes('добавить'));

    let listHTML = '';
    let formHTML = '';

    if (listTab) {
      this.parseKeyAndId(listTab);
      const listContent = this.renderNode(listTab);
      listHTML = `
        <div class="list-view">
          ${listContent}
          <button type="button" class="btn-secondary show-form-btn">+ Добавить</button>
        </div>`;
    }

    if (formTab) {
      this.parseKeyAndId(formTab);
      const formContent = this.renderNode(formTab);
      formHTML = `
        <div class="form-view">
          <div class="repeatable-item">
            <div class="repeatable-header">
              <span>Новая запись</span>
              <button type="button" class="btn-secondary remove-item" style="width:auto;padding:4px 8px;">✖</button>
            </div>
            ${formContent}
            <button type="button" class="btn-secondary submit-item" style="margin-top:12px;">Добавить</button>
          </div>
          <button type="button" class="btn-secondary back-to-list" style="margin-top:8px;">← Назад к списку</button>
        </div>`;
    }

    return listHTML + formHTML;
  }

  field(n, children) {
    const fieldType = n.type || 'текст';
    const label = n.parsedValue?.label || n.key || '';
    const placeholder = n.parsedValue?.placeholder || '';
    const required = n.parsedValue?.required;
    const isSelect = fieldType === 'выбор';

    const attrs = [];
    if (!isSelect) attrs.push(`type="${this.mapFieldType(fieldType)}"`);
    attrs.push(`name="${this.escapeHtml(n.id || n.key || label)}"`);
    if (placeholder) attrs.push(`placeholder="${this.escapeHtml(placeholder)}"`);
    if (required) attrs.push('required');

    if (isSelect) {
      return `
        <div class="input-group">
          <label>${this.escapeHtml(label)}</label>
          <select ${attrs.join(' ')}>${children}</select>
        </div>`;
    }

    return `
      <div class="input-group">
        <label>${this.escapeHtml(label)}</label>
        <input ${attrs.join(' ')} />
      </div>`;
  }

  button(n) {
    return ''; // Кнопки рендерятся в renderTabs
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