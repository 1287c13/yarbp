import { escText } from '../../escape.js';

/**
 * Лёгкая подсветка содержимого фрагментов кода.
 *
 * Внешних зависимостей нет: редактор полностью офлайн, Prism/Monaco/CodeMirror
 * не подключаются. Профиль — набор «липких» (sticky) правил, которые
 * применяются по порядку с текущей позиции. Всё, что не совпало с правилом,
 * копируется как экранированный текст, поэтому `textContent` результата
 * всегда равен исходному коду.
 */

const BSL_KEYWORDS = new Set([
  'процедура', 'конецпроцедуры', 'функция', 'конецфункции',
  'если', 'тогда', 'иначе', 'конецесли',
  'для', 'каждого', 'из', 'по', 'цикл', 'конеццикла', 'пока',
  'возврат', 'новый', 'попытка', 'исключение', 'конецпопытки',
  'перем', 'знач', 'экспорт', 'истина', 'ложь', 'неопределено',
  'и', 'или', 'не', 'продолжить', 'прервать', 'вызватьисключение',
  'перейти', 'добавитьобработчик', 'удалитьобработчик'
]);

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'async', 'await',
  'true', 'false', 'null', 'undefined'
]);

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer',
  'on', 'group', 'by', 'order', 'having', 'insert', 'into', 'values',
  'update', 'set', 'delete', 'create', 'table', 'alter', 'drop', 'index',
  'primary', 'key', 'foreign', 'references', 'and', 'or', 'not', 'null',
  'is', 'in', 'as', 'distinct', 'union', 'all', 'case', 'when', 'then',
  'else', 'end', 'limit', 'offset', 'count', 'sum', 'avg', 'min', 'max'
]);

const JSON_KEYWORDS = new Set(['true', 'false', 'null']);

const RULES = Object.freeze({
  lineComment: () => ({ type: 'com', re: /\/\/[^\n]*/y }),
  hashComment: () => ({ type: 'com', re: /#[^\n]*/y }),
  dashComment: () => ({ type: 'com', re: /--[^\n]*/y }),
  blockComment: () => ({ type: 'com', re: /\/\*[\s\S]*?\*\//y }),
  xmlComment: () => ({ type: 'com', re: /<!--[\s\S]*?-->/y }),
  bslString: () => ({ type: 'str', re: /"(?:[^"]|"")*"|'(?:[^']|'')*'/y }),
  jsString: () => ({ type: 'str', re: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/y }),
  sqlString: () => ({ type: 'str', re: /(?:'(?:''|[^'])*'|"(?:""|[^"])*")/y }),
  jsonString: () => ({ type: 'str', re: /"(?:\\.|[^"\\])*"/y }),
  number: () => ({ type: 'num', re: /-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y }),
  identifier: () => ({ type: 'identifier', re: /[\p{L}_$][\p{L}\p{N}_$]*/uy })
});

const PROFILES = Object.freeze({
  bsl: {
    keywords: BSL_KEYWORDS,
    rules: [
      RULES.lineComment(), RULES.bslString(), RULES.number(), RULES.identifier()
    ]
  },
  js: {
    keywords: JS_KEYWORDS,
    rules: [
      RULES.lineComment(), RULES.blockComment(), RULES.jsString(),
      RULES.number(), RULES.identifier()
    ]
  },
  sql: {
    keywords: SQL_KEYWORDS,
    rules: [
      RULES.dashComment(), RULES.blockComment(), RULES.sqlString(),
      RULES.number(), RULES.identifier()
    ]
  },
  json: {
    keywords: JSON_KEYWORDS,
    rules: [
      RULES.jsonString(), RULES.number(), RULES.identifier()
    ]
  },
  generic: {
    keywords: JSON_KEYWORDS,
    rules: [
      RULES.lineComment(), RULES.hashComment(), RULES.dashComment(),
      RULES.blockComment(), RULES.xmlComment(), RULES.jsString(),
      RULES.number(), RULES.identifier()
    ]
  }
});

const LANGUAGE_ALIASES = new Map([
  ['bsl', 'bsl'], ['1c', 'bsl'], ['1с', 'bsl'], ['1c:enterprise', 'bsl'],
  ['1с:предприятие', 'bsl'], ['onec', 'bsl'], ['oneс', 'bsl'],
  ['js', 'js'], ['javascript', 'js'], ['ts', 'js'], ['typescript', 'js'],
  ['jsx', 'js'], ['tsx', 'js'],
  ['sql', 'sql'], ['mysql', 'sql'], ['postgres', 'sql'],
  ['postgresql', 'sql'], ['sqlite', 'sql'], ['mssql', 'sql'],
  ['json', 'json'], ['json5', 'json']
]);

/**
 * Язык из info-строки → канонический профиль или generic.
 * Пустой/не указанный язык → null (подсветка не запускается).
 */
export function normalizeCodeLanguage(language) {
  const raw = String(language ?? '').trim().toLowerCase();
  if (!raw) return null;
  return LANGUAGE_ALIASES.get(raw) || 'generic';
}

export class CodeBlockHighlighter {
  constructor(language) {
    this.language = normalizeCodeLanguage(language);
    this.profile = PROFILES[this.language] || PROFILES.generic;
  }

  static normalizeLanguage(language) {
    return normalizeCodeLanguage(language);
  }

  /**
   * Код → HTML. Любой несматченный символ экранируется и копируется как есть,
   * поэтому сумма текста всех узлов равна исходной строке.
   */
  highlight(code) {
    const text = String(code ?? '');
    const { rules, keywords } = this.profile;

    let result = '';
    let pos = 0;

    while (pos < text.length) {
      let matched = false;

      for (const rule of rules) {
        rule.re.lastIndex = pos;
        const match = rule.re.exec(text);
        if (!match || match.index !== pos) continue;

        const value = match[0];

        if (rule.type === 'identifier') {
          if (keywords.has(value.toLowerCase())) {
            result += `<span class="code-kw">${escText(value)}</span>`;
          } else {
            result += escText(value);
          }
        } else {
          result += `<span class="code-${rule.type}">${escText(value)}</span>`;
        }

        pos += value.length;
        matched = true;
        break;
      }

      if (!matched) {
        result += escText(text[pos]);
        pos += 1;
      }
    }

    return result;
  }
}
