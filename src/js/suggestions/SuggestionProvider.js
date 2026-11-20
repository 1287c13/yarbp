import { TokenTypes } from '../core/YarbpLexer.js';
import { COMMON_DIRECTIVES, DOCUMENT_DIRECTIVES } from './commonDirectives.js';
import { resolveContext } from './contextResolver.js';

// Hint-режим: короткая пиктограмма раскрытия + клавиша. Длинная фраза
// («Alt — подсказки · Tab — отступ») конкурировала с кодом и объясняла Tab,
// который и так делает отступ.
const HINT = '▼ Alt';

export class SuggestionProvider {
  constructor() {
    this.fileCatalog = null;
  }

  /** Источник имён файлов для подсказок `! импорт`. */
  setFileCatalog(provider) {
    this.fileCatalog = typeof provider === 'function' ? provider : null;
  }

  update({ tokens, ast, cursorOffset, text, flavor, force = false }) {
    if (!tokens || !tokens.length) return null;

    const source = text ?? '';
    if (this.isInsideCodeBlock(tokens, cursorOffset)) return null;

    const directive = this.findDirectiveAt(tokens, cursorOffset, source);
    if (directive) {
      return this.resolveDirectiveContext(directive, cursorOffset, source);
    }

    // Строка начинается с `!`, но директива ещё не собрана лексером.
    // В этом состоянии нужны директивы, а не свойства текущего флейвора.
    const lineStart = source.lastIndexOf('\n', cursorOffset - 1) + 1;
    const lineBefore = source.slice(lineStart, cursorOffset);
    if (/^\s*!/.test(lineBefore)) {
      return this.resolveDocumentContext(cursorOffset, source, force);
    }

    const config = flavor?.flavorData?.suggestions;
    if (config && ast) {
      return this.resolveFlavorContext(ast, cursorOffset, source, config, force);
    }

    return this.resolveDocumentContext(cursorOffset, source, force);
  }

  /**
   * Курсор внутри фрагмента кода — это чужой язык (BSL/JS/SQL/...),
   * подсказки ЯРБП там не применяются. Проверяем весь остров, включая
   * fence: на строке с ``` тоже не должно быть меню.
   */
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

  /**
   * Директива на текущей строке.
   *
   * Директива с телом занимает строку целиком, а `! ` без тела — только сам
   * `!` (токен с пустым значением). Курсор при этом стоит уже за концом
   * токена, поэтому проверяем не только интервал токена, но и то, что курсор
   * остался на его строке.
   */
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

  /** Где в тексте начинается значение директивы (после `!` и пробелов). */
  directiveValueStart(token, text) {
    let i = token.start;
    while (i < text.length &&
           (text[i] === '!' || text[i] === ' ' || text[i] === '\t')) {
      i++;
    }
    return i;
  }

  resolveDirectiveContext(token, cursorOffset, text) {
    const valueStart = this.directiveValueStart(token, text);
    const valueUpToCursor = text.slice(valueStart, cursorOffset);
    const parts = valueUpToCursor.split(' ').filter(Boolean);

    const charBefore = cursorOffset > 0 ? text[cursorOffset - 1] : '';
    const endsWithSpace = charBefore === ' ' || charBefore === '\n' || charBefore === '\t';

    const { from } = this.currentWord(text, cursorOffset);

    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const variants = this.matchVariants(COMMON_DIRECTIVES.names, prefix);
      if (!variants.length) return null;

      // Пользователь мог набрать `!к` без пробела. Заменяем директиву
      // целиком (вместе с `!`) и вставляем канонический `! имя ` — иначе
      // `!` остаётся склеенным с именем.
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
    if (directiveName.toLowerCase() === 'импорт') {
      return this.resolveImportDirectiveContext(token, cursorOffset, text);
    }

    const entry = COMMON_DIRECTIVES.values[directiveName];
    if (!entry) return null;

    const prefix = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
    const variants = this.matchVariants(entry.variants, prefix);
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

  /**
   * `! импорт <объект> из <файл>`: после `из ` подсказываем имена файлов
   * проекта. Файлы с пробелами вставляются в кавычках — как требует парсер.
   */
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

  /** Подсказки до выбора конвертера: с чего начать документ. */
  resolveDocumentContext(cursorOffset, text, force) {
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
    const variants = this.matchVariants(DOCUMENT_DIRECTIVES.variants, word);
    if (!variants.length) return null;

    // Варианты этой ветки включают `!` («! как»). Если на строке уже есть `!`,
    // а слово ещё не набрано (`! ` — директиву только начали), заменять надо
    // вместе с ним: иначе вставка добавит второй `!` и сломает разметку.
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


  resolveFlavorContext(ast, cursorOffset, text, config, force) {
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

    // 1. value-ветка (приоритет)
    if (ctx.slot === 'value' && ctx.childKey) {
      const childNode = config.nodes?.[ctx.childKey];
      if (childNode) {
        const wholeValue = childNode.replace !== false && !childNode.quantifier;
        const prefix = wholeValue ? this.valuePrefix(ctx, text, cursorOffset) : word;
        const replaceFrom = wholeValue ? (ctx.valueStart ?? from) : from;
        const filtered = this.matchVariants(childNode.variants ?? [], prefix);
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
        const filtered = this.matchVariants(valueEntry.variants ?? [], prefix);
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

    // 2. key-ветка внутри именованного объекта или анонимного контейнера
    if (ctx.slot === 'key' && node) {
      const filtered = this.matchVariants(node.variants ?? [], word);
      if (!filtered.length) return null;

      // Внутри строки-объекта (`:`) новый `:` — это соседняя строка, а не
      // вложенная. Выравниваем её на уровень владельца только тогда, когда
      // курсор уже стоит глубже уровня самой строки (в её свойствах).
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

    // 3. root-ветка: курсор в корне документа перед первым ключом
    if (ctx.slot === 'key' && !ctx.anonymous && ctx.parentKey === null &&
        config.root) {
      const filtered = this.matchVariants(config.root.variants ?? [], word);
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

  /**
   * Словарь для текущего контейнера.
   *
   * У анонимного объекта (`:`) свойства лежат в `containers` его владельца:
   * колонка таблицы, строка обработчика, опция выпадающего списка. Иначе
   * берётся обычный `nodes[parentKey]`.
   */
  contextNode(config, ctx) {
    if (ctx.anonymous) {
      return config.containers?.[ctx.ownerKey] || null;
    }
    if (ctx.parentKey !== null) {
      return config.nodes?.[ctx.parentKey] || null;
    }
    return null;
  }

  /** Набранное значение целиком (для многословных значений и замены `= `). */
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

  /**
   * Ранжирование вариантов по набранному префиксу (не фильтрация).
   *
   * Фильтр оказался плохим UX: при вводе `з` в шапке формы оставались только
   * `.заголовок*`, и посмотреть остальные свойства без стирания буквы было
   * нельзя. Теперь список не сокращается — совпадения поднимаются наверх,
   * остальные идут следом в исходном порядке словаря.
   *
   * Порядок: метка целиком → метка с префикса → алиас целиком → алиас с
   * префикса → подстрока в метке → без совпадения. Совпадение ищется по
   * метке и по `aliases`, регистр и `ё` нормализуются.
   */
  matchVariants(variants, prefix) {
    if (!prefix) return variants;

    const p = this.normalize(prefix);
    const scored = variants.map((variant, index) => {
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

