export class XMLHighlighter {
  static CLASS_NAMES = {
    TAG: 'xml-tag',
    CLOSING_TAG: 'xml-closing-tag',
    NAMESPACE: 'xml-namespace',
    ATTRIBUTE: 'xml-attribute',
    ATTR_NAMESPACE: 'xml-attr-namespace',
    VALUE: 'xml-value',
    COMMENT: 'xml-comment',
    CDATA: 'xml-cdata',
    SPECIAL: 'xml-special',
  };

  constructor(code) {
    this.code = code;
  }

  highlight() {
    const tokenRegex = /(<[^>]*>)|([^<]+)/g;
    let result = '';
    let match;

    while ((match = tokenRegex.exec(this.code)) !== null) {
      const tag = match[1];
      const text = match[2];
      if (tag) {
        result += this._processTag(tag);
      } else if (text) {
        result += this._processText(text);
      }
    }
    return result;
  }

  _processText(text) {
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const entityRegex = /(&[a-zA-Z0-9#]+;)/g;
    return escaped.replace(entityRegex, match => `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">${match}</span>`);
  }

  _processTag(tag) {
    if (tag.startsWith('<!--') && tag.endsWith('-->')) {
      return `<span class="${XMLHighlighter.CLASS_NAMES.COMMENT}">${this._escapeHtml(tag)}</span>`;
    }
    if (tag.startsWith('<![CDATA[') && tag.endsWith(']]>')) {
      return `<span class="${XMLHighlighter.CLASS_NAMES.CDATA}">${this._escapeHtml(tag)}</span>`;
    }
    if (tag.startsWith('<?') && tag.endsWith('?>')) {
      return `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">${this._escapeHtml(tag)}</span>`;
    }

    const tagMatch = /^<(\/?)([^>\s]+)(\s+[^>]*)?>?$/.exec(tag);
    if (!tagMatch) return this._escapeHtml(tag);

    const closingSlash = tagMatch[1];
    const tagNameRaw = tagMatch[2];
    const attrsRaw = tagMatch[3] || '';

    let tagNameProcessed;
    if (closingSlash) {
      tagNameProcessed = `<span class="${XMLHighlighter.CLASS_NAMES.CLOSING_TAG}">${this._escapeHtml(tagNameRaw)}</span>`;
    } else {
      tagNameProcessed = this._processTagName(tagNameRaw);
    }

    const attrsProcessed = attrsRaw.trim() ? this._processAttributes(attrsRaw) : '';

    let result = `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}"><</span>`;
    if (closingSlash) {
      result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">${closingSlash}</span>`;
    }
    result += tagNameProcessed;
    if (attrsProcessed) result += ' ' + attrsProcessed;

    const isSelfClosing = tag.endsWith('/>') && !closingSlash;
    if (isSelfClosing) {
      result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">/</span>`;
    }
    result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">></span>`;

    return result;
  }

  _processTagName(name) {
    const colonIndex = name.indexOf(':');
    if (colonIndex === -1) {
      return `<span class="${XMLHighlighter.CLASS_NAMES.TAG}">${this._escapeHtml(name)}</span>`;
    }
    const namespace = name.substring(0, colonIndex + 1);
    const local = name.substring(colonIndex + 1);
    return `<span class="${XMLHighlighter.CLASS_NAMES.NAMESPACE}">${this._escapeHtml(namespace)}</span>` + `<span class="${XMLHighlighter.CLASS_NAMES.TAG}">${this._escapeHtml(local)}</span>`;
  }

  _processAttributes(attrsStr) {
    const trimmed = attrsStr.trim();
    const attrRegex = /([a-zA-Z_:][\w\-:.]*)\s*=\s*(["'])(.*?)\2/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = attrRegex.exec(trimmed)) !== null) {
      const fullMatch = match[0];
      const start = match.index;
      const attrNameRaw = match[1];
      const quote = match[2];
      const attrValue = match[3];

      if (start > lastIndex) {
        result += this._escapeHtml(trimmed.substring(lastIndex, start));
      }

      const attrNameProcessed = this._processAttributeName(attrNameRaw);
      const escapedValue = this._escapeHtml(attrValue);
      const valueSpan = `<span class="${XMLHighlighter.CLASS_NAMES.VALUE}">${escapedValue}</span>`;

      result += attrNameProcessed;
      result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">=</span>`;
      result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">${quote}</span>`;
      result += valueSpan;
      result += `<span class="${XMLHighlighter.CLASS_NAMES.SPECIAL}">${quote}</span>`;

      lastIndex = start + fullMatch.length;
    }

    if (lastIndex < trimmed.length) {
      result += this._escapeHtml(trimmed.substring(lastIndex));
    }

    return result;
  }

  _processAttributeName(name) {
    const colonIndex = name.indexOf(':');
    if (colonIndex === -1) {
      return `<span class="${XMLHighlighter.CLASS_NAMES.ATTRIBUTE}">${this._escapeHtml(name)}</span>`;
    }
    const namespace = name.substring(0, colonIndex + 1);
    const local = name.substring(colonIndex + 1);
    return `<span class="${XMLHighlighter.CLASS_NAMES.ATTR_NAMESPACE}">${this._escapeHtml(namespace)}</span>` + `<span class="${XMLHighlighter.CLASS_NAMES.ATTRIBUTE}">${this._escapeHtml(local)}</span>`;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}