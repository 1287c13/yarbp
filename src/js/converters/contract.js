/**
 * Контракт типового конвертера ЯРБП.
 *
 * Каждый конвертер — отдельный каталог `src/js/converters/<id>/` с
 * `index.js` (описание), `converter.js` (AST → результат), `renderer.js`
 * (вывод в панель результата), при необходимости `suggestions.js` и
 * вспомогательными файлами. Общий код, который переиспользуют два и более
 * конвертера, живёт только в `src/js/converters/shared/`.
 *
 * `defineConverter` замораживает описание и проверяет обязательные поля.
 * Реестр (`registry.js`) строит по нему карту «имя директивы → конвертер».
 */

const ID_RE = /^[a-z][a-z0-9-]*$/;

/**
 * @param {object} definition
 * @param {string} definition.id       стабильный id (`json`, `json-schema`, `ui`)
 * @param {string[]} definition.names  алиасы директивы `! как …` (нормализуются)
 * @param {string} [definition.title]  человекочитаемое имя
 * @param {string} [definition.description]
 * @param {Function|null} [definition.renderer]      класс рендерера для лёгких конвертеров
 * @param {Function|null} [definition.loadRenderer]  динамический импорт рендерера для тяжёлых конвертеров
 * @param {object|null} [definition.suggestions]     словарь подсказок
 * @returns {Readonly<object>}
 */
export function defineConverter(definition) {
  const source = definition || {};
  if (!source.id || !ID_RE.test(source.id)) {
    throw new Error('converter: id должен быть kebab-case строкой');
  }
  if (!Array.isArray(source.names) || !source.names.length) {
    throw new Error('converter "' + source.id + '": нужен непустой names[]');
  }
  if (!source.renderer && typeof source.loadRenderer !== 'function') {
    throw new Error('converter "' + source.id + '": нужен renderer или loadRenderer');
  }

  return Object.freeze({
    id: source.id,
    names: Object.freeze(source.names.slice()),
    title: source.title || source.id,
    description: source.description || '',
    renderer: source.renderer || null,
    loadRenderer: typeof source.loadRenderer === 'function'
      ? source.loadRenderer
      : null,
    suggestions: source.suggestions || null,
  });
}
