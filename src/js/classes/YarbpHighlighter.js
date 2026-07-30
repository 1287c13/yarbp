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
    const sortedTokens = this.tokens.toSorted((a, b) => b.start - a.start);

    sortedTokens.forEach(token => {
      const className = YarbpHighlighter.tokenTypesToCSSClasses[token.type];
      if (!className) return;
      this.wrapTextByPositions(token.start, token.end, className);
    });

    return this.code;
  };

}