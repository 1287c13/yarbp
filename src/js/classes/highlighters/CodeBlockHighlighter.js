import { escText } from '../../utils/escape.js';

// Лёгкая подсветка содержимого фрагментов кода.

const BSL_KEYWORDS = new Set([
  'процедура', 'конецпроцедуры', 'функция', 'конецфункции',
  'если', 'тогда', 'иначе', 'иначеесли', 'конецесли',
  'для', 'каждого', 'из', 'по', 'цикл', 'конеццикла', 'пока',
  'возврат', 'новый', 'попытка', 'исключение', 'конецпопытки',
  'перем', 'знач', 'экспорт', 'истина', 'ложь', 'неопределено',
  'и', 'или', 'не', 'продолжить', 'прервать', 'вызватьисключение',
  'перейти', 'добавитьобработчик', 'удалитьобработчик',
  'procedure', 'endprocedure', 'function', 'endfunction',
  'if', 'then', 'else', 'elsif', 'endif',
  'for', 'each', 'in', 'to', 'do', 'enddo', 'while',
  'return', 'new', 'try', 'except', 'endtry', 'raise',
  'var', 'val', 'export', 'true', 'false', 'undefined', 'null',
  'and', 'or', 'not', 'continue', 'break'
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
  bslPreprocessor: () => ({ type: 'pre', re: /#[\p{L}\p{N}_]+/uy }),
  bslAnnotation: () => ({ type: 'pre', re: /&[\p{L}\p{N}_]+/uy }),
  bslOperator: () => ({ type: 'oper', re: /(?:<=|>=|<>|[+\-*/=<>%])/y }),
  jsString: () => ({ type: 'str', re: /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/y }),
  sqlString: () => ({ type: 'str', re: /(?:'(?:''|[^'])*'|"(?:""|[^"])*")/y }),
  jsonString: () => ({ type: 'str', re: /"(?:\\.|[^"\\])*"/y }),
  number: () => ({ type: 'num', re: /-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/y }),
  identifier: () => ({ type: 'identifier', re: /[\p{L}_$][\p{L}\p{N}_$]*/uy })
});

const PROFILES = Object.freeze({
  bsl: {
    /* Традиционная схема 1С: ключевые слова и операторы красные,
       идентификаторы синие, строки/числа/даты чёрные, комментарии зелёные,
       препроцессор и аннотации коричневые (см. highlighters/README.md). */
    classPrefix: 'code-bsl-',
    identifiersAsClass: true,
    keywords: BSL_KEYWORDS,
    rules: [
      RULES.lineComment(),
      RULES.bslPreprocessor(),
      RULES.bslAnnotation(),
      RULES.bslString(),
      RULES.bslOperator(),
      RULES.number(),
      RULES.identifier()
    ]
  },
  js: {
    classPrefix: 'code-',
    keywords: JS_KEYWORDS,
    rules: [
      RULES.lineComment(), RULES.blockComment(), RULES.jsString(),
      RULES.number(), RULES.identifier()
    ]
  },
  sql: {
    classPrefix: 'code-',
    keywords: SQL_KEYWORDS,
    rules: [
      RULES.dashComment(), RULES.blockComment(), RULES.sqlString(),
      RULES.number(), RULES.identifier()
    ]
  },
  json: {
    classPrefix: 'code-',
    keywords: JSON_KEYWORDS,
    rules: [
      RULES.jsonString(), RULES.number(), RULES.identifier()
    ]
  },
  generic: {
    classPrefix: 'code-',
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

// Язык из info-строки → канонический профиль или generic.
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

  // Код → HTML.
  highlight(code) {
    const text = String(code ?? '');
    const { rules, keywords } = this.profile;
    const prefix = this.profile.classPrefix || 'code-';

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
            result += `<span class="${prefix}kw">${escText(value)}</span>`;
          } else if (this.profile.identifiersAsClass) {
            result += `<span class="${prefix}id">${escText(value)}</span>`;
          } else {
            result += escText(value);
          }
        } else {
          result += `<span class="${prefix}${rule.type}">${escText(value)}</span>`;
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
