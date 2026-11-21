import { TokenTypes } from '../core/YarbpLexer.js';
import { COMMON_DIRECTIVES, DOCUMENT_DIRECTIVES } from './commonDirectives.js';
import { resolveContext } from './contextResolver.js';

// Hint-режим: короткая пиктограмма раскрытия + клавиша.
const HINT = '▼ Alt';

export class SuggestionProvider {
  constructor() {
    this.fileCatalog = null;
  }

  setFileCatalog(provider) {
    this.fileCatalog = typeof provider === 'function' ? provider : null;
  }

  update({ tokens, ast, cursorOffset, text, flavor, force = false }) {
    if (!tokens || !tokens.length) return null;

    const source = text ?? '';
    if (this.isInsideCodeBlock(tokens, cursorOffset)) return null;

    const language = this.detectLanguage(tokens, source);

    // Уже распознанная директива: подсказки по директивам работают при любом конвертере, в том числе без собственного словаря.
    const directive = this.findDirectiveAt(tokens, cursorOffset, source);
    if (directive) {
      return this.resolveDirectiveContext(directive, cursorOffset, source, language);
    }

    const config = flavor?.flavorData?.suggestions;

    // Набран `!` — директива уже начата, даже если лексер ещё не собрал `DIRECTIVE` (без пробела после `!` есть только…
    const lineStart = source.lastIndexOf('\n', cursorOffset - 1) + 1;
    const lineBefore = source.slice(lineStart, cursorOffset);
    if (/^\s*!/.test(lineBefore)) {
      return this.resolveDocumentContext(cursorOffset, source, force, language);
    }

    // У конвертера нет словаря контекстных подсказок (`json`, `xml`, `ast`, `openapi`, `мермейд`, …).
    if (!config) {
      if (!this.isAtEmptyFileStart(source, cursorOffset)) return null;
      return this.resolveDocumentContext(cursorOffset, source, force, language);
    }

    if (ast) {
      return this.resolveFlavorContext(ast, cursorOffset, source, config, force, language);
    }

    // AST не собрался — контекст недоступен.
    if (!this.isAtEmptyFileStart(source, cursorOffset)) return null;

    return this.resolveDocumentContext(cursorOffset, source, force, language);
  }

  /**
   * Язык выбранной директивы: `! как …` — русский, `! as …` — английский.
   * Смотрим токены, затем текст: подсказки должны работать и до того, как
   * app.js успел пересобрать flavor.
   */
  detectLanguage(tokens, text) {
    for (const token of tokens || []) {
      if (token.type !== TokenTypes.DIRECTIVE) continue;
      const match = String(token.value ?? '').match(/^\s*(as|как)(?=[\s\-_]|$)/i);
      if (match) return match[1].toLowerCase() === 'as' ? 'en' : 'ru';
    }

    const match = String(text ?? '').match(/^\s*!\s*(as|как)(?=[\s\-_]|$)/im);
    if (!match) return null;
    return match[1].toLowerCase() === 'as' ? 'en' : 'ru';
  }

  // В документе нет ничего, кроме пробельных символов.
  isDocumentEmpty(text) {
    return !String(text ?? '').trim();
  }

  // Курсор в начале пустого файла.
  isAtEmptyFileStart(text, cursorOffset) {
    return cursorOffset === 0 && this.isDocumentEmpty(text);
  }

  // Курсор внутри фрагмента кода — это чужой язык (BSL/JS/SQL/...), подсказки ЯРБП там не применяются.
  isInsideCodeBlock(tokens, cursorOffset) {
    for (const t of tokens) {
      if (t.type === TokenTypes.CODE_BLOCK) {
        if (cursorOffset >= t.start && cursorOffset < t.end) return true;
        continue;
      }
      if (t.type === TokenTypes.UNPARSED &&
          t.error === 'unterminated code block') {
        if (cursorOffset >= t.start && cursorOffset <= t.end) return true;
      }
    }
    return false;
  }

  // Директива на текущей строке.
  findDirectiveAt(tokens, cursorOffset, text) {
    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    const newline = text.indexOf('\n', cursorOffset);
    const lineEnd = newline === -1 ? text.length : newline;

    for (const t of tokens) {
      if (t.type !== TokenTypes.DIRECTIVE) continue;
      if (t.start < cursorOffset && t.start >= lineStart &&
          cursorOffset <= lineEnd) {
        return t;
      }
    }

    return null;
  }

  directiveValueStart(token, text) {
    let i = token.start;
    while (i < text.length &&
           (text[i] === '!' || text[i] === ' ' || text[i] === '\t')) {
      i++;
    }
    return i;
  }

  resolveDirectiveContext(token, cursorOffset, text, language = null) {
    const valueStart = this.directiveValueStart(token, text);
    const valueUpToCursor = text.slice(valueStart, cursorOffset);
    const parts = valueUpToCursor.split(' ').filter(Boolean);

    const charBefore = cursorOffset > 0 ? text[cursorOffset - 1] : '';
    const endsWithSpace = charBefore === ' ' || charBefore === '\n' || charBefore === '\t';

    const { from } = this.currentWord(text, cursorOffset);

    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const variants = this.matchVariants(COMMON_DIRECTIVES.names, prefix, language);
      if (!variants.length) return null;

      // Пользователь мог набрать `!к` без пробела.
      return {
        suggestions: variants.map(variant => ({
          ...variant,
          insert: '! ' + variant.insert,
        })),
        blockDoc: 'Доступные директивы',
        replaceFrom: token.start,
        replace: true,
        prefix,
        mode: 'list',
      };
    }

    const directiveName = parts[0];
    const directiveKey = directiveName.toLowerCase();
    if (directiveKey === 'импорт') {
      return this.resolveImportDirectiveContext(token, cursorOffset, text);
    }

    const entry = COMMON_DIRECTIVES.values[directiveKey];
    if (!entry) return null;

    const entryLanguage = directiveKey === 'as'
      ? 'en'
      : directiveKey === 'как'
        ? 'ru'
        : language;
    const prefix = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
    const variants = this.matchVariants(entry.variants, prefix, entryLanguage);
    if (!variants.length) return null;

    return {
      suggestions: variants,
      blockDoc: entry.blockDoc || '',
      replaceFrom: from,
      replace: true,
      prefix,
      mode: 'list',
    };
  }

  // `! импорт <объект> из <файл>`: после `из ` подсказываем имена файлов проекта.
  resolveImportDirectiveContext(token, cursorOffset, text) {
    const valueStart = this.directiveValueStart(token, text);
    const valueUpToCursor = text.slice(valueStart, cursorOffset);
    const match = valueUpToCursor.match(/\sиз\s+([\s\S]*)$/iu);
    if (!match) return null;

    const after = match[1];
    const prefix = after.trim().replace(/^"/, '').replace(/"$/, '');
    const fileStartInValue = valueUpToCursor.length - after.length;
    const replaceFrom = valueStart + fileStartInValue;
    const files = this.fileCatalog ? this.fileCatalog() : [];

    if (!files.length) return null;

    const variants = files.map(file => {
      const needsQuotes = /\s/.test(file.name);
      return {
        label: file.name,
        insert: needsQuotes ? '"' + file.name + '"' : file.name,
        doc: (file.slug ? 'slug: ' + file.slug : 'файл проекта') +
          (file.isActive ? ' · текущий' : ''),
      };
    });

    const filtered = this.matchVariants(variants, prefix);
    if (!filtered.length) return null;

    return {
      suggestions: filtered,
      blockDoc: 'Файлы проекта для импорта',
      replaceFrom,
      replace: true,
      prefix,
      mode: 'list',
    };
  }

  resolveDocumentContext(cursorOffset, text, force, language = null) {
    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    const lineBefore = text.slice(lineStart, cursorOffset);
    const isLineStart = !lineBefore.trim();

    if (!force && isLineStart) {
      return {
        suggestions: [],
        hint: HINT,
        blockDoc: '',
        replaceFrom: cursorOffset,
        replace: true,
        prefix: '',
        mode: 'hint',
      };
    }

    if (!force && !/^\s*!/.test(lineBefore)) return null;

    const { from, word } = this.currentWord(text, cursorOffset);
    const variants = this.matchVariants(DOCUMENT_DIRECTIVES.variants, word, language);
    if (!variants.length) return null;

    // Варианты этой ветки включают `!` («! как»).
    const bangOffset = word ? -1 : lineBefore.search(/!/);
    const replaceFrom = bangOffset === -1 ? from : lineStart + bangOffset;

    return {
      suggestions: variants,
      blockDoc: DOCUMENT_DIRECTIVES.blockDoc,
      replaceFrom,
      replace: true,
      prefix: word,
      mode: 'list',
    };
  }


  resolveFlavorContext(ast, cursorOffset, text, config, force, language = null) {
    const ctx = resolveContext(ast, cursorOffset, text);
    if (!ctx) return null;

    const { from, word } = this.currentWord(text, cursorOffset);

    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    const lineBeforeCursor = text.slice(lineStart, cursorOffset);
    const isLineStart = !lineBeforeCursor.trim();

    if (!force && isLineStart) {
      return {
        suggestions: [],
        hint: HINT,
        blockDoc: '',
        replaceFrom: from,
        replace: true,
        prefix: '',
        mode: 'hint',
      };
    }

    const node = this.contextNode(config, ctx);

    if (ctx.slot === 'value' && ctx.childKey) {
      const childNode = config.nodes?.[ctx.childKey];
      if (childNode) {
        const wholeValue = childNode.replace !== false && !childNode.quantifier;
        const prefix = wholeValue ? this.valuePrefix(ctx, text, cursorOffset) : word;
        const replaceFrom = wholeValue ? (ctx.valueStart ?? from) : from;
        const filtered = this.matchVariants(childNode.variants ?? [], prefix, language);
        if (!filtered.length) return null;
        return {
          suggestions: filtered,
          blockDoc: childNode.blockDoc || '',
          replaceFrom,
          replace: childNode.replace !== false,
          prefix,
          mode: 'list',
        };
      }

      const valueEntry = node?.values?.[ctx.childKey] ||
        config.values?.[ctx.childKey];
      if (valueEntry) {
        const raw = this.valuePrefix(ctx, text, cursorOffset);

        if (valueEntry.quantifier) {
          const alreadyTyped = raw.split(valueEntry.quantifier.separator).filter(Boolean);
          if (alreadyTyped.length >= valueEntry.quantifier.max) return null;
        }

        const wholeValue = valueEntry.replace !== false && !valueEntry.quantifier;
        const prefix = wholeValue ? raw : word;
        const replaceFrom = wholeValue ? (ctx.valueStart ?? from) : from;
        const filtered = this.matchVariants(valueEntry.variants ?? [], prefix, language);
        if (!filtered.length) return null;

        return {
          suggestions: filtered,
          blockDoc: valueEntry.blockDoc || '',
          replaceFrom,
          replace: valueEntry.replace !== false,
          prefix,
          mode: 'list',
        };
      }

      return null;
    }

    if (ctx.slot === 'key' && node) {
      const filtered = this.matchVariants(node.variants ?? [], word, language);
      if (!filtered.length) return null;

      // Внутри строки-объекта (`:`) новый `:` — это соседняя строка, а не вложенная.
      const canDedent = ctx.ownerIndent != null &&
        this.lineIndentAt(text, cursorOffset) > ctx.ownerIndent + 2;

      const variants = filtered.map(variant =>
        ctx.anonymous && variant.label === ':' && canDedent &&
        variant.dedent === undefined
          ? { ...variant, dedent: 1 }
          : variant);

      return {
        suggestions: variants,
        blockDoc: node.blockDoc || '',
        replaceFrom: from,
        replace: node.replace !== false,
        prefix: word,
        mode: 'list',
      };
    }

    if (ctx.slot === 'key' && !ctx.anonymous && ctx.parentKey === null &&
        config.root) {
      const filtered = this.matchVariants(config.root.variants ?? [], word, language);
      if (!filtered.length) return null;
      return {
        suggestions: filtered,
        blockDoc: config.root.blockDoc ?? '',
        replaceFrom: from,
        replace: config.root.replace !== false,
        prefix: word,
        mode: 'list',
      };
    }

    return null;
  }

  // Словарь для текущего контейнера.
  contextNode(config, ctx) {
    if (ctx.anonymous) {
      return config.containers?.[ctx.ownerKey] || null;
    }
    if (ctx.parentKey !== null) {
      return config.nodes?.[ctx.parentKey] || null;
    }
    return null;
  }

  valuePrefix(ctx, text, cursorOffset) {
    if (ctx.valueStart == null) return '';
    return text.slice(ctx.valueStart, cursorOffset);
  }

  currentWord(text, cursorOffset) {
    if (!text) return { word: '', from: cursorOffset };
    let start = cursorOffset;
    while (start > 0) {
      const ch = text[start - 1];
      if (ch === ' ' || ch === '\n' || ch === '\t') break;
      start--;
    }
    return { word: text.slice(start, cursorOffset), from: start };
  }

  lineIndentAt(text, cursorOffset) {
    const lineStart = text.lastIndexOf('\n', cursorOffset - 1) + 1;
    let i = lineStart;
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
    return i - lineStart;
  }

  // Язык/алфавит подсказки: `en` для латиницы, `ru` для кириллицы.
  scriptOf(value) {
    const text = String(value ?? '');
    const first = text.match(/[A-Za-zА-Яа-яЁё]/);
    if (!first) return null;
    return /[A-Za-z]/.test(first[0]) ? 'en' : 'ru';
  }

  variantMatchesScript(variant, language) {
    if (!variant || !language) return true;
    if (variant.language === 'both' || variant.language === language) return true;

    // Алфавит определяем по видимой подписи и алиасам, а не по `insert`:
    // вставка может содержать латинский код (`js`, `$0`) у русского ключа.
    const values = [variant.label, ...(variant.aliases || [])];
    const scripts = values.map(value => this.scriptOf(value)).filter(Boolean);
    if (scripts.length) return scripts.includes(language);

    // Пунктуация (`:`, `.`, `..`) и технические вставки без букв нужны в любом языке.
    const insertScript = this.scriptOf(variant.insert);
    return !insertScript || insertScript === language;
  }

  // Ранжирование вариантов по набранному префиксу (не фильтрация по подстроке).
  // Алфавит — дешёвый фильтр: словари небольшие, O(n) на список в пределах
  // десятков элементов. Если в словаре нет вариантов нужного алфавита
  // (например, контекстные ключи пока только русские), показываем исходный
  // список, чтобы подсказки не пропали совсем.
  matchVariants(variants, prefix, language = null) {
    // Выбранный `как`/`as` задаёт язык; до выбора — алфавит набранного префикса.
    const script = language || this.scriptOf(prefix);
    let source = variants;

    if (script) {
      const filtered = variants.filter(variant => this.variantMatchesScript(variant, script));
      if (filtered.length) source = filtered;
    }

    if (!prefix) return source;

    const p = this.normalize(prefix);
    const scored = source.map((variant, index) => {
      const label = this.normalize(variant.label);
      const aliases = (variant.aliases || []).map(alias => this.normalize(alias));

      let score = 5;
      if (label === p) score = 0;
      else if (label.startsWith(p)) score = 1;
      else if (aliases.some(alias => alias === p)) score = 2;
      else if (aliases.some(alias => alias.startsWith(p))) score = 3;
      else if (label.includes(p)) score = 4;

      return { variant, score, index };
    });

    scored.sort((a, b) => a.score - b.score || a.index - b.index);
    return scored.map(item => item.variant);
  }

  normalize(value) {
    return String(value ?? '').toLowerCase().replaceAll('ё', 'е');
  }
}

