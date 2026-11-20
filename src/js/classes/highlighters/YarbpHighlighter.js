import { TokenTypes } from '../../core/YarbpLexer.js';
import { escText, escAttr } from '../../utils/escape.js';
import { collectLinkRanges } from './linkRanges.js';

export class YarbpHighlighter {

  static tokenTypesToCSSClasses = Object.freeze({
    [TokenTypes.OBJECT]: 'ide-code-obj',
    [TokenTypes.ARRAY]: 'ide-code-obj',
    [TokenTypes.PRIMITIVE]: 'ide-code-prop',
    [TokenTypes.ANY_VALUE]: 'ide-code-val',
    [TokenTypes.COMMENT]: 'comments',
    [TokenTypes.COMMENT_TODO]: 'todo',
    [TokenTypes.COMMENT_IMPORTANT]: 'important',
    [TokenTypes.COMMENT_OUT]: 'removed',
    [TokenTypes.DIRECTIVE]: 'flavor',
    [TokenTypes.TYPE]: 'ide-code-type',
    [TokenTypes.CODE_BLOCK]: 'ide-code-codeblock',
    // Недопустимый фрагмент: подсвечивается волнистым подчёркиванием, а текст
    // под ним остаётся текстом (экранируется как все остальные токены).
    [TokenTypes.UNPARSED]: 'ide-code-unparsed'
  });

  constructor(code=undefined, tokens=undefined) {
    this.code = code;
    this.tokens = tokens;
  };

  /**
   * Диапазоны для подсветки: по возрастанию и без пересечений.
   *
   * Пересечения и вложенность HTML выразить не может: `<span>` не может
   * начаться внутри одного и закончиться внутри другого. Раньше такие токены
   * уходили в медленный путь, который вставлял разметку в уже собранную
   * строку по «сырым» позициям — то есть давал битый HTML и вдобавок не
   * экранировал текст. Теперь вложенный диапазон просто пропускается:
   * внешний токен уже накрыл эти символы своим классом.
   */
  collectRanges() {
    const ranges = [];

    for (const token of this.tokens || []) {
      const className = YarbpHighlighter.tokenTypesToCSSClasses[token.type];
      if (!className) continue;

      // Нулевой или некорректный диапазон подсвечивать нечем.
      if (!Number.isFinite(token.start) || !Number.isFinite(token.end)) continue;
      if (token.end <= token.start) continue;

      ranges.push({ token, className });
    }

    ranges.sort((a, b) => a.token.start - b.token.start || a.token.end - b.token.end);

    const ordered = [];
    let previousEnd = 0;
    for (const range of ranges) {
      if (range.token.start < previousEnd) continue;
      ordered.push(range);
      previousEnd = range.token.end;
    }

    return ordered;
  };

  /**
   * Код → HTML подсветки. Текст экранируется: символ `<` в документе остаётся
   * символом, а не началом тега (слой подсветки вставляется через innerHTML).
   *
   * Ссылки и макросы (`(( имя ))`, `@макрос`, их параметры) идут отдельным
   * слоем диапазонов: они вложены в обычные токены, поэтому HTML не
   * вкладывается, а режется по их границам — у куска остаются оба класса.
   */
  highlight() {
    const code = this.code ?? '';
    const ranges = this.collectRanges();
    const buckets = this.groupLinks(ranges, this.collectLinks());

    let cursor = 0;
    let result = '';

    for (const { token, className } of ranges) {
      result += escText(code.slice(cursor, token.start));
      result += this.renderRange(code, token, className, buckets.get(token) || []);
      cursor = token.end;
    }

    result += escText(code.slice(cursor));
    this.code = result;
    return this.code;
  };

  /**
   * Диапазоны ссылок и макросов из токенов и исходного текста (см.
   * `linkRanges.js`). Без токенов подсветка остаётся прежней.
   */
  collectLinks() {
    return collectLinkRanges(this.tokens, this.code ?? '');
  }

  /**
   * Ссылки, разложенные по токенам. И токены, и ссылки отсортированы, поэтому
   * хватает одного прохода; ссылка всегда лежит внутри одного токена.
   */
  groupLinks(ranges, links) {
    const buckets = new Map();
    let index = 0;

    for (const range of ranges) {
      const bucket = [];

      while (index < links.length && links[index].start < range.token.end) {
        const link = links[index];
        index++;
        if (link.end > range.token.start) bucket.push(link);
      }

      if (bucket.length) buckets.set(range.token, bucket);
    }

    return buckets;
  }

  /**
   * Один диапазон токена: либо обычный `<span>`, либо нарезка по вложенным
   * ссылкам. Обычно классы не вкладываются (внешний токен уже накрыл
   * символы), а суммируются: `ide-code-val ide-code-ref`. Исключение —
   * диапазон с `standalone` (`#id`): он красится только своим классом, иначе
   * наследует жирность ключа и слипается с ним.
   */
  renderRange(code, token, className, links) {
    if (token.type === TokenTypes.CODE_BLOCK) {
      return this.renderCodeBlock(code, token, className);
    }

    const inside = [];
    let previousEnd = token.start;
    for (const link of links) {
      if (link.start < token.start || link.end > token.end) continue;
      if (link.start < previousEnd) continue;
      inside.push(link);
      previousEnd = link.end;
    }

    if (inside.length === 0) {
      return YarbpHighlighter.span(className, code.slice(token.start, token.end));
    }

    let result = '';
    let position = token.start;

    for (const link of inside) {
      if (link.start > position) {
        result += YarbpHighlighter.span(className, code.slice(position, link.start));
      }
      const classes = link.standalone
        ? link.className
        : className + ' ' + link.className;
      result += YarbpHighlighter.span(classes, code.slice(link.start, link.end));
      position = link.end;
    }

    if (position < token.end) {
      result += YarbpHighlighter.span(className, code.slice(position, token.end));
    }

    return result;
  }

  static span(className, text) {
    return `<span class="${className}">${escText(text)}</span>`;
  }

  /**
   * Фрагмент кода: границы и язык рисует основной проход, содержимое —
   * отдельный отложенный проход (CodeBlockHighlightPass). Текст остаётся
   * исходным: три куска при склейке дают ровно `code.slice(start, end)`.
   */
  renderCodeBlock(code, token, className) {
    const contentStart = token.contentStart ?? token.end;
    const contentEnd = token.contentEnd ?? token.end;
    const language = token.language ? escAttr(token.language) : '';

    const opener = escText(code.slice(token.start, contentStart));
    const content = escText(code.slice(contentStart, contentEnd));
    const closer = escText(code.slice(contentEnd, token.end));

    return `<span class="${className}" data-code-block-start="${token.start}"`
      + (language ? ` data-lang="${language}"` : '')
      + '>'
      + `<span class="ide-code-fence">${opener}</span>`
      + `<span class="ide-code-body">${content}</span>`
      + `<span class="ide-code-fence">${closer}</span>`
      + '</span>';
  }

}
