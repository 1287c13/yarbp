import { TokenTypes } from './YarbpLexer.js';
import { escText } from '../escape.js';

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
      result += `<span class="${className}">`
        + escText(code.slice(token.start, token.end))
        + '</span>';
      cursor = token.end;
    }

    result += escText(code.slice(cursor));
    this.code = result;
    return this.code;
  };

}
