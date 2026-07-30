import { YarbpBasicRenderer } from "../YarbpBasicRenderer.js";

export class HTMLUIRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);

    this.renderers = [
      { test: (node) => node.key === 'группа' && node.type === 'форма', render: this.form },
      { test: (node) => node.key === 'группа', render: this.group },
      { test: (node) => node.key === 'поле', render: this.field },
      { test: (node) => node.key === 'кнопка', render: this.button },
      { test: (node) => node.key === 'надпись', render: this.label }
    ];

    this.uiContainer = null;
  }

  render() {
    this.AST = this.parser.getAST();
    const HTML = this.convert();

    const renderPane = this.renderTextarea.closest('#render-pane');

    // Скрываем текстовый редактор
    const editorContainer = this.renderHighlightDiv.closest('.editor-container');
    if (editorContainer) {
      editorContainer.style.display = 'none';
    }

    // Создаём UI-контейнер
    this.uiContainer = renderPane.querySelector('.ui-render-container');
    if (!this.uiContainer) {
      this.uiContainer = document.createElement('div');
      this.uiContainer.className = 'ui-render-container';
      renderPane.appendChild(this.uiContainer);
    }

    // Базовые стили контейнера из пропсов или дефолтные
    const isDark = document.body.classList.contains('dark');
    this.uiContainer.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      height: 100%;
      box-sizing: border-box;
      background: ${isDark ? '#2d2d2d' : '#ffffff'};
      color: ${isDark ? '#e0e0e0' : '#111827'};
      font-family: system-ui, -apple-system, sans-serif;
    `;

    this.uiContainer.innerHTML = HTML;
    this.syncRenderScroll();
  }

  syncRenderScroll() {}

  convert() {
    let result = '';
    this.AST.children.forEach(astNode => {
      result += this.renderNode(astNode);
    });
    return result;
  }

  renderNode(astNode) {
    if (astNode.nodeType !== 'MEANING') return '';

    this.parseKeyAndId(astNode);

    const props = {};
    let childrenHTML = '';

    if (astNode.children) {
      astNode.children.forEach(child => {
        if (child.nodeType === 'MEANING') {
          if (child.prefix === '.') {
            props[child.key] = child.value;
          } else {
            childrenHTML += this.renderNode(child);
          }
        }
      });
    }

    const parsedValue = this.parseSugaredValue(astNode.value);

    const normalized = {
      ...astNode,
      props,
      parsedValue
    };

    const renderer = this.renderers.find(r => r.test(normalized));

    if (renderer) {
      return renderer.render.call(this, normalized, childrenHTML);
    }

    return childrenHTML;
  }

  parseKeyAndId(astNode) {
    if (!astNode.key) return;

    let keyStr = astNode.key;

    const colonIndex = keyStr.indexOf(':');
    if (colonIndex !== -1) {
      astNode.type = keyStr.slice(colonIndex + 1);
      keyStr = keyStr.slice(0, colonIndex);
    }

    const hashIndex = keyStr.indexOf('#');
    if (hashIndex !== -1) {
      astNode.id = keyStr.slice(hashIndex + 1);
      astNode.key = keyStr.slice(0, hashIndex);
    } else {
      astNode.key = keyStr;
    }
  }

  parseSugaredValue(value) {
    if (typeof value !== 'string') return { raw: value };

    const parts = value.split('/').map(p => p.trim());
    const result = { raw: value };

    if (parts.length >= 1) result.label = parts[0];
    if (parts.length >= 2) {
      if (['*', 'да', 'yes', 'обязательно'].includes(parts[1])) {
        result.required = true;
      } else {
        result.placeholder = parts[1];
      }
    }
    if (parts.length >= 3) {
      if (['*', 'да', 'yes', 'обязательно'].includes(parts[2])) {
        result.required = true;
      } else {
        result.postfix = parts[2];
      }
    }

    return result;
  }

  // ------------------------------------------------------------
  // Стилевые утилиты (генерируют инлайн-стили из пропсов)
  // ------------------------------------------------------------

  buildStyles(props, baseStyles = {}) {
    const styles = { ...baseStyles };

    // Общие стилевые пропсы
    if (props['ширина']) styles.width = props['ширина'];
    if (props['высота']) styles.height = props['высота'];
    if (props['отступ']) styles.padding = props['отступ'];
    if (props['отступВнутри']) styles.padding = props['отступВнутри'];
    if (props['фон']) styles.background = props['фон'];
    if (props['цветТекста']) styles.color = props['цветТекста'];

    // Flex
    if (props['направление'] === 'вертикально') styles.flexDirection = 'column';
    if (props['направление'] === 'горизонтально') styles.display = 'flex';
    if (props['выравнивание']) styles.alignItems = props['выравнивание'];
    if (props['распределение']) styles.justifyContent = props['распределение'];

    // Grid
    if (props['сетка']) return props['сетка']; // возвращаем как есть

    // Gap
    if (props['зазор']) styles.gap = props['зазор'];

    // Границы
    if (props['обводка']) styles.border = `1px solid #${props['обводка']}`;
    if (props['скругление']) styles.borderRadius = props['скругление'];

    // Тени
    if (props['тень']) styles.boxShadow = props['тень'];

    return Object.entries(styles)
      .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
      .join('; ');
  }

  camelToKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  // ------------------------------------------------------------
  // Рендереры
  // ------------------------------------------------------------

  form(normalized, childrenHTML) {
    const { props, id } = normalized;

    const styles = [];
    const baseStyles = {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    };

    const customStyles = this.buildStyles(props, baseStyles);
    if (customStyles) styles.push(customStyles);

    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
    const idAttr = id ? ` id="${this.escapeHtml(id)}"` : '';

    return `<form${styleAttr}${idAttr}>${childrenHTML}</form>`;
  }

  group(normalized, childrenHTML) {
    const { props, id, rawValue } = normalized;

    const title = rawValue || props['заголовок'] || '';
    const isTile = props['плитка'] === 'да' || normalized.type === 'плитка';

    const baseStyles = {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: props['отступ'] || '16px',
      border: props['обводка'] ? `1px solid #${props['обводка']}` : '1px solid #e5e7eb',
      borderRadius: props['скругление'] || '12px',
      background: props['фон'] || (isTile ? '#ffffff' : '#f9fafb'),
      boxShadow: isTile ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
    };

    const isDark = document.body.classList.contains('dark');
    if (isDark && !props['фон']) {
      baseStyles.background = isTile ? '#4a4a4a' : '#3d3d3d';
      baseStyles.border = props['обводка'] ? `1px solid #${props['обводка']}` : '1px solid #444';
    }

    const customStyles = this.buildStyles(props, baseStyles);
    const styleAttr = customStyles ? ` style="${customStyles}"` : '';
    const idAttr = id ? ` id="${this.escapeHtml(id)}"` : '';

    const titleStyles = {
      fontWeight: '600',
      fontSize: '1.1rem',
      marginBottom: '4px',
      color: props['цветТекста'] || (isDark ? '#e0e0e0' : '#374151')
    };
    const titleStyleAttr = Object.entries(titleStyles)
      .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
      .join('; ');

    return `
      <div${styleAttr}${idAttr}>
        ${title ? `<div style="${titleStyleAttr}">${this.escapeHtml(title)}</div>` : ''}
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${childrenHTML}
        </div>
      </div>
    `;
  }

  field(normalized, childrenHTML) {
    const { props, parsedValue, type, key, id } = normalized;

    let fieldType = type;
    if (!fieldType && key && key.includes(':')) {
      fieldType = key.split(':')[1];
    }
    fieldType = fieldType || 'текст';

    const label = parsedValue?.label || props['имя'] || key || '';
    const placeholder = parsedValue?.placeholder || props['плейсхолдер'] || '';
    const required = parsedValue?.required || props['обязательный'] === 'да';
    const postfix = parsedValue?.postfix || props['постфикс'] || '';

    const isSelect = fieldType === 'выбор';
    const tagName = isSelect ? 'select' : 'input';

    const isDark = document.body.classList.contains('dark');

    // Стили поля
    const fieldStyles = {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    };

    const labelStyles = {
      fontSize: '0.875rem',
      fontWeight: '500',
      color: props['цветТекста'] || (isDark ? '#d0d0d0' : '#374151')
    };

    const inputStyles = {
      flex: '1',
      padding: props['отступВнутри'] || '10px 12px',
      border: props['обводка'] ? `1px solid #${props['обводка']}` : '1px solid #d1d5db',
      borderRadius: props['скругление'] || '8px',
      fontSize: '0.95rem',
      background: props['фон'] || (isDark ? '#2d2d2d' : '#ffffff'),
      color: props['цветТекста'] || (isDark ? '#e0e0e0' : 'inherit'),
      boxSizing: 'border-box'
    };

    if (props['ширинаПоля']) inputStyles.width = props['ширинаПоля'];

    const attrs = [];
    if (!isSelect) attrs.push(`type="${this.mapFieldType(fieldType)}"`);
    attrs.push(`name="${this.escapeHtml(id || key || label)}"`);
    if (placeholder) attrs.push(`placeholder="${this.escapeHtml(placeholder)}"`);
    if (required) attrs.push('required');
    if (props['автофокус'] === 'да') attrs.push('autofocus');
    if (props['хук']) attrs.push(`data-hook="${this.escapeHtml(props['хук'])}"`);
    if (props['значение']) attrs.push(`value="${this.escapeHtml(props['значение'])}"`);

    const fieldStyleAttr = this.buildStyles(props, fieldStyles);
    const labelStyleAttr = Object.entries(labelStyles)
      .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
      .join('; ');
    const inputStyleAttr = Object.entries(inputStyles)
      .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
      .join('; ');

    const postfixStyles = {
      fontSize: '0.875rem',
      color: isDark ? '#a0a0a0' : '#6b7280'
    };
    const postfixStyleAttr = Object.entries(postfixStyles)
      .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
      .join('; ');

    return `
      <div style="${fieldStyleAttr}">
        <label style="${labelStyleAttr}" class="${required ? 'required-star' : ''}">${this.escapeHtml(label)}</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <${tagName} style="${inputStyleAttr}" ${attrs.join(' ')}>
            ${isSelect ? childrenHTML : ''}
          </${tagName}>
          ${postfix ? `<span style="${postfixStyleAttr}">${this.escapeHtml(postfix)}</span>` : ''}
        </div>
      </div>
    `;
  }

  button(normalized, childrenHTML) {
    const { props, id, rawValue } = normalized;

    const label = rawValue || props['имя'] || 'Кнопка';
    const type = props['тип'] || 'button';
    const isDark = document.body.classList.contains('dark');

    const isPrimary = type === 'submit' || props['основная'] === 'да';

    const buttonStyles = {
      padding: props['отступВнутри'] || '10px 20px',
      background: props['фон'] || (isPrimary ? '#3b82f6' : (isDark ? '#4a4a4a' : '#f3f4f6')),
      color: props['цветТекста'] || (isPrimary ? '#ffffff' : (isDark ? '#e0e0e0' : '#374151')),
      border: props['обводка'] ? `1px solid #${props['обводка']}` : (isPrimary ? 'none' : '1px solid #d1d5db'),
      borderRadius: props['скругление'] || '8px',
      fontSize: '0.95rem',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background 0.2s, transform 0.1s'
    };

    if (props['ширина']) buttonStyles.width = props['ширина'];

    const styleAttr = this.buildStyles(props, buttonStyles);
    const idAttr = id ? ` id="${this.escapeHtml(id)}"` : '';

    return `<button type="${type}" style="${styleAttr}"${idAttr}>${this.escapeHtml(label)}</button>`;
  }

  label(normalized, childrenHTML) {
    const { props, id, rawValue } = normalized;

    const text = rawValue || props['текст'] || '';
    const isDark = document.body.classList.contains('dark');

    const styles = {
      fontSize: props['размерШрифта'] || '0.95rem',
      fontWeight: props['жирный'] === 'да' ? '600' : '400',
      color: props['цветТекста'] || (isDark ? '#e0e0e0' : '#374151'),
      margin: props['отступ'] || '0'
    };

    const styleAttr = this.buildStyles(props, styles);
    const idAttr = id ? ` id="${this.escapeHtml(id)}"` : '';

    return `<div style="${styleAttr}"${idAttr}>${this.escapeHtml(text)}</div>`;
  }

  mapFieldType(yarbpType) {
    const map = {
      'штрихкод': 'text', 'число': 'number', 'дата': 'date',
      'почта': 'email', 'телефон': 'tel', 'строка': 'text',
      'целое': 'number', 'текст': 'text', 'пароль': 'password'
    };
    return map[yarbpType] || 'text';
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}