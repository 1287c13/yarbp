import { TokenTypes } from '../../core/YarbpLexer.js';
import { idsDisabled } from '../../core/languageDirectives.js';

// Ссылки, макросы и идентификаторы узлов, которые фактически сработали при сборке AST.

export const LinkCSSClasses = Object.freeze({
  REFERENCE: 'ide-code-ref',            // (( имя )) с найденным ключом
  SOURCE: 'ide-code-ref-source',        // ключ верхнего уровня, ушедший в ссылку
  MACRO: 'ide-code-macro',              // объявление @макроса
  ID: 'ide-code-id'                     // идентификатор узла `#id` в ключе
});

const MACRO_DEFINITION = /^@[\p{L}\p{N}_-]+$/u;
const MACRO_CALL = /^(?:([\p{L}\p{N}_-]+)\(([\p{L}\p{N}_-]+)\)|\(([\p{L}\p{N}_-]+)\)|([\p{L}\p{N}_-]+))$/u;
const PLACEHOLDER = /\(\(\s*([^\s()]+)\s*\)\)/g;

const KEY_TYPES = new Set([
  TokenTypes.OBJECT,
  TokenTypes.ARRAY,
  TokenTypes.PRIMITIVE
]);

// Рамки = уровни обхода парсера: `SCOPE_IN`/`SCOPE_OUT` лексер ставит ровно там, где парсер уходит в рекурсию.
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

function isZeroLevel(sourceText, token) {
  const lineStart = sourceText.lastIndexOf('\n', token.start - 1) + 1;
  return token.start === lineStart;
}

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

  // `! отключить идентификаторы` возвращает `#` в ключ: тогда id не красим и не режем из имён-источников — ровно как парсер.
  const idsOff = idsDisabled(tokens, sourceText);

  // Объявления макросов: `ast.children` верхнего уровня у постпроцессора — это рамки без родителя.
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
    if (!match) return false;
    return definitions.has(match[2] || match[3] || match[4]);
  };

  // Ключи-источники: то, что может закрыть `(( имя ))`.
  const sources = new Map();
  for (const frame of frames) {
    if (enclosingMacroName(frame, definitions)) continue;

    for (const { token } of frame.keys) {
      if (token.value.startsWith('@')) continue;
      if (isMacroCall(token)) continue;
      if (!isZeroLevel(sourceText, token)) continue;

      const prefixLength = token.prefix ? token.prefix.length : 0;
      // Парсер выносит `#id` из ключа в поле `id`, поэтому подстановка ищет имя до `#`.
      const name = idsOff ? token.value : token.value.split('#')[0];
      if (!name) continue;

      sources.set(name, {
        start: token.start + prefixLength,
        end: Math.min(token.end, token.start + prefixLength + name.length)
      });
    }
  }

  // Вхождения `(( … ))`: значения — единственное место, где работает подстановка.
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

  return buildRanges(
    references, sources, declarations,
    idsOff ? [] : collectIdRanges(tokens, sourceText));
}

// Идентификаторы узлов: `поле#итог` → диапазон `#итог`.
function collectIdRanges(tokens, sourceText) {
  const ranges = [];

  for (const token of tokens) {
    if (!KEY_TYPES.has(token.type)) continue;

    const text = sourceText.slice(token.start, token.end);
    const hash = text.indexOf('#');
    if (hash <= 0 || hash === text.length - 1) continue;

    ranges.push({
      start: token.start + hash,
      end: token.end,
      className: LinkCSSClasses.ID,
      standalone: true
    });
  }

  return ranges;
}

// Итоговый список диапазонов: ссылка + её источник, объявления и id узлов (`standalone` — кусок красится только своим…
function buildRanges(references, sources, declarations, ids = []) {
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

  /* id идут последними: сортировка в конце поставит их после широкого
     диапазона-источника, и подсветка токена выберет источник (см.
     `YarbpHighlighter.renderRange`: вложенные диапазоны не вкладываются). */
  ids.forEach(range => ranges.push(range));

  return ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
