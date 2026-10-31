/**
 * Общая часть «схемных» конвертеров: OpenAPI и JSON Schema.
 *
 * Разметка у них одна — `схема = <имя>` и `поле = <имя> .тип …`, — поэтому
 * построение полей живёт здесь, а конвертеры только раскладывают результат по
 * своим форматам. Иначе два набора типов и две трактовки `.обязательное`
 * разъехались бы через месяц.
 *
 * `ctx` — тонкий адаптер к конвертеру: `{ childValue, childValues, warn }`.
 */

/** Типы полей разметки → типы JSON Schema. */
export const FIELD_TYPES = Object.freeze({
  'строка':     'string',
  'целое':      'integer',
  'число':      'number',
  'логическое': 'boolean',
  'массив':     'array',
  'объект':     'object',
});

/** Значение-флаг: лексер превращает `да`/`нет` в boolean. */
export function isFlagOn(value) {
  return value === true || value === 'да' || value === 'yes';
}

/**
 * Атрибуты поля, которые понимает конвертер.
 *
 * Список нужен не для чтения, а для проверки: `поле = id .тпи целое` раньше
 * молча становилось строкой, а `.обязателное да` — молча переставало делать
 * поле обязательным. Опечатка в три буквы не должна менять схему без единого
 * слова (у методов OpenAPI такая проверка уже была).
 */
const FIELD_ATTRS = Object.freeze(new Set([
  'тип', 'элемент', 'формат', 'описание', 'пример', 'значение', 'обязательное',
]));

/**
 * Одно поле схемы → JSON Schema свойства.
 * Неизвестный тип — предупреждение и `string` (как BPMN-конвертер: не молчим).
 */
export function buildSchemaField(node, ctx) {
  for (const child of ctx.children(node)) {
    if (FIELD_ATTRS.has(child.key)) continue;
    ctx.warn(child, 'неизвестный атрибут поля «' + child.key + '»');
  }

  const typeValue = ctx.childValue(node, 'тип');
  const field = {};

  if (typeValue === null) {
    field.type = 'string';
  } else if (FIELD_TYPES[typeValue]) {
    field.type = FIELD_TYPES[typeValue];
  } else if (String(typeValue).startsWith('ссылка:')) {
    // `поле = клиент .тип ссылка:Клиент` → $ref на другую схему
    const prefix = ctx.refPrefix || '#/components/schemas/';
    field.$ref = prefix + String(typeValue).slice('ссылка:'.length);
  } else {
    ctx.warn(node, 'неизвестный тип поля «' + typeValue + '» — подставлен string');
    field.type = 'string';
  }

  if (field.type === 'array') {
    const itemType = ctx.childValue(node, 'элемент');
    const mapped = itemType === null ? 'string' : FIELD_TYPES[itemType];
    if (!mapped) {
      ctx.warn(node, 'неизвестный тип элемента «' + itemType + '» — подставлен string');
    }
    field.items = { type: mapped || 'string' };
  }

  const format = ctx.childValue(node, 'формат');
  if (format !== null) field.format = String(format);

  const description = ctx.childValue(node, 'описание');
  if (description !== null) field.description = String(description);

  const example = ctx.childValue(node, 'пример');
  if (example !== null) field.example = example;

  const values = ctx.childValues(node, 'значение');
  if (values.length) field.enum = values;

  return field;
}

/** `схема = <имя>` → объект JSON Schema с properties/required. */
export function buildSchemaObject(node, ctx) {
  const schema = { type: 'object', properties: {} };
  const required = [];
  const description = ctx.childValue(node, 'описание');

  for (const child of ctx.children(node)) {
    if (child.key === 'описание') continue;

    if (child.key !== 'поле') {
      ctx.warn(child, 'неизвестный узел «' + child.key + '» в схеме — пропущен');
      continue;
    }

    const name = child.value;
    if (!name) {
      ctx.warn(child, 'поле без имени — пропущено');
      continue;
    }

    // Одноимённые поля раньше молча перетирали друг друга.
    if (schema.properties[String(name)]) {
      ctx.warn(child, 'поле «' + name + '» объявлено дважды — берём последнее');
    }

    schema.properties[String(name)] = buildSchemaField(child, ctx);
    if (isFlagOn(ctx.childValue(child, 'обязательное'))) {
      required.push(String(name));
    }
  }

  if (!Object.keys(schema.properties).length) {
    ctx.warn(node, 'в схеме «' + node.value + '» нет полей');
  }
  if (required.length) schema.required = required;
  if (description !== null) schema.description = String(description);

  return schema;
}
