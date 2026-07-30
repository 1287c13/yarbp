import { nodeTypes, valueTypes } from '../YarbpParser.js';

export class YarbpXMLConverter {
  /**
   * @param {Object} ast - AST, полученный из YarbpParser
   * @param {boolean} pretty - добавлять отступы и переводы строк (по умолчанию true)
   */
  constructor(ast, pretty = true) {
    this.ast = ast;
    this.pretty = pretty;
    this.indentLevel = 0;
    this.indentString = '  ';
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== 'ROOT') {
      throw new Error('Invalid AST: root must be ROOT');
    }
    const rootChildren = this.ast.children || [];
    this.indentLevel = 0;
    return rootChildren.map(child => this._nodeToXML(child)).join('\n');
  }

  _indent() {
    return this.pretty ? this.indentString.repeat(this.indentLevel) : '';
  }

  _nodeToXML(node) {
    if (!node || (node.nodeType !== 'MEANING' && node.nodeType !== 'COMMENT')) return '';

    if (node.nodeType === 'COMMENT') {
      return this._indent() + `<!-- ${node.value} -->`;
    }

    const key = node.key;
    const hasKey = key !== undefined && key !== null && key !== '';
    const valueType = node.valueType;
    const children = node.children || [];

    if (!hasKey) {
      if (valueType && valueType !== valueTypes.OBJECT && valueType !== valueTypes.ARRAY) {
        const tagName = this._typeToTagName(valueType);
        return this._indent() + this._wrapPrimitive(tagName, node.value);
      }
      this.indentLevel++;
      const inner = children.map(ch => this._nodeToXML(ch)).join('\n');
      this.indentLevel--;
      return inner;
    }

    const tagName = this._escapeXml(key);
    const attrs = {};
    const childNodes = [];

    for (const child of children) {
      if (child.nodeType !== 'MEANING') continue;
      const childKey = child.key;
      const childPrefix = child.prefix;
      if (childKey && childPrefix === '.') {
        attrs[this._escapeXml(childKey)] = this._escapeAttrValue(child.value);
      } else {
        childNodes.push(child);
      }
    }

    let attrString = '';
    for (const [name, val] of Object.entries(attrs)) {
      attrString += ` ${name}="${val}"`;
    }

    let innerXML = '';
    if (childNodes.length > 0) {
      this.indentLevel++;
      innerXML = childNodes.map(ch => this._nodeToXML(ch)).join('\n');
      this.indentLevel--;
    } else if (node.value !== undefined && node.value !== null &&
               valueType !== valueTypes.OBJECT && valueType !== valueTypes.ARRAY) {
      innerXML = this._escapeXmlContent(node.value);
    }

    if (innerXML === '' && Object.keys(attrs).length === 0 && childNodes.length === 0 && !node.value) {
      return this._indent() + `<${tagName}${attrString}></${tagName}>`;
    }

    const hasChildren = childNodes.length > 0;
    const multiline = this.pretty && (hasChildren || innerXML.includes('\n'));

    if (multiline) {
      return this._indent() + `<${tagName}${attrString}>\n${innerXML}\n${this._indent()}</${tagName}>`;
    } else {
      return this._indent() + `<${tagName}${attrString}>${innerXML}</${tagName}>`;
    }
  }

  _typeToTagName(type) {
    const map = {
      [valueTypes.STRING]: 'string',
      [valueTypes.NUMBER]: 'number',
      [valueTypes.BOOL]: 'bool',
      [valueTypes.NULL]: 'null',
      [valueTypes.OBJECT]: 'object',
      [valueTypes.ARRAY]: 'array',
    };
    return map[type] || 'value';
  }

  _wrapPrimitive(tagName, value) {
    if (value === null || value === undefined) {
      return `<${tagName}></${tagName}>`;
    }
    return `<${tagName}>${this._escapeXmlContent(value)}</${tagName}>`;
  }

  _escapeXml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[<>&"']/g, (m) => {
      switch (m) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return m;
      }
    });
  }

  _escapeAttrValue(str) {
    return this._escapeXml(str);
  }

  _escapeXmlContent(str) {
    return this._escapeXml(str);
  }
}