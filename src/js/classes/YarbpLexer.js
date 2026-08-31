import {calcLeadingSpaces, calcTrailingSpaces} from '../utils.js';

export const TokenTypes = Object.freeze({
  /* control tokens */
  START: 'START',
  END: 'END',
  SCOPE_IN: 'SCOPE_IN',
  SCOPE_OUT: 'SCOPE_OUT',

  /* identifiers */
  OBJECT: 'KEY(OBJ)',
  ARRAY: 'KEY(ARR)',
  PRIMITIVE: 'KEY',
  TYPE: 'TYPE',

  /* primitives */
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOL: 'BOOL',
  NULL: 'NULL',
  ANY_VALUE: 'VALUE', /* value untyped at lexer */

  /* special tokens */
  PREFIX: 'PREFIX',
  DIRECTIVE: 'DIRECTIVE',
  COMMENT: 'COMMENT',
  COMMENT_TODO: 'TODO',
  COMMENT_IMPORTANT: 'IMPORTANT',
  COMMENT_OUT: 'DELETED',
  UNPARSED: 'UNPARSED',
});

class Token {
  static attrs = Object.freeze({
    type: 'type',
    value: 'value',
    prefix: 'prefix',
    start: 'start',
    end: 'end',
    error: 'error'
  });

  constructor(props) {
    Object.keys(Token.attrs).forEach(key => {
      this[key] = props[key];
    });
  }
}

class Scope {
  constructor(indent, type) {
    this.indent = indent;
    this.type = type;
  };
}

export class YarbpLexer {
  /**
   * Accepts raw text, produces a list of tokens.
   * The lexer is smart, so it performs type annotation for identifiers and primitives.
   * This is done for two reasons:
   * - The YARBP Syntax allows defining these types on the fly without lookahead
   * - The lexer has two consumers: the highlighter and the parser,
   *    and this consumption is separated in time */

  static states = Object.freeze({
    WAITING: 'WAITING',
    WAITING_FOR_VALUE: 'WAITING_FOR_VALUE',
    WAITING_AFTER_NEWLINE: 'WAITING_AFTER_NEWLINE',

    PREFIX_ENCOUNTERED: 'PREFIX_ENCOUNTERED',
    IN_PREFIX: 'IN_PREFIX',

    IDENTIFIER_ENCOUNTERED: 'IDENTIFIER_ENCOUNTERED',

    IMPLICIT_OBJECT_ENCOUNTERED: 'IMPLICIT_OBJECT_ENCOUNTERED',
    IN_OBJECT: 'IN_OBJECT',
    OBJECT_ENDED: 'OBJECT_ENDED',

    IN_DIRECTIVE: 'IN_DIRECTIVE',
    DIRECTIVE_ENDED: 'DIRECTIVE_ENDED',

    IN_ARRAY: 'IN_ARRAY',
    ARRAY_ENDED: 'ARRAY_ENDED',

    IN_PRIMITIVE: 'IN_PRIMITIVE',
    PRIMITIVE_ENDED: 'PRIMITIVE_ENDED',
    PRIMITIVE_ENDED_WITH_EMPTY_VALUE: 'PRIMITIVE_ENDED_WITH_EMPTY_VALUE',

    IN_SHORTHAND: 'IN_SHORTHAND',
    SHORTHAND_ENDED: 'SHORTHAND_ENDED',

    IN_VALUE: 'IN_VALUE',
    IN_QUOTED_VALUE: 'IN_QUOTED_VALUE',
    VALUE_ENDED: 'VALUE_ENDED',
    NEXT_KEY_ENCOUNTERED: 'NEXT_KEY_ENCOUNTERED',

    COMMENT_ENCOUNTERED: 'COMMENT_ENCOUNTERED',
    IN_COMMENT: 'IN_COMMENT',
    COMMENT_ENDED: 'COMMENT_ENDED',

    ERROR: 'ERROR'
  });

  static prefixMeaning = Object.freeze({
    '..': YarbpLexer.states.IN_ARRAY,
    '.': YarbpLexer.states.IN_PRIMITIVE,
    ':': YarbpLexer.states.IN_OBJECT,
    '!': YarbpLexer.states.IN_DIRECTIVE
  });

  static endStatesForPrefixes = Object.freeze({
    ':': YarbpLexer.states.OBJECT_ENDED,
    '..': YarbpLexer.states.ARRAY_ENDED,
  });

  static allowedTypes = new Set([
    TokenTypes.START,
    TokenTypes.COMMENT,
    TokenTypes.DIRECTIVE,
    TokenTypes.SCOPE_IN,
    TokenTypes.PREFIX
  ]);

  static nonPrimitivePrefixes = ['..', ':'];

  static StateTypeMapping = Object.freeze({
    [YarbpLexer.states.IN_PRIMITIVE]: TokenTypes.PRIMITIVE,
    [YarbpLexer.states.IN_OBJECT]: TokenTypes.OBJECT,
    [YarbpLexer.states.IN_DIRECTIVE]: TokenTypes.DIRECTIVE,
    [YarbpLexer.states.IN_VALUE]: TokenTypes.ANY_VALUE,
    [YarbpLexer.states.IN_ARRAY]: TokenTypes.ARRAY,
    [YarbpLexer.states.IN_QUOTED_VALUE]: TokenTypes.ANY_VALUE
  });

  static prefixSymbols = ['!', '.', ':'];
  static spaceSymbols = [' ', '\n'];
  static tokenValidationRegexp = /^[^"'<>&=\[\]{}/\\\x00-\x1F]*$/;
  static valueValidationRegexp = /^[^\x00-\x09\x0B-\x0C\x0E-\x1F]*$/;

  constructor(text=undefined) {
    this.text = undefined;
    this.state = undefined;
    this.tokens = undefined;
    this.currentToken = undefined;
    this.currentMatchPosition = undefined;
    this.error = undefined;
    this.previousState = undefined;
    this.openedScopes = undefined;
    this.prettyView = undefined;

    this.rendererObserver = undefined;
    this.isObserved = false;

    if (text) this.setInitialState(text);
  };

  /* region PUBLIC API */

  setObserver(renderer) {
    this.rendererObserver = renderer;
    this.isObserved = true;
  }

  setInitialState(text) {
    this.text = text.at(-1) !== '\n'? text + '\n' : text;
    this.state = YarbpLexer.states.WAITING;
    this.tokens = [];
    this.currentToken = '';
    this.currentMatchPosition = undefined;
    this.error = '';
    this.previousState = undefined;
    this.openedScopes = []; /* used as a stack to generate SCOPE_(IN/OUT) */
    this.prettyView = '';

    this.addControlToken(TokenTypes.START,0);
  }

  tokenize() {
    for (let pos = 0; pos < this.text.length; pos++) {
      const char = this.text[pos];
      this.state = this.defineState(char);
      this.handleState(char, pos);
    }

    const lastPosition = this.text.length - 1;
    this.currentIndent = -1;
    this.generateScopeTokens(lastPosition, TokenTypes.END);
    this.addControlToken(TokenTypes.END, lastPosition);

    this.postprocessTokens();
    this.callRendererObserver()
  };

  getPrettyView() {
    this.setPrettyView();
    return this.prettyView;
  };

  /* endregion */

  /* region helpers */

  callRendererObserver() {
    if (!this.rendererObserver || !this.isObserved) return;
    this.rendererObserver.call();
  }

  specifyCommentType(value) {
    if (value[2] === '?') return TokenTypes.COMMENT_TODO;
    if (value[2] === '/') return TokenTypes.COMMENT_OUT;
    if (value[2] === '!') return TokenTypes.COMMENT_IMPORTANT;
    return TokenTypes.COMMENT;
  }

  addToken(type=undefined, start=undefined,
           value=undefined, prefix=undefined) {

    /* Do not use for adding control tokens. Use addControlToken() instead. */

    type = type === TokenTypes.COMMENT
      ? this.specifyCommentType(this.currentToken) : type

    start = start ?? this.currentMatchPosition;
    type = type || YarbpLexer.StateTypeMapping[this.state];
    type = this.error ? TokenTypes.UNPARSED : type;
    const lastToken = this.tokens.at(-1);
    const prefix_value = lastToken && lastToken.type === TokenTypes.PREFIX
      ? lastToken.value : undefined;

    const end = (type === TokenTypes.ANY_VALUE && value === '') || prefix === '='
      ? start
      : start + ((value || this.currentToken).length || (prefix?.length ?? 0));

    let token = new Token({
      type: type,
      value: (value ?? this.currentToken).trim(),
      prefix: prefix || prefix_value,
      start: start,
      end: end,
      error: this.error
    });

    let typeToken;

    this.recalcBounds(token);

    if (token.type === TokenTypes.OBJECT
        || token.type === TokenTypes.PRIMITIVE
        || token.type === TokenTypes.ARRAY) {

      let [tokenValue, tokenType] = this.splitType(token.value);

      if (tokenValue && tokenType) {
        token.end = token.end - tokenType.length - 1;
        token.value = tokenValue;

        typeToken = new Token({
          type: TokenTypes.TYPE,
          value: tokenType.trim(),
          prefix: '',
          start: token.start + token.value.length + (token.type === TokenTypes.OBJECT ? 1 : 2),
          end: token.end + tokenType.length + 1,
          error: ''
        });
      }
    }

    this.tokens.push(token);
    if (typeToken && typeToken.value) { this.tokens.push(typeToken); }

    this.currentToken = '';
    this.error = '';
  };

  addControlToken(type, start=undefined) {
    this.tokens.push(new Token({
      type: type, value: '', start: start, end: start, error: ''}));
  };

  splitType(str, delimiter = ':') {
    const parts = str.split(delimiter);
    if (parts.length === 1) return [str, ''];

    const val = parts.slice(0, -1).join(delimiter);
    const type = parts[parts.length - 1];

    return [val, type];
  };

  recalcBounds(token) {
    if (token.type === TokenTypes.PREFIX ||
        token.start === token.end) return;

    let text = token.prefix + token.value;
    const leadingSpaces = calcLeadingSpaces(text);
    const trailingSpaces = calcTrailingSpaces(text);

    token.start = token.start + leadingSpaces;
    if (token.prefix && token.value) { token.start -= token.prefix.length }

    token.end -= trailingSpaces;
  };

  /* endregion */

  /* region postprocessing */

  postprocessTokens() {
    this.retypeEmptyObjectsArray();
    this.reshapeInlineArrayValues();
  };

  retypeEmptyObjectsArray() {
    const frameSize = 4;

    const emptyObjectIndices = [];
    let isInArrayScope = false;

    for (let i = 0; i <= this.tokens.length - frameSize; i++) {
      const scopeIn = this.tokens[i];
      const object = this.tokens[i+1];
      const third = this.tokens[i+2];
      const fourth = this.tokens[i+3];

      const isEmptyObject = scopeIn.type === TokenTypes.SCOPE_IN
        && object.type === TokenTypes.OBJECT && !object.prefix
        && third.type === TokenTypes.SCOPE_OUT;

      const isEmptyObjectWithComment = scopeIn.type === TokenTypes.SCOPE_IN
        && object.type === TokenTypes.OBJECT && !object.prefix
        && third.type === TokenTypes.COMMENT
        && fourth.type === TokenTypes.SCOPE_OUT;

      if (isEmptyObject && isInArrayScope) {
        emptyObjectIndices.push(i);
        emptyObjectIndices.push(i + 2);
        object.type = TokenTypes.ANY_VALUE;

        const unparsedTail = object.end < third.end ? this.text.slice(object.end, third.end) : '';
        if (unparsedTail) {
          object.value += unparsedTail;
          object.value = object.value.replaceAll('\n', '');
          object.end += unparsedTail.length;
        }
      }

      if (isEmptyObjectWithComment && isInArrayScope) {
        emptyObjectIndices.push(i);
        emptyObjectIndices.push(i + 3);
        object.type = TokenTypes.ANY_VALUE;
      }

      isInArrayScope = object.type === TokenTypes.ARRAY
        || isInArrayScope && object.type !== TokenTypes.OBJECT;
    }

    [...new Set(emptyObjectIndices)]
      .sort((a, b) => b - a)
      .forEach(index => this.tokens.splice(index, 1));
  }

  reshapeInlineArrayValues() {

  }

  /* endregion */

  /* region scope management */

  countCurrentIndent() {
    this.currentIndent = calcTrailingSpaces(this.currentToken);
  };

  generateScopeTokens(pos, type) {
    while (this.openedScopes.length && this.currentIndent <= this.openedScopes.at(-1).indent) {
      this.openedScopes.pop();
      this.addControlToken(TokenTypes.SCOPE_OUT, pos);
    }

    if (type === TokenTypes.PRIMITIVE || type === TokenTypes.END) return;

    this.openedScopes.push(new Scope(this.currentIndent, type));
    this.addControlToken(TokenTypes.SCOPE_IN, pos);
  };

  /* endregion */

  /* region state engine */

  defineState(char) {

    this.previousState = this.state;

    if (this.currentToken === ':' && char === '\n'
        && this.tokens.every(token => YarbpLexer.allowedTypes.has(token.type)))
      return YarbpLexer.states.OBJECT_ENDED;

    if (this.currentToken === '..' && char === '\n'
        && this.tokens.every(token => YarbpLexer.allowedTypes.has(token.type)))
      return YarbpLexer.states.ARRAY_ENDED;

    if ([YarbpLexer.states.WAITING, YarbpLexer.states.WAITING_FOR_VALUE].includes(this.state)
        && char === '\n')
      return YarbpLexer.states.WAITING_AFTER_NEWLINE;

    if (this.state === YarbpLexer.states.WAITING && YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.WAITING;

    if (this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE && YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.WAITING_AFTER_NEWLINE;

    if ((this.state === YarbpLexer.states.WAITING
        || this.state === YarbpLexer.states.WAITING_FOR_VALUE
        || this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE)
        && YarbpLexer.prefixSymbols.includes(char))
      return YarbpLexer.states.PREFIX_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING && char === '=')
      return YarbpLexer.states.IN_SHORTHAND;

    if (this.state === YarbpLexer.states.IN_SHORTHAND && char === '\n')
      return YarbpLexer.states.SHORTHAND_ENDED;

    if ([YarbpLexer.states.IN_VALUE, YarbpLexer.states.IN_SHORTHAND].includes(this.state)
        && !YarbpLexer.spaceSymbols.includes(char) && this.currentToken.slice(-2) === ' .')
      return YarbpLexer.states.NEXT_KEY_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING_FOR_VALUE
        && char !== '"' && char !== "'" && !YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.IN_VALUE;

    if ([YarbpLexer.states.WAITING_FOR_VALUE, YarbpLexer.states.WAITING_AFTER_NEWLINE].includes(this.state)
        && (char === '"' || char === "'"|| char === '('))
      return YarbpLexer.states.IN_QUOTED_VALUE;

    if (this.state === YarbpLexer.states.IN_QUOTED_VALUE
        && ((this.currentToken.trim())[0] === this.currentToken.at(-1) && this.currentToken.at(-1) !== '('
            || (this.currentToken.trim()[0] === '(' && this.currentToken.at(-1) === ')'))
        &&  YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.VALUE_ENDED;

    if (this.state === YarbpLexer.states.IN_VALUE && char === '\n')
      return YarbpLexer.states.VALUE_ENDED;

    if (this.state !== YarbpLexer.states.IN_QUOTED_VALUE
         && ['-', '!', '/', '?'].includes(char) && this.currentToken.slice(-2) === '--')
      return YarbpLexer.states.COMMENT_ENCOUNTERED;

    if (this.state === YarbpLexer.states.IN_COMMENT
        && char === '\n') return YarbpLexer.states.COMMENT_ENDED;

    if (this.state === YarbpLexer.states.IN_OBJECT && !YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.IN_OBJECT;

    if (this.state === YarbpLexer.states.IN_PRIMITIVE && !YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.IN_PRIMITIVE;

    if (this.state === YarbpLexer.states.IN_PRIMITIVE && char === ' ')
      return YarbpLexer.states.PRIMITIVE_ENDED;

    if (this.state === YarbpLexer.states.IN_ARRAY &&  YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.ARRAY_ENDED;

    if (this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE && !YarbpLexer.spaceSymbols.includes(char)
        && !YarbpLexer.prefixSymbols.includes(char))
      return YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING
        && this.tokens.at(-1).type === TokenTypes.START)
      return YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED;

    if (this.state === YarbpLexer.states.IN_OBJECT && YarbpLexer.spaceSymbols.includes(char))
      return YarbpLexer.states.OBJECT_ENDED;

    if (this.state === YarbpLexer.states.IN_PREFIX && YarbpLexer.prefixSymbols.includes(char))
      return YarbpLexer.states.IN_PREFIX;

    if (this.state === YarbpLexer.states.IN_PREFIX && !YarbpLexer.prefixSymbols.includes(char))
      return YarbpLexer.states.IDENTIFIER_ENCOUNTERED;

    if (this.state === YarbpLexer.states.IN_DIRECTIVE && char !== '\n')
      return YarbpLexer.states.IN_DIRECTIVE;

    if (this.state === YarbpLexer.states.IN_DIRECTIVE && char === '\n')
      return YarbpLexer.states.DIRECTIVE_ENDED;

    if (this.state === YarbpLexer.states.IN_PRIMITIVE && char === '\n')
      return YarbpLexer.states.PRIMITIVE_ENDED_WITH_EMPTY_VALUE;

    return this.state;
  };

  handleState(char, pos) {
    const handlers = {
      [YarbpLexer.states.WAITING_AFTER_NEWLINE]:  () => this.addCharToToken(char),
      [YarbpLexer.states.WAITING]:                () => this.addCharToToken(char),
      [YarbpLexer.states.IN_PREFIX]:              () => this.addCharToToken(char),
      [YarbpLexer.states.IN_DIRECTIVE]:           () => this.addCharToToken(char),
      [YarbpLexer.states.IN_OBJECT]:              () => this.addCharToToken(char),
      [YarbpLexer.states.IN_PRIMITIVE]:           () => this.addCharToToken(char),
      [YarbpLexer.states.IN_COMMENT]:             () => this.addCharToToken(char),
      [YarbpLexer.states.IN_ARRAY]:               () => this.addCharToToken(char),
      [YarbpLexer.states.IN_VALUE]:               () => this.addCharToToken(char),
      [YarbpLexer.states.IN_QUOTED_VALUE]:        () => this.addCharToToken(char),
      [YarbpLexer.states.IN_SHORTHAND]:           () => this.addCharToToken(char),

      [YarbpLexer.states.PREFIX_ENCOUNTERED]:               () => this.handlePrefixEncountered(char, pos),
      [YarbpLexer.states.IDENTIFIER_ENCOUNTERED]:           () => this.handleIdentifierEncountered(char, pos),
      [YarbpLexer.states.DIRECTIVE_ENDED]:                  () => this.handleDirectiveEnded(char),
      [YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED]:      () => this.handleImplicitObjectEncountered(char, pos),
      [YarbpLexer.states.OBJECT_ENDED]:                     () => this.handleObjectEnded(char),
      [YarbpLexer.states.PRIMITIVE_ENDED]:                  () => this.handlePrimitiveEnded(pos, char),
      [YarbpLexer.states.PRIMITIVE_ENDED_WITH_EMPTY_VALUE]: () => this.handlePrimitiveEndedEmpty(pos, char),
      [YarbpLexer.states.ARRAY_ENDED]:                      () => this.handleArrayEnded(pos, char),
      [YarbpLexer.states.VALUE_ENDED]:                      () => this.handleValueEnded(char, pos),
      [YarbpLexer.states.NEXT_KEY_ENCOUNTERED]:             () => this.handleNextKeyEncountered(char, pos),
      [YarbpLexer.states.COMMENT_ENCOUNTERED]:              () => this.handleCommentEncountered(char, pos),
      [YarbpLexer.states.COMMENT_ENDED]:                    () => this.handleCommentEnded(char),
      [YarbpLexer.states.SHORTHAND_ENDED]:                  () => this.handleShorthandEnded(char, pos),
      [YarbpLexer.states.ERROR]:                            () => this.handleUnparsed()
    };

    const handler = handlers[this.state];
    if (handler) {
      handler();
    }
  };

  addCharToToken(char) { this.currentToken += char; };

  handlePrefixEncountered(char, pos) {
    this.countCurrentIndent(char);
    this.currentToken = char;
    this.currentMatchPosition = pos;
    this.state = YarbpLexer.states.IN_PREFIX;
  };

  handleImplicitObjectEncountered(char, pos) {
    this.countCurrentIndent(char);
    this.generateScopeTokens(pos, TokenTypes.OBJECT);

    this.state = YarbpLexer.states.IN_OBJECT;
    this.currentToken = char;
    this.currentMatchPosition = pos;
  };

  handleIdentifierEncountered(char, pos) {
    if (YarbpLexer.nonPrimitivePrefixes.includes(this.currentToken)
        || (this.currentToken === '.'
            && this.openedScopes.length
            && this.currentIndent <= this.openedScopes.at(-1).indent
            && this.currentIndent !== 0)) {
      this.generateScopeTokens(
        pos - this.currentToken.length,
        YarbpLexer.StateTypeMapping[
          YarbpLexer.prefixMeaning[this.currentToken]]);
    }

    this.addToken(TokenTypes.PREFIX);

    this.state = YarbpLexer.prefixMeaning[this.tokens.at(-1).value];

    if (!this.state) {
      this.error = 'unknown prefix value';
      this.state = YarbpLexer.states.ERROR;
    }

    this.currentToken += char;
    this.currentMatchPosition = pos;

    if (this.state !== YarbpLexer.states.IN_DIRECTIVE && YarbpLexer.spaceSymbols.includes(char)) {
      this.state = YarbpLexer.endStatesForPrefixes[this.tokens.at(-1).value];
      this.handleState(char, pos);
    }
  };

  handleDirectiveEnded(char) {
    this.addToken(TokenTypes.DIRECTIVE);

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  };

  handleUnparsed() {
    this.addToken(TokenTypes.UNPARSED);
    this.state = undefined;
  };

  handleObjectEnded(char) {
    if (!YarbpLexer.tokenValidationRegexp.test(this.currentToken) && !this.currentToken.includes('\n')) {
      this.error = 'invalid char';
      this.state = YarbpLexer.states.ERROR;
      return;
    }

    if (this.currentToken === ':') {
      this.generateScopeTokens(this.currentMatchPosition, TokenTypes.OBJECT);
      this.addToken(TokenTypes.PREFIX);
      this.addToken(TokenTypes.OBJECT, undefined, undefined, ':');
    } else {
      this.addToken(TokenTypes.OBJECT);
    }

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  };

  handlePrimitiveEnded(pos, char) {
    if (!YarbpLexer.tokenValidationRegexp.test(this.currentToken)) {
      this.error = 'invalid char';
      this.state = YarbpLexer.states.ERROR;
      return;
    }
    this.addToken(TokenTypes.PRIMITIVE);

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING_FOR_VALUE;

    this.currentMatchPosition = pos + 1;
  };

  handleShorthandEnded(char, pos) {
    const value = this.currentToken;

    this.addToken(
      TokenTypes.ANY_VALUE, pos - value.length + 1, value);

    this.state = YarbpLexer.states.WAITING_AFTER_NEWLINE;
    this.currentMatchPosition = pos + 1;
  }

  handlePrimitiveEndedEmpty(pos, char) {
    this.handlePrimitiveEnded();
    this.addToken(TokenTypes.ANY_VALUE, pos, '');

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  }

  handleArrayEnded(pos, char) {
    if (!YarbpLexer.tokenValidationRegexp.test(this.currentToken)) {
      this.error = 'invalid char';
      this.state = YarbpLexer.states.ERROR;
      return;
    }


    if (this.currentToken === '..') {
      this.generateScopeTokens(this.currentMatchPosition, TokenTypes.ARRAY);
      this.addToken(TokenTypes.PREFIX);
      this.addToken(TokenTypes.ARRAY, undefined, undefined, '..');
    } else {
      this.addToken(TokenTypes.ARRAY);
    }

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING_FOR_VALUE;

    this.currentMatchPosition = pos + 1;
  };

  handleValueEnded(char, pos) {
    const start = pos - this.currentToken.length;
    this.addToken(TokenTypes.ANY_VALUE, start);

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  };

  handleNextKeyEncountered(char, pos) {
    const valueLength = this.currentToken.length - 2;
    const start = pos - this.currentToken.length;

    this.addToken(
      TokenTypes.ANY_VALUE,
      start,
      this.currentToken.slice(0, -2));
    this.addToken(
      TokenTypes.PREFIX,
      this.currentMatchPosition + valueLength + 1,
      '.');

    this.state = YarbpLexer.states.IN_PRIMITIVE;

    this.currentToken += char;
    this.currentMatchPosition = pos;
  };

  handleCommentEncountered(char, pos) {
    let expectedTypeWhenCommentMet = YarbpLexer.StateTypeMapping[this.previousState];

    if (expectedTypeWhenCommentMet && !YarbpLexer.valueValidationRegexp.test(this.currentToken)) {
      this.error = 'invalid char';
      this.state = YarbpLexer.states.ERROR;
      return;
    }

    if (this.currentToken.slice(0, -2) && expectedTypeWhenCommentMet) {
      this.currentToken = this.currentToken.slice(0, -2);
      this.addToken(expectedTypeWhenCommentMet);
    }

    if ([TokenTypes.PRIMITIVE, TokenTypes.TYPE].includes(this.tokens.at(-1).type)) {
      this.addToken(TokenTypes.ANY_VALUE, pos - 3, '');
    }

    this.state = YarbpLexer.states.IN_COMMENT;
    this.currentToken = '--' + char;
    this.currentMatchPosition = pos - 2;
  };

  handleCommentEnded(char) {
    this.addToken(TokenTypes.COMMENT);

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  };

  /* endregion */

  /* region pretty view */

  setPrettyView() {
    if (!this.tokens.length) return '';

    const displayValues = this.tokens.map(obj => {
      const displayObj = {};
      Object.values(Token.attrs).forEach(attr => {
        let val = String(obj[attr] ?? '');
        displayObj[attr] = val.includes('\n') ? '{NOT_DISPLAYED}' : val;
      });
      return displayObj;
    });

    const colWidths = Object.values(Token.attrs).map((header, index) =>
      Math.max(
        header.length,
        ...displayValues.map(obj => String(obj[header] ?? '').length)
      )
    );

    let res = '';

    const line = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
    res += line + '\n';
    res += '| '
      + Object.values(Token.attrs).map((h, i) => h.padEnd(colWidths[i])).join(' | ')
      + ' |' + '\n';
    res += line + '\n';

    displayValues.forEach(obj => {
      res += '| ' + Object.values(Token.attrs).map((h, i) =>
        String(obj[h] ?? '').padEnd(colWidths[i])
      ).join(' | ') + ' |' + '\n';
    });

    res += line + '\n';

    this.prettyView = res;
  };

  /* endregion */
}