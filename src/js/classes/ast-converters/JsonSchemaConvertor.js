import { nodeTypes } from '../YarbpParser.js';
import { buildSchemaObject } from './schemaFields.js';

/**
 * Конвертер в JSON Schema (draft 2020-12).
 *
 * Та же разметка, что у OpenAPI (`схема` + `поле`), но выход — схема данных, а
 * не контракт API: её понимают валидаторы, редакторы JSON и генераторы типов.
 * Полезно, когда документ описывает структуру payload'а, а не эндпоинты.
 *
 *     ! как схема
 *     api = Заказ .версия 1 .описание "Заказ покупателя"
 *       ..схемы
 *         схема = Заказ
 *           поле = id .тип целое .обязательное да
 *           поле = client .тип ссылка:Клиент
 *         схема = Клиент
 *           поле = name .тип строка
 *
 * `$defs` — все схемы документа, корень — `.корень <имя>` (по умолчанию первая
 * схема). Непонятное — в `warnings`, как в остальных конвертерах.
 */

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const REF_PREFIX = '#/$defs/';

/** Атрибуты api — читаются через childValue, руками не обходятся. */
const SCHEMA_API_ATTRS = Object.freeze(new Set([
  'версия', 'описание', 'заголовок', 'ид', 'корень',
]));

/** Секции, которые разворачиваем (`..схемы`). */
const SCHEMA_SECTIONS = Object.freeze(new Set(['схемы']));

export class YarbpJsonSchemaConverter {
  /**
   * @param {object} ast — корень AST
   * @param {{source?: string}} [options] — исходный текст (номера строк)
   */
  constructor(ast, options = {}) {
    this.ast = ast;
    this.source = options.source || '';
    this.result = null;
    /** Предупреждения: `{ line, message }[]` — читается после convert(). */
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

      const name = node.value;
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
        (api && this.childValue(api, 'заголовок')) ||
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

  /* ---------------- AST ---------------- */

  findApi(children) {
    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;
      if (child.key === 'api') return child;
    }
    return null;
  }

  /** Схемы можно писать прямо в корне документа, без `api`. */
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
