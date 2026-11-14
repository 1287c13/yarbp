import { TokenTypes } from './YarbpLexer.js';
import { escText, escAttr } from '../escape.js';

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
   */
  highlight() {
    const code = this.code ?? '';

    let cursor = 0;
    let result = '';

    for (const { token, className } of this.collectRanges()) {
      result += escText(code.slice(cursor, token.start));

      if (token.type === TokenTypes.CODE_BLOCK) {
        result += this.renderCodeBlock(code, token, className);
      } else {
        result += `<span class="${className}">`
          + escText(code.slice(token.start, token.end))
          + '</span>';
      }

      cursor = token.end;
    }

    result += escText(code.slice(cursor));
    this.code = result;
    return this.code;
  };

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
