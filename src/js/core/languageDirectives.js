// Языковые директивы ЯРБП, которые меняют AST до конвертеров.

const MEANING = 'MEANING';

const SUGAR_RE = /^\s*разбор-сахара\s*\(\s*([^\s()]+)\s*\)\s*([\s\S]*)$/iu;
const SUGAR_GLOBAL_RE = /^\s*разбор-сахара(?=\s|$)\s*([\s\S]+)$/iu;
const IDS_OFF_RE = /^\s*(?:отключить[\s-]+идентификаторы|disable[\s-]+ids)\s*$/iu;
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

// `! отключить идентификаторы` / `! disable ids` → true.
export function parseIdsDirective(value) {
  return IDS_OFF_RE.test(String(value ?? ''));
}

// Отключены ли идентификаторы узлов (`#id`) в документе.
export function idsDisabled(tokens, sourceText = '') {
  return collectDirectives(tokens, sourceText)
    .some(directive => directive.atRoot && parseIdsDirective(directive.value));
}

// Имена свойств и разделитель из правой части директивы.
function parseSugarNames(rest) {
  const text = String(rest ?? '').trim();
  if (!text) return null;

  const names = [];
  const separators = [];
  for (const part of text.matchAll(PART_RE)) {
    const token = part[0];
    if (NAME_RE.test(token)) names.push(token);
    else separators.push(token);
  }

  if (!names.length) return null;

  if (!separators.length) {
    if (names.length !== 1) return null;
    return { names, separator: null };
  }

  const separator = separators[0];
  if (separators.some(item => item !== separator)) return null;
  if (separators.length !== names.length - 1) return null;

  return { names, separator };
}

// `разбор-сахара(<тег>) имя-1 / имя-2` → {tag, names, separator}.
export function parseSugarDirective(value) {
  const text = String(value ?? '');
  const specific = text.match(SUGAR_RE);
  if (specific) {
    const tag = specific[1].trim();
    const names = tag ? parseSugarNames(specific[2]) : null;
    return names ? { tag, ...names } : null;
  }

  const global = text.match(SUGAR_GLOBAL_RE);
  if (!global) return null;
  const names = parseSugarNames(global[1]);
  return names ? { tag: null, ...names } : null;
}

// Делит значение сахара по объявленному разделителю.
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

// Тег без вида (`:`).
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

// Разворачивает объявленный сахар в явные свойства.
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
      const scope = spec.tag === null ? 'все теги' : 'тег «' + spec.tag + '»';
      diagnostics.push({
        message: 'директива «разбор-сахара» для ' + scope +
          ' объявлена повторно — используется последняя',
        start: directive.start,
      });
    }
    specs.set(spec.tag, spec);
  }

  if (!specs.size) return ast;

  const synthetic = new WeakSet();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    // Синтетические свойства этого прохода не разворачиваем повторно: иначе глобальное правило применяется к самому себе…
    if (synthetic.has(node)) return;

    const sugarValue = typeof node.value === 'string' &&
      (node.prefix !== '.' || node.value.startsWith('='));

    if (node.nodeType === MEANING && sugarValue) {
      const spec = specs.get(baseKey(node.key)) || specs.get(null);
      if (spec) {
        const clean = node.value.replace(/^=\s*/, '');
        const parts = splitSugarValue(clean, spec.separator);
        const position = node.position || {};

        if (parts.length > spec.names.length &&
            parts.slice(spec.names.length).some(part => part.trim() !== '')) {
          diagnostics.push({
            message: 'сахар «' + node.key + '»: сегментов больше, чем имён в ' +
              '«разбор-сахара» — лишние проигнорированы',
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
          const property = makeProperty(part, key, position, resolveType, resolveValue);
          synthetic.add(property);
          node.children.push(property);
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

// `! импорт <объект> из <файл>` → {object, file}.
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

// Импортирует объекты из других документов песочницы.
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


