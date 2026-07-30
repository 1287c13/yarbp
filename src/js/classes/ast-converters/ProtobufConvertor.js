import { nodeTypes, valueTypes } from '../YarbpParser.js';

export class YarbpProtoConverter {
  constructor(ast, pretty = true) {
    this.ast = ast;
    this.pretty = pretty;
    this.indentLevel = 0;
    this.indentString = '  ';
    this.lines = [];
    this.messages = [];
    this.enums = [];
    this.generatedMessageNames = new Set();
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== 'ROOT') {
      throw new Error('Invalid AST: root must be ROOT');
    }
    this.lines = [];
    this.indentLevel = 0;
    this.messages = [];
    this.enums = [];
    this.generatedMessageNames = new Set();

    if (this.ast.directives && this.ast.directives.length) {
      for (const dir of this.ast.directives) {
        if (dir.value.startsWith('syntax ')) {
          const version = dir.value.replace('syntax ', '').trim();
          this._addLine(`syntax = "${version}";`);
          this._addEmptyLine();
        }
      }
    }

    if (this.ast.comments && this.ast.comments.length) {
      this.ast.comments.forEach(cmt => {
        this._addLine(`// ${cmt.value.replace(/^--\s*/, '')}`);
      });
      this._addEmptyLine();
    }

    const rootChildren = this.ast.children || [];
    for (const child of rootChildren) {
      this._collectMessages(child);
    }

    for (const msg of this.messages) {
      this._renderMessage(msg);
      this._addEmptyLine();
    }

    for (const enumDef of this.enums) {
      this._renderEnum(enumDef);
      this._addEmptyLine();
    }

    return this.lines.join('\n');
  }

  _indent() {
    return this.pretty ? this.indentString.repeat(this.indentLevel) : '';
  }

  _addLine(line) {
    this.lines.push(this._indent() + line);
  }

  _addEmptyLine() {
    if (this.pretty && this.lines.length > 0 && this.lines[this.lines.length - 1] !== '') {
      this.lines.push('');
    }
  }

  _collectMessages(node) {
    if (!node || node.nodeType !== nodeTypes.MEANING) return;

    if (node.valueType === valueTypes.OBJECT && node.key) {
      if (!this.messages.some(m => m.key === node.key)) {
        this.messages.push(node);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        if (child.nodeType === nodeTypes.MEANING) {
          this._collectMessages(child);
        }
      }
    }

    if (node.valueType === valueTypes.ARRAY && node.children && node.children.length > 0) {
      this._createArrayElementMessage(node);
    }
  }

  _createArrayElementMessage(arrayNode) {
    let elementMessageName;
    if (arrayNode.type) {
      elementMessageName = arrayNode.type;
    } else {
      let baseName = arrayNode.key;
      let singularName = baseName.endsWith('s') ? baseName.slice(0, -1) : baseName;
      elementMessageName = singularName.charAt(0).toUpperCase() + singularName.slice(1);
    }

    if (this.generatedMessageNames.has(elementMessageName)) return;
    this.generatedMessageNames.add(elementMessageName);

    const elementMessage = {
      nodeType: nodeTypes.MEANING,
      key: elementMessageName,
      valueType: valueTypes.OBJECT,
      children: [],
      comments: arrayNode.comments || []
    };

    for (const child of arrayNode.children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;

      if (child.valueType === valueTypes.OBJECT && child.key) {
        const fieldType = child.type || (child.key.charAt(0).toUpperCase() + child.key.slice(1));
        const fieldNode = {
          nodeType: nodeTypes.MEANING,
          key: child.key,
          prefix: '.',
          type: fieldType,
          valueType: valueTypes.OBJECT,
          comments: child.comments || []
        };
        elementMessage.children.push(fieldNode);

        if (!this.messages.some(m => m.key === child.key)) {
          this.messages.push(child);
        }
      } else if (child.prefix === '.' || child.prefix === '..') {
        const fieldNode = { ...child };
        elementMessage.children.push(fieldNode);
      }
    }

    this.messages.push(elementMessage);
  }

  _renderMessage(node) {
    const messageName = node.key;
    this._emitComments(node.comments);
    this._addLine(`message ${messageName} {`);
    this.indentLevel++;

    const children = node.children || [];
    const fields = [];
    let fieldNumber = 1;

    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;
      if (child.prefix === '.' || child.prefix === '..') {
        const fieldInfo = this._prepareField(child, fieldNumber);
        if (fieldInfo) fields.push(fieldInfo);
        fieldNumber++;
      }
    }

    let maxLen = 0;
    for (const f of fields) {
      if (f.text.length > maxLen) maxLen = f.text.length;
    }

    for (const f of fields) {
      let line = f.text;
      if (f.comment) {
        const padding = maxLen - f.text.length + 2;
        line += ' '.repeat(padding) + '// ' + f.comment;
      }
      this._addLine(line);
    }

    this.indentLevel--;
    this._addLine('}');
  }

  _prepareField(node, fieldNumber) {
    const fieldName = node.key;
    const repeated = node.prefix === '..' ? 'repeated ' : '';

    let fieldType;

    if (node.type && node.type.startsWith('enum')) {
      let enumName;
      const match = node.type.match(/^enum\((\w+)\)$/);
      if (match) {
        enumName = match[1]; // имя из скобок
      } else {
        enumName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      }
      const enumValues = node.value ? node.value.trim().split(/\s+/) : [];
      if (!this.enums.some(e => e.name === enumName)) {
        this.enums.push({ name: enumName, values: enumValues, comments: node.comments || [] });
      }
      fieldType = enumName;
    }
    else if (node.type) {
      fieldType = node.type;
    }
    else if (node.valueType === valueTypes.ARRAY && node.children && node.children.length > 0) {
      if (node.type) {
        fieldType = node.type;
      } else {
        let baseName = node.key;
        let singularName = baseName.endsWith('s') ? baseName.slice(0, -1) : baseName;
        fieldType = singularName.charAt(0).toUpperCase() + singularName.slice(1);
      }
    }
    else {
      fieldType = this._mapValueType(node.valueType) || 'string';
    }

    const lineWithoutComment = `${repeated}${fieldType} ${fieldName} = ${fieldNumber};`;

    let commentText = '';
    if (node.comments && node.comments.length > 0) {
      commentText = node.comments[0].value.replace(/^--\s*/, '');
    }

    return { text: lineWithoutComment, comment: commentText };
  }

  _mapValueType(vt) {
    const map = {
      [valueTypes.STRING]: 'string',
      [valueTypes.NUMBER]: 'int32',
      [valueTypes.BOOL]: 'bool',
    };
    return map[vt];
  }

  _renderEnum(enumDef) {
    this._emitComments(enumDef.comments);
    this._addLine(`enum ${enumDef.name} {`);
    this.indentLevel++;
    let valNum = 0;
    for (const val of enumDef.values) {
      this._addLine(`${val} = ${valNum};`);
      valNum++;
    }
    this.indentLevel--;
    this._addLine('}');
  }

  _emitComments(comments) {
    if (!comments || !comments.length) return;
    comments.forEach(cmt => {
      const text = cmt.value.replace(/^--\s*/, '');
      this._addLine(`// ${text}`);
    });
  }
}