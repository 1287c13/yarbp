/**
 * Языковые директивы ЯРБП, которые меняют AST до конвертеров.
 *
 * Здесь живут только чистые функции: ни DOM, ни FileManager, ни рендереров.
 * Парсер передаёт токены/текст и колбэки разрешения типов, поэтому модуль
 * можно тестировать без редактора.
 *
 * Главный принцип: **строгий формат или ничего**. Строка, похожая на
 * директиву, но не совпавшая по формату, не даёт ни эффекта, ни диагностики:
 * иначе можно сломать произвольные директивы конвертеров.
 */

const MEANING = 'MEANING';

const SUGAR_RE = /^\s*типизация-сахара\s*\(\s*([^\s()]+)\s*\)\s*([\s\S]*)$/iu;
const NAME_RE = /^[\p{L}\p{N}_-]+$/u;
const PART_RE = /[\p{L}\p{N}_-]+|[^\s\p{L}\p{N}_-]+/gu;

function isDirectiveToken(token) {
  return token && token.type === 'DIRECTIVE' && typeof token.value === 'string';
}

function isRootDirective(sourceText, start) {
  if (!sourceText || !Number.isFinite(start)) return true;
  const lineStart = sourceText.lastIndexOf('\n', start - 1) + 1;
  return sourceText.slice(lineStart, start) === '';
}

/** Все DIRECTIVE-токены с признаком «на нулевом отступе». */
export function collectDirectives(tokens, sourceText = '') {
  return (tokens || [])
    .filter(isDirectiveToken)
    .map(token => ({
      value: token.value,
      start: token.start,
      end: token.end,
      atRoot: isRootDirective(sourceText, token.start),
    }));
}

/**
 * `типизация-сахара(<тег>) имя-1 / имя-2` → {tag, names, separator}.
 *
 * Разделитель — единственная серия символов вне `[\p{L}\p{N}_-]`, например
 * `/`, `//`, `,`, `|`. Одно имя можно объявить без разделителя. Любая
 * неоднозначность (разные разделители, лишний/недостающий разделитель,
 * пустые имена) — не директива, возвращаем null.
 */
export function parseSugarDirective(value) {
  const match = String(value ?? '').match(SUGAR_RE);
  if (!match) return null;

  const tag = match[1].trim();
  const rest = match[2].trim();
  if (!tag || !rest) return null;

  const names = [];
  const separators = [];
  for (const part of rest.matchAll(PART_RE)) {
    const token = part[0];
    if (NAME_RE.test(token)) names.push(token);
    else separators.push(token);
  }

  if (!names.length) return null;

  if (!separators.length) {
    if (names.length !== 1) return null;
    return { tag, names, separator: null };
  }

  const separator = separators[0];
  if (separators.some(item => item !== separator)) return null;
  if (separators.length !== names.length - 1) return null;

  return { tag, names, separator };
}

/**
 * Делит значение сахара по объявленному разделителю.
 *
 * Ведущий одиночный разделитель (`/orders`) считается частью первого
 * значения: иначе путь OpenAPI терял бы первый символ. Остальные разделители
 * режут как обычно, поэтому `a / / b` даёт пустой средний сегмент.
 */
export function splitSugarValue(value, separator) {
  const text = String(value ?? '');
  if (!separator) return [text.trim()];

  let body = text;
  let prefix = '';
  if (separator.length === 1 && text.startsWith(separator)) {
    prefix = separator;
    body = text.slice(separator.length);
  }

  const parts = body.split(separator).map(part => part.trim());
  if (prefix) parts[0] = prefix + parts[0];
  return parts;
}

/** Тег без вида (`:`) и id (`#`): `поле#количество:число` → `поле`. */
export function baseKey(key) {
  if (key === undefined || key === null) return '';
  return String(key).split(/[:#]/, 1)[0];
}

function hasDirectChild(node, key) {
  return (node.children || []).some(child =>
    child && child.nodeType === MEANING && child.key === key);
}

function makeProperty(part, key, position, resolveType, resolveValue) {
  return {
    nodeType: MEANING,
    key,
    prefix: '.',
    valueType: resolveType(part),
    value: resolveValue(part),
    position,
  };
}

/**
 * Разворачивает объявленный сахар в явные свойства.
 *
 * `! типизация-сахара(тег) имя / ид` + `тег = 1 / 2` даёт узлу детей
 * `.имя 1` и `.ид 2`, а `value` убирается. Без директивы ничего не меняется.
 *
 * @param {object} ast — AST парсера (ещё не заморожен)
 * @param {object} options
 * @param {Array} options.tokens — токены лексера
 * @param {string} options.sourceText — исходный текст
 * @param {Function} options.resolveType — парсер: значение → valueType
 * @param {Function} options.resolveValue — парсер: значение → JS-значение
 * @param {Array} options.diagnostics — массив нефатальных замечаний
 * @returns {object} тот же AST
 */
export function applySugarTyping(ast, options = {}) {
  const {
    tokens = [],
    sourceText = '',
    resolveType,
    resolveValue,
    diagnostics = [],
  } = options;

  if (!ast || typeof resolveType !== 'function' || typeof resolveValue !== 'function') {
    return ast;
  }

  const specs = new Map();
  for (const directive of collectDirectives(tokens, sourceText)) {
    if (!directive.atRoot) continue;
    const spec = parseSugarDirective(directive.value);
    if (!spec) continue;
    if (specs.has(spec.tag)) {
      diagnostics.push({
        message: 'директива «типизация-сахара» для тега «' + spec.tag +
          '» объявлена повторно — используется последняя',
        start: directive.start,
      });
    }
    specs.set(spec.tag, spec);
  }

  if (!specs.size) return ast;

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (node.nodeType === MEANING &&
        typeof node.value === 'string') {
      const spec = specs.get(baseKey(node.key));
      if (spec) {
        const clean = node.value.replace(/^=\s*/, '');
        const parts = splitSugarValue(clean, spec.separator);
        const position = node.position || {};

        if (parts.length > spec.names.length &&
            parts.slice(spec.names.length).some(part => part.trim() !== '')) {
          diagnostics.push({
            message: 'сахар «' + node.key + '»: сегментов больше, чем имён в ' +
              '«типизация-сахара» — лишние проигнорированы',
            start: position.start ?? 0,
          });
        }

        if (!Array.isArray(node.children)) node.children = [];
        const count = Math.min(parts.length, spec.names.length);
        for (let index = 0; index < count; index++) {
          const part = parts[index].trim();
          if (!part) continue;
          const key = spec.names[index];
          if (hasDirectChild(node, key)) {
            diagnostics.push({
              message: 'сахар «' + node.key + '»: свойство «' + key +
                '» уже задано явно — явное значение важнее',
              start: position.start ?? 0,
            });
            continue;
          }
          node.children.push(makeProperty(
            part, key, position, resolveType, resolveValue));
        }

        delete node.value;
      }
    }

    if (Array.isArray(node.children)) node.children.forEach(visit);
  };

  visit(ast);
  return ast;
}

const IMPORT_RE = /^\s*импорт\s+(\S+)\s+из\s+(?:"([^"]+)"|(\S+))\s*$/iu;

/**
 * `! импорт <объект> из <файл>` → {object, file}.
 *
 * Имя файла — один токен без пробелов или строка в двойных кавычках.
 * Любое отклонение (лишние слова, файл с пробелами без кавычек, незакрытая
 * кавычка) — не директива импорта: null, без диагностики.
 */
export function parseImportDirective(value) {
  const match = String(value ?? '').match(IMPORT_RE);
  if (!match) return null;
  const objectName = match[1].trim();
  const fileName = (match[2] !== undefined ? match[2] : match[3] || '').trim();
  if (!objectName || !fileName) return null;
  return { object: objectName, file: fileName };
}

function importDiagnostic(diagnostics, directive, message) {
  diagnostics.push({ message, start: directive.start });
}

/**
 * Импортирует объекты из других документов песочницы.
 *
 * Директивы обрабатываются после макросов и до L-2: файл-источник
 * разбирается своим парсером (макросы и его собственный сахар уже
 * раскрыты), затем нужный объект верхнего уровня вставляется в корень.
 * Импорт в импортируемом файле в MVP не выполняется — это отдельный
 * follow-up с защитой от циклов.
 */
export function applyImports(ast, options = {}) {
  const {
    tokens = [],
    sourceText = '',
    resolveImport,
    parseFile,
    diagnostics = [],
  } = options;

  if (!ast || typeof resolveImport !== 'function' || typeof parseFile !== 'function') {
    return ast;
  }

  const imports = collectDirectives(tokens, sourceText)
    .filter(directive => directive.atRoot)
    .map(directive => ({ directive, parsed: parseImportDirective(directive.value) }))
    .filter(item => !!item.parsed);

  if (!imports.length) return ast;

  if (!Array.isArray(ast.children)) ast.children = [];
  const children = ast.children;

  for (const { directive, parsed } of imports) {
    const resolved = resolveImport(parsed.file);

    if (!resolved || resolved.ok === false) {
      const reason = resolved && resolved.reason;
      const candidates = resolved && Array.isArray(resolved.candidates)
        ? resolved.candidates.filter(Boolean)
        : [];
      if (reason === 'self') {
        importDiagnostic(diagnostics, directive,
          'нельзя импортировать «' + parsed.object + '» из текущего файла');
      } else if (reason === 'ambiguous') {
        importDiagnostic(diagnostics, directive,
          'файл «' + parsed.file + '» неоднозначен: ' + candidates.join(', '));
      } else {
        importDiagnostic(diagnostics, directive,
          'файл «' + parsed.file + '» не найден' +
          (candidates.length ? '; доступны: ' + candidates.join(', ') : ''));
      }
      continue;
    }

    let parsedFile;
    try {
      parsedFile = parseFile(resolved.content);
    } catch (error) {
      importDiagnostic(diagnostics, directive,
        'файл «' + resolved.name + '» не удалось разобрать: ' +
        String(error && error.message || error));
      continue;
    }

    const sourceAst = parsedFile && parsedFile.ast ? parsedFile.ast : parsedFile;
    if (!sourceAst || !Array.isArray(sourceAst.children)) {
      importDiagnostic(diagnostics, directive,
        'файл «' + resolved.name + '» не содержит объектов');
      continue;
    }

    (parsedFile && parsedFile.diagnostics || []).forEach(item => {
      diagnostics.push({
        message: 'В файле «' + resolved.name + '»: ' + item.message,
        start: directive.start,
      });
    });

    const sourceChildren = sourceAst.children.filter(child =>
      child && child.nodeType === MEANING && child.key);
    let matches = sourceChildren.filter(child => child.key === parsed.object);
    if (!matches.length) {
      matches = sourceChildren.filter(child => baseKey(child.key) === parsed.object);
    }

    if (!matches.length) {
      importDiagnostic(diagnostics, directive,
        'в файле «' + resolved.name + '» нет объекта «' + parsed.object + '»' +
        (sourceChildren.length
          ? '; доступны: ' + sourceChildren.map(child => child.key).join(', ')
          : ''));
      continue;
    }
    if (matches.length > 1) {
      importDiagnostic(diagnostics, directive,
        'в файле «' + resolved.name + '» несколько объектов «' + parsed.object +
        '» — импорт неоднозначен');
      continue;
    }

    const source = matches[0];
    if (children.some(child => child && child.key === source.key)) {
      importDiagnostic(diagnostics, directive,
        'объект «' + source.key + '» уже есть в документе — импорт пропущен');
      continue;
    }

    const clone = JSON.parse(JSON.stringify(source));
    clone.origin = {
      fileId: resolved.id,
      fileName: resolved.name,
      object: parsed.object,
      position: clone.position ? { ...clone.position } : null,
    };
    clone.position = { start: directive.start, end: directive.end };

    const index = children.findIndex(child =>
      child && child.position && child.position.start > directive.start);
    children.splice(index === -1 ? children.length : index, 0, clone);
  }

  return ast;
}


