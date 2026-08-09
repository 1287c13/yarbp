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
      { test: (node) => node.key === 'таб', render: this.tab }
    ];
  }

  generateHTML(ast) {
    if (!ast || !ast.children) return '';
    return ast.children.map(child => this.renderNode(child)).join('');
  }

  generateRuntimeJS() {
    return `
(function() {
  console.log('YARBP Runtime started');
})();`;
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
    const normalized = { ...astNode, props, parsedValue };
    const renderer = this.renderers.find(r => r.test(normalized));

    return renderer ? renderer.render.call(this, normalized, childrenHTML) : childrenHTML;
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
    const parts = value.split('/').map(p => p.trim());
    const result = { raw: value };
    if (parts.length >= 1) result.label = parts[0];
    if (parts.length >= 2) {
      if (['*', 'да', 'yes', 'обязательно'].includes(parts[1])) result.required = true;
      else result.placeholder = parts[1];
    }
    if (parts.length >= 3 && ['*', 'да', 'yes', 'обязательно'].includes(parts[2])) result.required = true;
    return result;
  }

  buildStyles(props, base = {}) {
    const styles = { ...base };

    if (props['ширина']) styles.width = props['ширина'];
    if (props['высота']) styles.height = props['высота'];
    if (props['отступ']) styles.padding = props['отступ'];
    if (props['фон']) styles.background = '#' + props['фон'];
    if (props['цветТекста']) styles.color = '#' + props['цветТекста'];
    if (props['направление'] === 'вертикально') styles.flexDirection = 'column';
    if (props['направление'] === 'горизонтально') styles.flexDirection = 'row';
    if (props['зазор']) styles.gap = props['зазор'];
    if (props['обводка']) styles.border = '1px solid #' + props['обводка'];
    if (props['скругление']) styles.borderRadius = props['скругление'];
    if (props['тень']) styles.boxShadow = props['тень'];

    if (props['сетка']) return props['сетка'];

    return Object.entries(styles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // РЕНДЕРЕРЫ

  form(n, children) {
    const styles = this.buildStyles(n.props, {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    });
    const id = n.id ? ` id="${this.escapeHtml(n.id)}"` : '';
    return `<div style="${styles}"${id}>${children}</div>`;
  }

  group(n, children) {
    const title = n.props['заголовок'] || '';
    const isTile = n.props['плитка'] === 'да' || n.type === 'плитка';

    const defaultBg = n.props['фон'] ? null : (isTile
      ? (this.isDark ? '#4a4a4a' : '#ffffff')
      : (this.isDark ? '#3d3d3d' : '#f9fafb'));
    const defaultBorder = this.isDark ? '#444' : '#e5e7eb';
    const defaultText = this.isDark ? '#e0e0e0' : '#374151';

    const baseStyles = {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: n.props['отступ'] || '16px',
      border: n.props['обводка'] ? `1px solid #${n.props['обводка']}` : `1px solid ${defaultBorder}`,
      borderRadius: n.props['скругление'] || '12px',
      background: n.props['фон'] ? '#' + n.props['фон'] : defaultBg,
      boxShadow: isTile && !this.isDark ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
    };

    const styles = this.buildStyles(n.props, baseStyles);
    const id = n.id ? ` id="${this.escapeHtml(n.id)}"` : '';

    const titleStyles = {
      fontWeight: '600',
      fontSize: '1.1rem',
      marginBottom: '4px',
      color: n.props['цветТекста'] ? '#' + n.props['цветТекста'] : defaultText
    };
    const titleStyleAttr = Object.entries(titleStyles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ');

    const titleHtml = title ?
      `<div style="${titleStyleAttr}">${this.escapeHtml(title)}</div>` : '';

    return `
      <div style="${styles}"${id}>
        ${titleHtml}
        ${children}
      </div>
    `;
  }

  field(n, children) {
    const fieldType = n.type || (n.key?.includes(':') ? n.key.split(':')[1] : 'текст');
    const label = n.parsedValue?.label || n.props['имя'] || n.key || '';
    const placeholder = n.parsedValue?.placeholder || n.props['плейсхолдер'] || '';
    const required = n.parsedValue?.required || n.props['обязательный'] === 'да';
    const postfix = n.parsedValue?.postfix || n.props['постфикс'] || '';
    const isSelect = fieldType === 'выбор';
    const tag = isSelect ? 'select' : 'input';

    const defaultBg = this.isDark ? '#2d2d2d' : '#ffffff';
    const defaultBorder = this.isDark ? '#555' : '#d1d5db';
    const defaultText = this.isDark ? '#e0e0e0' : '#111827';
    const labelColor = this.isDark ? '#d0d0d0' : '#374151';

    const inputStyles = this.buildStyles(n.props, {
      flex: '1',
      padding: n.props['отступВнутри'] || '10px 12px',
      border: n.props['обводка'] ? `1px solid #${n.props['обводка']}` : `1px solid ${defaultBorder}`,
      borderRadius: n.props['скругление'] || '8px',
      fontSize: '0.95rem',
      background: n.props['фон'] ? '#' + n.props['фон'] : defaultBg,
      color: n.props['цветТекста'] ? '#' + n.props['цветТекста'] : defaultText,
      boxSizing: 'border-box'
    });

    if (n.props['ширинаПоля']) inputStyles.width = n.props['ширинаПоля'];

    const attrs = [];
    if (!isSelect) attrs.push(`type="${this.mapFieldType(fieldType)}"`);
    attrs.push(`name="${this.escapeHtml(n.id || n.key || label)}"`);
    if (placeholder) attrs.push(`placeholder="${this.escapeHtml(placeholder)}"`);
    if (required) attrs.push('required');
    if (n.props['автофокус'] === 'да') attrs.push('autofocus');
    if (n.props['хук']) attrs.push(`data-hook="${this.escapeHtml(n.props['хук'])}"`);
    if (n.props['значение']) attrs.push(`value="${this.escapeHtml(n.props['значение'])}"`);

    const labelStyles = {
      fontSize: '0.875rem',
      fontWeight: '500',
      color: n.props['цветТекста'] ? '#' + n.props['цветТекста'] : labelColor
    };
    const labelStyleAttr = Object.entries(labelStyles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ');

    const postfixStyles = {
      fontSize: '0.875rem',
      color: this.isDark ? '#a0a0a0' : '#6b7280'
    };
    const postfixStyleAttr = Object.entries(postfixStyles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ');

    const fieldStyleAttr = this.buildStyles(n.props, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    });

    return `
      <div style="${fieldStyleAttr}">
        <label style="${labelStyleAttr}" class="${required ? 'required-star' : ''}">${this.escapeHtml(label)}</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <${tag} style="${inputStyles}" ${attrs.join(' ')}>
            ${isSelect ? children : ''}
          </${tag}>
          ${postfix ? `<span style="${postfixStyleAttr}">${this.escapeHtml(postfix)}</span>` : ''}
        </div>
      </div>
    `;
  }

  button(n) {
    const label = n.rawValue || n.props['имя'] || 'Кнопка';
    const type = n.props['тип'] || 'button';
    const isPrimary = type === 'submit' || n.props['основная'] === 'да';

    const baseStyles = {
      padding: n.props['отступВнутри'] || '10px 20px',
      background: n.props['фон'] ? '#' + n.props['фон'] : (isPrimary ? '#3b82f6' : (this.isDark ? '#4a4a4a' : '#f3f4f6')),
      color: n.props['цветТекста'] ? '#' + n.props['цветТекста'] : (isPrimary ? '#ffffff' : (this.isDark ? '#e0e0e0' : '#374151')),
      border: n.props['обводка'] ? `1px solid #${n.props['обводка']}` : (isPrimary ? 'none' : `1px solid ${this.isDark ? '#666' : '#d1d5db'}`),
      borderRadius: n.props['скругление'] || '8px',
      fontSize: '0.95rem',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background 0.2s, transform 0.1s'
    };

    if (n.props['ширина']) baseStyles.width = n.props['ширина'];

    const styles = this.buildStyles(n.props, baseStyles);
    const attrs = [`type="${type}"`];
    if (n.id) attrs.push(`id="${this.escapeHtml(n.id)}"`);
    if (n.props['действие']) attrs.push(`data-action="${this.escapeHtml(n.props['действие'])}"`);

    return `<button style="${styles}" ${attrs.join(' ')}>${this.escapeHtml(label)}</button>`;
  }

  label(n) {
    const text = n.rawValue || n.props['текст'] || '';
    const styles = this.buildStyles(n.props, {
      fontSize: n.props['размерШрифта'] || '0.95rem',
      fontWeight: n.props['жирный'] === 'да' ? '600' : '400',
      margin: n.props['отступ'] || '0',
      color: this.isDark ? '#e0e0e0' : '#374151'
    });
    const id = n.id ? ` id="${this.escapeHtml(n.id)}"` : '';
    return `<div style="${styles}"${id}>${this.escapeHtml(text)}</div>`;
  }

  tabs(n, children) {
    const styles = this.buildStyles(n.props, {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    });
    const id = n.id ? ` id="${this.escapeHtml(n.id)}"` : '';
    return `<div style="${styles}"${id}>${children}</div>`;
  }

  tab(n, children) {
    const title = n.rawValue || n.props['заголовок'] || '';
    const defaultBorder = this.isDark ? '#444' : '#e5e7eb';

    const styles = this.buildStyles(n.props, {
      padding: n.props['отступ'] || '12px',
      border: n.props['обводка'] ? `1px solid #${n.props['обводка']}` : `1px solid ${defaultBorder}`,
      borderRadius: n.props['скругление'] || '8px'
    });
    const id = n.id ? ` id="${this.escapeHtml(n.id)}"` : '';

    const titleStyles = {
      fontWeight: '600',
      marginBottom: '8px',
      color: this.isDark ? '#e0e0e0' : '#374151'
    };
    const titleStyleAttr = Object.entries(titleStyles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ');

    return `
      <div style="${styles}"${id}>
        <div style="${titleStyleAttr}">${this.escapeHtml(title)}</div>
        ${children}
      </div>
    `;
  }

  mapFieldType(t) {
    const m = {
      'штрихкод': 'text',
      'число': 'number',
      'дата': 'date',
      'почта': 'email',
      'телефон': 'tel',
      'строка': 'text',
      'целое': 'number',
      'текст': 'text'
    };
    return m[t] || 'text';
  }
}