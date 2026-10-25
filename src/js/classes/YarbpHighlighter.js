import { TokenTypes } from './YarbpLexer.js';

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
    [TokenTypes.TYPE]: 'ide-code-type'
  });

  constructor(code=undefined, tokens=undefined) {
    this.code = code;
    this.tokens = tokens;
  };

  wrapTextByPositions(start, end, className) {
    this.code = this.code.slice(0, start) +
      `<span class="${className}">` +
      this.code.slice(start, end) +
      '</span>' +
      this.code.slice(end);
  };

  highlight() {
    const styled = [];
    let previousStart = -1;
    let ordered = true;

    for (const token of this.tokens) {
      const className = YarbpHighlighter.tokenTypesToCSSClasses[token.type];
      if (!className) continue;

      // Нулевые и некорректные диапазоны оставляем медленному пути:
      // он сохраняет прежний порядок вложенных/пустых span-ов.
      if (!Number.isFinite(token.start) || !Number.isFinite(token.end)
          || token.end <= token.start) {
        return this.highlightSlow();
      }

      if (token.start < previousStart) ordered = false;
      previousStart = token.start;
      styled.push({ token, className });
    }

    if (!styled.length) return this.code;
    if (!ordered) styled.sort((a, b) => a.token.start - b.token.start);

    let previousEnd = -1;
    for (const { token } of styled) {
      if (token.start < previousEnd) return this.highlightSlow();
      previousEnd = token.end;
    }

    // Быстрый путь: непересекающиеся стилизованные токены.
    // Собираем HTML одним проходом вместо O(n²) вставок в строку.
    let cursor = 0;
    let result = '';

    for (const { token, className } of styled) {
      result += this.code.slice(cursor, token.start);
      result += `<span class="${className}">`
        + this.code.slice(token.start, token.end)
        + '</span>';
      cursor = token.end;
    }

    result += this.code.slice(cursor);
    this.code = result;
    return this.code;
  };

  /**
   * Прежний алгоритм: нужен для пересекающихся и пустых токенов,
   * где порядок вставки span-ов влияет на HTML.
   */
  highlightSlow() {
    const sortedTokens = this.tokens.toSorted((a, b) => b.start - a.start);

    sortedTokens.forEach(token => {
      const className = YarbpHighlighter.tokenTypesToCSSClasses[token.type];
      if (!className) return;
      this.wrapTextByPositions(token.start, token.end, className);
    });

    return this.code;
  };

}