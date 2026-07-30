import { nodeTypes, valueTypes } from '../YarbpParser.js';

export class YarbpJSONConverter {
  constructor(ast) {
    this.ast = ast;
    this.result = null;
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    const rootChildren = this.ast.children || [];

    if (rootChildren.length === 1) {
      this.result = this._convertNode(rootChildren[0]);
    } else if (rootChildren.length > 1) {
      this.result = rootChildren.map(node => this._convertNode(node));
    } else {
      this.result = {};
    }

    return this.result;
  };

  _convertNode(node) {
    if (!node || node.nodeType !== nodeTypes.MEANING) return null;

    const key = node.key;
    const hasKey = key !== undefined && key !== null && key !== '';

    if (!hasKey) { return this._convertNodeValue(node); }

    const nodeValue = this._convertNodeValue(node);
    return { [key]: nodeValue };
  };

  _convertNodeValue(node) {
    const valueType = node.valueType;

    switch (valueType) {
      case valueTypes.OBJECT:
        return this._convertObject(node);

      case valueTypes.ARRAY:
        return this._convertArray(node);

      case valueTypes.STRING:
      case valueTypes.BOOL:
      case valueTypes.NUMBER:
      case valueTypes.NULL:
        return node.value;

      default:
        return node.value ?? null;
    }
  };

  _convertObject(node) {
    const result = {};
    const children = node.children || [];

    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;

      const converted = this._convertNode(child);

      if (!child.key) { Object.assign(result, converted); }
      else { Object.assign(result, converted); }
    }

    return result;
  };

  _convertArray(node) {
    const result = [];
    const children = node.children || [];

    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;

      const converted = this._convertNode(child);

      if (!child.key) { result.push(converted); }
      else { result.push(converted); }
    }

    return result;
  };

}