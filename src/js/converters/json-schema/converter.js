import { nodeTypes } from '../../core/YarbpParser.js';
import { buildSchemaObject } from '../shared/schemaFields.js';

// Конвертер в JSON Schema (draft 2020-12).

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const REF_PREFIX = '#/$defs/';

const SCHEMA_API_ATTRS = Object.freeze(new Set([
  'версия', 'описание', 'заголовок', 'ид', 'корень',
]));

const SCHEMA_SECTIONS = Object.freeze(new Set(['схемы']));

export class YarbpJsonSchemaConverter {
  constructor(ast, options = {}) {
    this.ast = ast;
    this.source = options.source || '';
    this.result = null;
    this.warnings = [];
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    const api = this.findApi(this.ast.children || []);
    const definitions = {};
    const order = [];

    for (const node of api ? this.apiNodes(api) : this.topLevelNodes()) {
      if (api && SCHEMA_API_ATTRS.has(node.key)) continue;
      if (node.key !== 'схема') {
        this.warn(node, 'неизвестный узел «' + node.key + '» — пропущен');
        continue;
      }

      const name = this.nodeText(node, ['имя', 'название']) || node.value;
      if (!name) {
        this.warn(node, 'схема без имени — пропущена');
        continue;
      }
      if (definitions[String(name)]) {
        this.warn(node, 'схема «' + name + '» объявлена дважды — берём последнюю');
      }

      definitions[String(name)] = buildSchemaObject(node, this.fieldContext());
      order.push(String(name));
    }

    this.result = {
      $schema: DRAFT,
      title: String(
        (api && this.nodeText(api, ['заголовок', 'имя', 'название'])) ||
        (api && api.value) || order[0] || 'Схема'
      ),
    };

    if (api) {
      const id = this.childValue(api, 'ид');
      if (id !== null) this.result.$id = String(id);

      const description = this.childValue(api, 'описание');
      if (description !== null) this.result.description = String(description);
    }

    if (!order.length) {
      this.warn(api || this.ast, 'в документе нет ни одной схемы — $defs пустой');
      return this.result;
    }

    this.result.$defs = definitions;

    const root = api ? this.childValue(api, 'корень') : null;
    const rootName = root === null ? order[0] : String(root);

    if (!definitions[rootName]) {
      this.warn(api || this.ast, 'корень «' + rootName + '» не объявлен — ' +
        'берём первую схему «' + order[0] + '»');
      this.result.$ref = REF_PREFIX + order[0];
    } else {
      this.result.$ref = REF_PREFIX + rootName;
    }

    return this.result;
  }


  findApi(children) {
    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;
      if (child.key === 'api') return child;
    }
    return null;
  }

  topLevelNodes() {
    return (this.ast.children || []).filter(node => node.nodeType === nodeTypes.MEANING);
  }

  apiNodes(api) {
    const result = [];

    for (const child of this.meaningChildren(api)) {
      if (child.prefix === '..' || SCHEMA_SECTIONS.has(child.key)) {
        for (const inner of this.meaningChildren(child)) result.push(inner);
      } else {
        result.push(child);
      }
    }

    return result;
  }

  fieldContext() {
    return {
      children: (node) => this.meaningChildren(node),
      childValue: (node, key) => this.childValue(node, key),
      childValues: (node, key) => this.childValues(node, key),
      warn: (node, message) => this.warn(node, message),
      refPrefix: REF_PREFIX,
    };
  }

  meaningChildren(node) {
    return (node.children || []).filter(child => child.nodeType === nodeTypes.MEANING);
  }

  childValue(node, key) {
    for (const child of this.meaningChildren(node)) {
      if (child.key === key) return child.value === undefined ? null : child.value;
    }
    return null;
  }

  nodeText(node, keys) {
    for (const key of keys || []) {
      const value = this.childValue(node, key);
      if (value !== null && value !== '') return value;
    }
    return '';
  }

  childValues(node, key) {
    const values = [];
    for (const child of this.meaningChildren(node)) {
      if (child.key === key && child.value !== undefined) values.push(child.value);
    }
    return values;
  }

  warn(node, message) {
    this.warnings.push({ line: this.lineAt(node), message });
  }

  lineAt(node) {
    const start = node && node.position ? node.position.start : undefined;
    if (!this.source || !Number.isFinite(start)) return 0;

    let line = 1;
    const limit = Math.min(start, this.source.length);
    for (let index = 0; index < limit; index++) {
      if (this.source[index] === '\n') line++;
    }
    return line;
  }
}
