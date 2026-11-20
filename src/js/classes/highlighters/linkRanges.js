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
 * - `(( параметр ))` внутри тела макроса красится, только если хоть один
 *   вызов этого макроса передаёт такой параметр. Безымянная передача
 *   (аргумент, чьего имени нет в теле) закрывает свободные скобки по
 *   порядку — ровно как позиционная подстановка в `substitute()`.
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
  MACRO: 'ide-code-macro',              // объявление @макроса
  PARAM: 'ide-code-macro-param'         // (( параметр )) внутри макроса
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

/* Тип токена, который задаёт ключ уровня парсера (и, значит, имя аргумента). */
const SCOPE_OWNER_TYPES = new Set([TokenTypes.OBJECT, TokenTypes.ARRAY]);

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

/**
 * Ключи-аргументы вызова: дети узла вызова. Это ключи самой рамки вызова и
 * владельцы вложенных рамок — парсер складывает в `children` и то, и другое.
 * Вложенная рамка считается аргументом, только если её уровень назван
 * объектом или массивом: безымянная обёртка ключом не становится.
 */
function callArguments(call) {
  const frame = call.frame;
  if (!frame) return [];

  const args = [];
  for (const item of frame.keys) {
    if (item.index > call.index) args.push({ index: item.index, value: item.token.value });
  }
  for (const child of frame.children) {
    if (!child.owner || child.ownerIndex < call.index) continue;
    if (!SCOPE_OWNER_TYPES.has(child.owner.type)) continue;
    args.push({ index: child.ownerIndex, value: child.owner.value });
  }

  return args.sort((a, b) => a.index - b.index).map(item => item.value);
}


export function collectLinkRanges(tokens, sourceText) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  if (typeof sourceText !== 'string' || sourceText === '') return [];

  const { frameOf, frames } = buildFrames(tokens);

  /* Объявления макросов: `ast.children` верхнего уровня у постпроцессора —
   * это рамки без родителя. */
  const definitions = new Map();
  const declarations = [];
  const calls = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const name = macroDefinitionName(token);
    if (!name) continue;

    declarations.push(token);
    const frame = frameOf[index];
    if (frame && frame.parent === null) definitions.set(name, token);
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== TokenTypes.OBJECT || token.value.startsWith('@')) continue;

    const match = token.value.match(MACRO_CALL);
    if (!match) continue;
    const name = match[2] || match[1];
    if (definitions.has(name)) calls.push({ name, index, frame: frameOf[index] });
  }

  const isMacroCall = (token) => {
    if (token.type !== TokenTypes.OBJECT) return false;
    const match = token.value.match(MACRO_CALL);
    return Boolean(match && definitions.has(match[2] || match[1]));
  };

  /* Ключи-источники: то, что может закрыть `(( имя ))`. Внутри тела
   * макроса источников нет — там действуют только параметры. */
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
   * подстановка. `CODE_BLOCK` — остров, его не трогаем. */
  const references = [];
  const macroParams = new Map();

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== TokenTypes.ANY_VALUE) continue;

    const text = sourceText.slice(token.start, token.end);
    if (!text.includes('((')) continue;

    const macroName = enclosingMacroName(frameOf[index], definitions);

    for (const match of text.matchAll(PLACEHOLDER)) {
      const start = token.start + match.index;
      const end = start + match[0].length;
      const entry = { name: match[1], start, end };

      if (!macroName) {
        references.push(entry);
        continue;
      }

      if (!macroParams.has(macroName)) macroParams.set(macroName, []);
      macroParams.get(macroName).push(entry);
    }
  }

  /* Какие параметры макроса реально закрываются вызовами. */
  const usedParams = new Set();
  for (const call of calls) {
    const body = macroParams.get(call.name);
    if (!body || body.length === 0) continue;

    const bodyNames = new Set(body.map(entry => entry.name));
    const args = callArguments(call);
    const named = new Set(args.filter(name => bodyNames.has(name)));
    const positional = args.filter(name => !bodyNames.has(name));

    let positionalIndex = 0;
    for (const entry of body) {
      if (named.has(entry.name)) {
        usedParams.add(call.name + '\u0000' + entry.name);
        continue;
      }
      if (positionalIndex < positional.length) {
        positionalIndex++;
        usedParams.add(call.name + '\u0000' + entry.name);
      }
    }
  }

  return buildRanges(references, sources, declarations, macroParams, usedParams);
}

/** Итоговый список диапазонов: ссылка + её источник, объявления, параметры. */
function buildRanges(references, sources, declarations, macroParams, usedParams) {
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

  for (const [macroName, entries] of macroParams) {
    for (const entry of entries) {
      if (!usedParams.has(macroName + '\u0000' + entry.name)) continue;
      ranges.push({
        start: entry.start,
        end: entry.end,
        className: LinkCSSClasses.PARAM
      });
    }
  }

  return ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
