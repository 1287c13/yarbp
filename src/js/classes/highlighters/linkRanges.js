import { TokenTypes } from '../../core/YarbpLexer.js';

/**
 * Ссылки и макросы, которые фактически сработали при сборке AST.
 *
 * Подсвечивать «просто похожие» конструкции бессмысленно: цвет должен
 * отвечать на вопрос «что из этого реально на что-то сослалось». Поэтому
 * правила повторяют `core/macroPostprocess.js`, но по токенам:
 *
 * - `(( имя ))` вне макроса красится, только если ключ нулевого уровня с
 *   таким именем существует (иначе подстановка не состоялась);
 * - ключ нулевого уровня, который подставили в такую ссылку, красится как
 *   источник: это визуальная пара к ссылке (обычно ключ после подстановки
 *   уходит из вывода);
 * - объявление `@имя-макроса` красится всегда;
 * - внутри определения макроса места подстановки не красятся вообще: в теле
 *   макроса их заведомо много и они там ожидаемы, цвет превращается в шум.
 *   Цвет остаётся признаком «вещь верхнего уровня реально используется
 *   ссылкой или вызовом».
 *
 * Модуль сознательно не берёт AST: у узлов парсера `position` указывает на
 * ключ, а не на значение, плюс после раскрытия макросов и импорта в дереве
 * встречаются клоны с чужими позициями. Токены же всегда лежат в текущем
 * тексте, поэтому диапазоны для подсветки берутся из них и из исходника.
 */

/** Классы подсветки ссылок. Стили — `src/css/editor.css`. */
export const LinkCSSClasses = Object.freeze({
  REFERENCE: 'ide-code-ref',            // (( имя )) с найденным ключом
  SOURCE: 'ide-code-ref-source',        // ключ верхнего уровня, ушедший в ссылку
  MACRO: 'ide-code-macro'               // объявление @макроса
});

/** Имена совпадают с регулярками `macroPostprocess.js` (unicode-имена). */
const MACRO_DEFINITION = /^@[\p{L}\p{N}_-]+$/u;
const MACRO_CALL = /^([\p{L}\p{N}_-]+)(?:\(([\p{L}\p{N}_-]+)\))?$/u;
const PLACEHOLDER = /\(\(\s*([^\s()]+)\s*\)\)/g;

const KEY_TYPES = new Set([
  TokenTypes.OBJECT,
  TokenTypes.ARRAY,
  TokenTypes.PRIMITIVE
]);

/**
 * Рамки = уровни обхода парсера: `SCOPE_IN`/`SCOPE_OUT` лексер ставит ровно
 * там, где парсер уходит в рекурсию. Владелец рамки — первый объект/массив в
 * ней (он же становится ключом узла этого уровня), а ключи рамки — дети этого
 * узла.
 */
function buildFrames(tokens) {
  const frameOf = new Array(tokens.length).fill(null);
  const frames = [];

  let current = null;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token.type === TokenTypes.SCOPE_IN) {
      current = { owner: null, ownerIndex: -1, parent: current, keys: [], children: [] };
      if (current.parent) current.parent.children.push(current);
      frames.push(current);
      frameOf[index] = current;
      continue;
    }

    if (token.type === TokenTypes.SCOPE_OUT) {
      current = current ? current.parent : null;
      continue;
    }

    frameOf[index] = current;
    if (!current) continue;

    if (KEY_TYPES.has(token.type)) {
      if (!current.owner) {
        current.owner = token;
        current.ownerIndex = index;
      }
      current.keys.push({ token, index });
    }
  }

  return { frameOf, frames };
}

/** Нулевой отступ: ключ стоит в начале строки (как `isZeroLevelNode`). */
function isZeroLevel(sourceText, token) {
  const lineStart = sourceText.lastIndexOf('\n', token.start - 1) + 1;
  return token.start === lineStart;
}

/** Имя из `@имя` или null, если это не объявление макроса. */
function macroDefinitionName(token) {
  if (!token || token.type !== TokenTypes.OBJECT) return null;
  return MACRO_DEFINITION.test(token.value) ? token.value.slice(1) : null;
}

/**
 * Ближайшее (самое внешнее) объявление макроса над рамкой. Внешнее — потому
 * что тело вложенного `@` подставляется параметрами внешнего макроса.
 */
function enclosingMacroName(frame, definitions) {
  let name = null;
  for (let current = frame; current; current = current.parent) {
    const candidate = macroDefinitionName(current.owner);
    if (candidate && definitions.has(candidate)) name = candidate;
  }
  return name;
}

export function collectLinkRanges(tokens, sourceText) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  if (typeof sourceText !== 'string' || sourceText === '') return [];

  const { frameOf, frames } = buildFrames(tokens);

  /* Объявления макросов: `ast.children` верхнего уровня у постпроцессора —
   * это рамки без родителя. */
  const definitions = new Map();
  const declarations = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const name = macroDefinitionName(token);
    if (!name) continue;

    declarations.push(token);
    const frame = frameOf[index];
    if (frame && frame.parent === null) definitions.set(name, token);
  }

  const isMacroCall = (token) => {
    if (token.type !== TokenTypes.OBJECT) return false;
    const match = token.value.match(MACRO_CALL);
    return Boolean(match && definitions.has(match[2] || match[1]));
  };

  /* Ключи-источники: то, что может закрыть `(( имя ))`. Внутри определения
   * макроса источников нет: там подстановки закрываются параметрами. */
  const sources = new Map();
  for (const frame of frames) {
    if (enclosingMacroName(frame, definitions)) continue;

    for (const { token } of frame.keys) {
      if (token.value.startsWith('@')) continue;
      if (isMacroCall(token)) continue;
      if (!isZeroLevel(sourceText, token)) continue;

      const prefixLength = token.prefix ? token.prefix.length : 0;
      sources.set(token.value, {
        start: token.start + prefixLength,
        end: token.end
      });
    }
  }

  /* Вхождения `(( … ))`: значения — единственное место, где работает
   * подстановка. `CODE_BLOCK` — остров, его не трогаем. Внутри определения
   * макроса подстановки не собираем: там они ожидаемы и цвет стал бы шумом. */
  const references = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== TokenTypes.ANY_VALUE) continue;

    const text = sourceText.slice(token.start, token.end);
    if (!text.includes('((')) continue;
    if (enclosingMacroName(frameOf[index], definitions)) continue;

    for (const match of text.matchAll(PLACEHOLDER)) {
      const start = token.start + match.index;
      references.push({ name: match[1], start, end: start + match[0].length });
    }
  }

  return buildRanges(references, sources, declarations);
}

/** Итоговый список диапазонов: ссылка + её источник и объявления макросов. */
function buildRanges(references, sources, declarations) {
  const ranges = [];

  for (const reference of references) {
    const source = sources.get(reference.name);
    if (!source) continue;

    ranges.push({
      start: reference.start,
      end: reference.end,
      className: LinkCSSClasses.REFERENCE
    });

    if (!source.marked) {
      source.marked = true;
      ranges.push({
        start: source.start,
        end: source.end,
        className: LinkCSSClasses.SOURCE
      });
    }
  }

  for (const token of declarations) {
    ranges.push({
      start: token.start,
      end: token.end,
      className: LinkCSSClasses.MACRO
    });
  }

  return ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
