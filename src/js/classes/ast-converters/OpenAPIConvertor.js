import { nodeTypes } from '../YarbpParser.js';

/**
 * Конвертер в OpenAPI 3.0 (JSON).
 *
 * Это «выход в мир»: одна и та же разметка описывает и схему процесса, и
 * контракт REST API, а результат открывается Swagger UI, Postman, генераторами
 * клиентов. Ядро языка не трогаем — только читаем AST.
 *
 * Разметка (обязателен только `api`):
 *
 *     ! как openapi
 *     api = Заказы .версия 1.0.0 .описание "API заказов"
 *       сервер = https://api.example.com/v1
 *       путь = /orders .описание "Заказы"
 *         метод = get .операция "Список заказов" .ответ 200
 *         метод = post .операция "Создать заказ" .ответ 201 .запрос Заказ
 *       схема = Заказ
 *         поле = id .тип целое .обязательное да .описание "Номер заказа"
 *         поле = status .тип строка .значение new .значение paid
 *
 * Принцип тот же, что в BPMN-конвертере: непонятное не теряется молча — в
 * `warnings` попадает строка и понятный текст.
 */

/** Типы полей разметки → типы JSON Schema (OpenAPI 3.0). */
const FIELD_TYPES = Object.freeze({
  'строка':     'string',
  'целое':      'integer',
  'число':      'number',
  'логическое': 'boolean',
  'массив':     'array',
  'объект':     'object',
});

/** Коды ответов → описание по умолчанию. */
const RESPONSE_TEXT = Object.freeze({
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
});

/** Значение-флаг: лексер превращает `да`/`нет` в boolean. */
function isFlagOn(value) {
  return value === true || value === 'да' || value === 'yes';
}

/** Атрибуты метода — всё остальное в методе считается опечаткой. */
const OPENAPI_METHOD_KEYS = Object.freeze(new Set([
  'операция', 'ответ', 'запрос', 'тег', 'обязательное', 'ид',
]));

/** Секции (`..пути`, `..схемы`): контейнеры, которые конвертер разворачивает. */
const OPENAPI_SECTIONS = Object.freeze(new Set(['пути', 'схемы', 'серверы']));

/** Атрибуты api — читаются через childValue, руками не обходятся. */
const OPENAPI_API_ATTRS = Object.freeze(new Set(['версия', 'описание', 'заголовок', 'ид']));

export class YarbpOpenAPIConverter {
  /**
   * @param {object} ast — корень AST
   * @param {{source?: string}} [options] — исходный текст (номера строк в предупреждениях)
   */
  constructor(ast, options = {}) {
    this.ast = ast;
    this.source = options.source || '';
    this.result = null;
    /** Предупреждения сборки: `{ line, message }[]` — читается после convert(). */
    this.warnings = [];
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    this.result = {
      openapi: '3.0.3',
      info: { title: '', version: '' },
      paths: {},
    };

    const api = this.findApi(this.ast.children || []);
    if (!api) {
      this.warn(this.ast, 'нет узла «api» — OpenAPI собрать не из чего');
      return this.result;
    }

    const version = this.childValue(api, 'версия');
    const description = this.childValue(api, 'описание');

    this.result.info.title = String(this.childValue(api, 'заголовок') || api.value || '');
    this.result.info.version = version === null ? '0.0.0' : String(version);
    if (version === null) {
      this.warn(api, 'у api нет .версия — подставлено 0.0.0');
    }
    if (description !== null) this.result.info.description = String(description);

    const servers = [];
    const schemas = {};
    const paths = {};

    // секции (`..пути`, `..схемы`) разворачиваем: конвертеру важен только тип узла
    for (const node of this.apiNodes(api)) {
      if (OPENAPI_API_ATTRS.has(node.key)) continue;

      if (node.key === 'сервер') {
        const url = node.value;
        if (!url) this.warn(node, 'сервер без адреса — пропущен');
        else servers.push({ url: String(url) });
      } else if (node.key === 'путь') {
        const path = node.value;
        if (!path || !String(path).startsWith('/')) {
          this.warn(node, 'путь должен начинаться с «/»: «' + (path || '') + '»');
          continue;
        }
        paths[String(path)] = this.buildPath(node);
      } else if (node.key === 'схема') {
        const name = node.value;
        if (!name) {
          this.warn(node, 'схема без имени — пропущена');
          continue;
        }
        schemas[String(name)] = this.buildSchema(node);
      } else if (node.key !== 'api') {
        this.warn(node, 'неизвестный узел «' + node.key + '» в api — пропущен');
      }
    }

    if (servers.length) this.result.servers = servers;
    this.result.paths = paths;
    if (Object.keys(schemas).length) {
      this.result.components = { schemas };
    }

    if (!Object.keys(paths).length) {
      this.warn(api, 'в api нет ни одного пути — paths получился пустым');
    }

    this.checkRefs(api);

    return this.result;
  }

  /* ---------------- api → пути ---------------- */

  buildPath(node) {
    const ops = {};
    const description = this.childValue(node, 'описание');

    for (const child of this.meaningChildren(node)) {
      if (child.key === 'описание') continue;

      if (child.key !== 'метод') {
        this.warn(child, 'неизвестный узел «' + child.key + '» в пути — пропущен');
        continue;
      }

      const verb = String(child.value || '').toLowerCase();
      if (!verb) {
        this.warn(child, 'метод без имени (get/post/…) — пропущен');
        continue;
      }
      if (ops[verb]) {
        this.warn(child, 'метод «' + verb + '» уже описан в этом пути — берём последний');
      }

      ops[verb] = this.buildOperation(child);
    }

    if (!Object.keys(ops).length) {
      this.warn(node, 'у пути «' + node.value + '» нет ни одного метода');
    }

    const result = {};
    if (description !== null) result.description = String(description);
    Object.assign(result, ops);
    return result;
  }

  buildOperation(node) {
    const operation = {};
    const summary = this.childValue(node, 'операция');
    if (summary !== null) operation.summary = String(summary);

    const tags = this.childValues(node, 'тег');
    if (tags.length) operation.tags = tags.map(String);

    const bodySchema = this.childValue(node, 'запрос');
    if (bodySchema !== null) {
      operation.requestBody = {
        required: isFlagOn(this.childValue(node, 'обязательное')),
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/' + bodySchema } },
        },
      };
    }

    const responses = {};
    for (const code of this.childValues(node, 'ответ')) {
      const key = String(code);
      if (!/^\d{3}$/.test(key)) {
        this.warn(node, 'код ответа должен быть трёхзначным: «' + key + '»');
        continue;
      }
      responses[key] = { description: RESPONSE_TEXT[Number(key)] || '' };
    }

    if (!Object.keys(responses).length) {
      this.warn(node, 'у метода нет ни одного .ответ — подставлен 200 по умолчанию');
      responses['200'] = { description: RESPONSE_TEXT[200] };
    }

    operation.responses = responses;
    return operation;
  }

  /* ---------------- api → схемы ---------------- */

  buildSchema(node) {
    const schema = { type: 'object', properties: {} };
    const required = [];
    const description = this.childValue(node, 'описание');

    for (const child of this.meaningChildren(node)) {
      if (child.key === 'описание') continue;

      if (child.key !== 'поле') {
        this.warn(child, 'неизвестный узел «' + child.key + '» в схеме — пропущен');
        continue;
      }

      const name = child.value;
      if (!name) {
        this.warn(child, 'поле без имени — пропущено');
        continue;
      }

      schema.properties[String(name)] = this.buildField(child);
      if (isFlagOn(this.childValue(child, 'обязательное'))) {
        required.push(String(name));
      }
    }

    if (!Object.keys(schema.properties).length) {
      this.warn(node, 'в схеме «' + node.value + '» нет полей');
    }
    if (required.length) schema.required = required;
    if (description !== null) schema.description = String(description);

    return schema;
  }

  buildField(node) {
    const typeValue = this.childValue(node, 'тип');
    const field = {};

    if (typeValue === null) {
      field.type = 'string';
    } else if (FIELD_TYPES[typeValue]) {
      field.type = FIELD_TYPES[typeValue];
    } else if (String(typeValue).startsWith('ссылка:')) {
      // `поле = клиент .тип ссылка:Клиент` → $ref на другую схему
      field.$ref = '#/components/schemas/' + String(typeValue).slice('ссылка:'.length);
    } else {
      this.warn(node, 'неизвестный тип поля «' + typeValue + '» — подставлен string');
      field.type = 'string';
    }

    if (field.type === 'array') {
      const itemType = this.childValue(node, 'элемент');
      const mapped = itemType === null ? 'string' : FIELD_TYPES[itemType];
      if (!mapped) {
        this.warn(node, 'неизвестный тип элемента «' + itemType + '» — подставлен string');
      }
      field.items = { type: mapped || 'string' };
    }

    const format = this.childValue(node, 'формат');
    if (format !== null) field.format = String(format);

    const description = this.childValue(node, 'описание');
    if (description !== null) field.description = String(description);

    const example = this.childValue(node, 'пример');
    if (example !== null) field.example = example;

    const values = this.childValues(node, 'значение');
    if (values.length) field.enum = values;

    return field;
  }

  /* ---------------- проверки ссылок ---------------- */

  checkRefs(api) {
    const known = new Set();
    for (const node of this.apiNodes(api)) {
      if (node.key === 'схема' && node.value) known.add(String(node.value));
    }

    for (const node of this.apiNodes(api)) {
      // `поле = клиент .тип ссылка:Клиент` — ссылка должна куда-то вести
      if (node.key === 'схема') {
        for (const field of this.meaningChildren(node)) {
          if (field.key !== 'поле') continue;
          const type = this.childValue(field, 'тип');
          if (typeof type !== 'string' || !type.startsWith('ссылка:')) continue;
          const target = type.slice('ссылка:'.length);
          if (!known.has(target)) {
            this.warn(field, 'поле ссылается на неизвестную схему «' + target + '»');
          }
        }
        continue;
      }

      if (node.key !== 'путь') continue;
      for (const method of this.meaningChildren(node)) {
        if (method.key !== 'метод') continue;
        const ref = this.childValue(method, 'запрос');
        if (ref !== null && !known.has(String(ref))) {
          this.warn(method, 'запрос ссылается на неизвестную схему «' + ref + '»');
        }
      }
      for (const method of this.meaningChildren(node)) {
        if (method.key !== 'метод') continue;
        const ignored = this.meaningChildren(method)
          .find(child => !OPENAPI_METHOD_KEYS.has(child.key));
        if (ignored) {
          this.warn(ignored, 'неизвестный атрибут метода «' + ignored.key + '»');
        }
      }
    }
  }

  /* ---------------- AST ---------------- */

  /** Узел `api` — прямой ребёнок корня документа. */
  findApi(children) {
    for (const child of children) {
      if (child.nodeType !== nodeTypes.MEANING) continue;
      if (child.key === 'api') return child;
    }
    return null;
  }

  /**
   * Содержимое api с развёрнутыми секциями.
   *
   * Секция (`..пути`, `..схемы`) — это контейнер для читаемости: конвертеру
   * важен тип узла, а не то, на каком уровне его написали. Внутрь обычных узлов
   * (путь, схема) не спускаемся — там своя логика.
   */
  apiNodes(api) {
    const result = [];

    for (const child of this.meaningChildren(api)) {
      if (this.isSection(child)) {
        for (const inner of this.meaningChildren(child)) result.push(inner);
      } else {
        result.push(child);
      }
    }

    return result;
  }

  isSection(node) {
    return node.prefix === '..' || OPENAPI_SECTIONS.has(node.key);
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
