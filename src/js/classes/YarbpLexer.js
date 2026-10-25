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
    this.type = props.type;
    this.value = props.value;
    this.prefix = props.prefix;
    this.start = props.start;
    this.end = props.end;
    this.error = props.error;
  }
}

class Scope {
  constructor(indent, type) {
    this.indent = indent;
    this.type = type;

    /* Неявный объект внутри массива: решение принимается при закрытии scope. */
    this.deferred = false;
    this.scopeInPos = undefined;
    this.scopeStartIndex = undefined;
    this.objectToken = undefined;
    this.objectIndex = undefined;
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
  static spaceSymbols = [' ', '\n', '\t'];
  static tokenValidationRegexp = /^[^"'<>&=\[\]{}/\\\x00-\x1F]*$/;
  static valueValidationRegexp = /^[^\x00-\x09\x0B-\x0C\x0E-\x1F]*$/;
  static isSpaceChar(char) { return char === ' ' || char === '\n' || char === '\t'; }
  static isPrefixChar(char) { return char === '!' || char === '.' || char === ':'; }



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
    this.onlyAllowedTokens = true;

    this.addControlToken(TokenTypes.START,0);
  }

  tokenize() {
    for (let pos = 0; pos < this.text.length; pos++) {
      const char = this.text[pos];
      this.state = this.defineState(char);
      this.handleState(char, pos);
    }

    if (this.state === YarbpLexer.states.IN_QUOTED_VALUE && this.currentToken.trim()) {
      this.error = 'unterminated quoted value';
      this.addToken(TokenTypes.UNPARSED);
    }

    const lastPosition = this.text.length - 1;
    this.currentIndent = -1;
    this.generateScopeTokens(lastPosition, TokenTypes.END);
    this.addControlToken(TokenTypes.END, lastPosition);
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

    try {
      this.rendererObserver.call();
    } catch (error) {
      // Ошибка рендера не должна ломать токенизацию и обновление редактора.
      console.error('[lexer] renderer failed:', error);
    }
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
    const lastToken = this.tokens[this.tokens.length - 1];
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
        token.value = tokenValue.trim();

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

    const activeScope = this.openedScopes[this.openedScopes.length - 1];
    if (activeScope?.deferred && !activeScope.objectToken
        && token.type === TokenTypes.OBJECT) {
      activeScope.objectToken = token;
      activeScope.objectIndex = this.tokens.length;
    }

    this.tokens.push(token);
    if (!YarbpLexer.allowedTypes.has(token.type)) this.onlyAllowedTokens = false;
    if (typeToken && typeToken.value) {
      this.tokens.push(typeToken);
      if (!YarbpLexer.allowedTypes.has(typeToken.type)) this.onlyAllowedTokens = false;
    }

    this.currentToken = '';
    this.error = '';
  };

  addControlToken(type, start=undefined) {
    this.tokens.push(new Token({
      type: type, value: '', start: start, end: start, error: ''}));
    if (!YarbpLexer.allowedTypes.has(type)) this.onlyAllowedTokens = false;
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

  /* region scope management */

  countCurrentIndent() {
    this.currentIndent = calcTrailingSpaces(this.currentToken);
  };

  generateScopeTokens(pos, type, implicitObject = false) {
    while (this.openedScopes.length && this.currentIndent <= this.openedScopes.at(-1).indent) {
      this.closeScope(this.openedScopes[this.openedScopes.length - 1], pos);
    }

    if (type === TokenTypes.PRIMITIVE || type === TokenTypes.END) return;

    const parent = this.openedScopes[this.openedScopes.length - 1];
    const scope = new Scope(this.currentIndent, type);
    scope.scopeInPos = pos;
    scope.scopeStartIndex = this.tokens.length;
    scope.deferred = implicitObject && parent?.type === TokenTypes.ARRAY;

    this.openedScopes.push(scope);
    if (!scope.deferred) this.addControlToken(TokenTypes.SCOPE_IN, pos);
  };

  closeScope(scope, pos) {
    let promoted = false;
    if (scope.deferred) promoted = this.finalizeDeferredScope(scope, pos);

    this.openedScopes.pop();
    if (!promoted) this.addControlToken(TokenTypes.SCOPE_OUT, pos);
  };

  /**
   * Неявный объект внутри массива: пустой объект — это значение массива,
   * объект с детьми — обычный объект. Решение принимается при закрытии scope,
   * без отдельного прохода по токенам.
   */
  finalizeDeferredScope(scope, pos) {
    const object = scope.objectToken;
    const after = object ? this.tokens.slice(scope.objectIndex + 1) : [];
    const onlyComment = after.length === 1 && after[0].type === TokenTypes.COMMENT;
    const promotes = Boolean(object) && !object.prefix
      && (after.length === 0 || onlyComment);

    if (promotes) {
      object.type = TokenTypes.ANY_VALUE;

      if (!onlyComment && object.end < pos) {
        const tail = this.text.slice(object.end, pos);
        if (tail) {
          object.value += tail;
          object.value = object.value.replaceAll('\n', '').trim();
          object.end += tail.length;
        }
      }

      return true;
    }

    const scopeIn = new Token({
      type: TokenTypes.SCOPE_IN,
      value: '',
      start: scope.scopeInPos,
      end: scope.scopeInPos,
      error: ''
    });
    this.tokens.splice(scope.objectIndex ?? scope.scopeStartIndex, 0, scopeIn);
    return false;
  };

  /* endregion */

  /* region state engine */

  defineState(char) {

    this.previousState = this.state;

    if (this.currentToken === ':' && char === '\n' && this.onlyAllowedTokens)
      return YarbpLexer.states.OBJECT_ENDED;

    if (this.currentToken === '..' && char === '\n' && this.onlyAllowedTokens)
      return YarbpLexer.states.ARRAY_ENDED;

    // Невалидный мусор, накопленный в WAITING, иначе молча потеряется.
    if (this.state === YarbpLexer.states.WAITING && char === '\n'
        && !YarbpLexer.tokenValidationRegexp.test(this.currentToken))
      return YarbpLexer.states.ERROR;

    if ((this.state === YarbpLexer.states.WAITING
        || this.state === YarbpLexer.states.WAITING_FOR_VALUE)
        && char === '\n')
      return YarbpLexer.states.WAITING_AFTER_NEWLINE;

    if (this.state === YarbpLexer.states.WAITING && YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.WAITING;

    if (this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE && YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.WAITING_AFTER_NEWLINE;

    // Комментарий вида `--!` должен проверяться до префикса `!`,
    // иначе IMPORTANT превращается в директиву.
    if (this.state !== YarbpLexer.states.IN_QUOTED_VALUE
         && (char === '-' || char === '!' || char === '/' || char === '?')
         && this.currentToken.slice(-2) === '--')
      return YarbpLexer.states.COMMENT_ENCOUNTERED;

    if ((this.state === YarbpLexer.states.WAITING
        || this.state === YarbpLexer.states.WAITING_FOR_VALUE
        || this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE)
        && YarbpLexer.isPrefixChar(char))
      return YarbpLexer.states.PREFIX_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING && char === '=')
      return YarbpLexer.states.IN_SHORTHAND;

    if (this.state === YarbpLexer.states.IN_SHORTHAND && char === '\n')
      return YarbpLexer.states.SHORTHAND_ENDED;

    if ((this.state === YarbpLexer.states.IN_VALUE
        || this.state === YarbpLexer.states.IN_SHORTHAND)
        && !YarbpLexer.isSpaceChar(char) && this.currentToken.slice(-2) === ' .')
      return YarbpLexer.states.NEXT_KEY_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING_FOR_VALUE
        && char !== '"' && char !== "'" && !YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.IN_VALUE;

    if ((this.state === YarbpLexer.states.WAITING_FOR_VALUE
        || this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE)
        && (char === '"' || char === "'"|| char === '('))
      return YarbpLexer.states.IN_QUOTED_VALUE;

    if (this.state === YarbpLexer.states.IN_QUOTED_VALUE
        && ((this.currentToken.trim())[0] === this.currentToken.at(-1) && this.currentToken.at(-1) !== '('
            || (this.currentToken.trim()[0] === '(' && this.currentToken.at(-1) === ')'))
        &&  char === '\n')
      return YarbpLexer.states.VALUE_ENDED;

    if (this.state === YarbpLexer.states.IN_QUOTED_VALUE
        && ((this.currentToken.trim())[0] === this.currentToken.at(-1) && this.currentToken.at(-1) !== '('
            || (this.currentToken.trim()[0] === '(' && this.currentToken.at(-1) === ')'))
        &&  YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.IN_VALUE;

    if (this.state === YarbpLexer.states.IN_VALUE && char === '\n')
      return YarbpLexer.states.VALUE_ENDED;

    if (this.state === YarbpLexer.states.IN_COMMENT
        && char === '\n') return YarbpLexer.states.COMMENT_ENDED;

    if (this.state === YarbpLexer.states.IN_OBJECT && !YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.IN_OBJECT;

    if (this.state === YarbpLexer.states.IN_PRIMITIVE && !YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.IN_PRIMITIVE;

    if (this.state === YarbpLexer.states.IN_PRIMITIVE
        && (char === ' ' || char === '\t'))
      return YarbpLexer.states.PRIMITIVE_ENDED;

    if (this.state === YarbpLexer.states.IN_ARRAY &&  YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.ARRAY_ENDED;

    if (this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE && !YarbpLexer.isSpaceChar(char)
        && !YarbpLexer.isPrefixChar(char))
      return YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED;

    if (this.state === YarbpLexer.states.WAITING
        && this.tokens.at(-1).type === TokenTypes.START)
      return YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED;

    if (this.state === YarbpLexer.states.IN_OBJECT && YarbpLexer.isSpaceChar(char))
      return YarbpLexer.states.OBJECT_ENDED;

    if (this.state === YarbpLexer.states.IN_PREFIX && YarbpLexer.isPrefixChar(char))
      return YarbpLexer.states.IN_PREFIX;

    if (this.state === YarbpLexer.states.IN_PREFIX && !YarbpLexer.isPrefixChar(char))
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
    const S = YarbpLexer.states;

    switch (this.state) {
      case S.WAITING_AFTER_NEWLINE:
      case S.WAITING:
      case S.IN_PREFIX:
      case S.IN_DIRECTIVE:
      case S.IN_OBJECT:
      case S.IN_PRIMITIVE:
      case S.IN_COMMENT:
      case S.IN_ARRAY:
      case S.IN_VALUE:
      case S.IN_SHORTHAND:
        this.addCharToToken(char);
        return;

      case S.IN_QUOTED_VALUE:
        if (this.previousState !== S.IN_QUOTED_VALUE) {
          // После комментария currentMatchPosition может указывать на `--`.
          // Для кавычки начинаем токен с её реальной позиции, иначе
          // диапазоны VALUE и COMMENT пересекаются.
          this.currentToken = '';
          this.currentMatchPosition = pos;
        }
        this.addCharToToken(char);
        return;

      case S.PREFIX_ENCOUNTERED:
        this.handlePrefixEncountered(char, pos);
        return;

      case S.IDENTIFIER_ENCOUNTERED:
        this.handleIdentifierEncountered(char, pos);
        return;

      case S.DIRECTIVE_ENDED:
        this.handleDirectiveEnded(char);
        return;

      case S.IMPLICIT_OBJECT_ENCOUNTERED:
        this.handleImplicitObjectEncountered(char, pos);
        return;

      case S.OBJECT_ENDED:
        this.handleObjectEnded(char);
        return;

      case S.PRIMITIVE_ENDED:
        this.handlePrimitiveEnded(pos, char);
        return;

      case S.PRIMITIVE_ENDED_WITH_EMPTY_VALUE:
        this.handlePrimitiveEndedEmpty(pos, char);
        return;

      case S.ARRAY_ENDED:
        this.handleArrayEnded(pos, char);
        return;

      case S.VALUE_ENDED:
        this.handleValueEnded(char, pos);
        return;

      case S.NEXT_KEY_ENCOUNTERED:
        this.handleNextKeyEncountered(char, pos);
        return;

      case S.COMMENT_ENCOUNTERED:
        this.handleCommentEncountered(char, pos);
        return;

      case S.COMMENT_ENDED:
        this.handleCommentEnded(char);
        return;

      case S.SHORTHAND_ENDED:
        this.handleShorthandEnded(char, pos);
        return;

      case S.ERROR:
        this.handleUnparsed(char);
        return;
    }
  };

  addCharToToken(char) {
    // Табы считаем пробелами: позиции сохраняются, но токен не ломается
    // о tokenValidationRegexp и отступ учитывается.
    this.currentToken += char === '\t' ? ' ' : char;
  };

  handlePrefixEncountered(char, pos) {
    this.countCurrentIndent(char);
    this.currentToken = char;
    this.currentMatchPosition = pos;
    this.state = YarbpLexer.states.IN_PREFIX;
  };

  handleImplicitObjectEncountered(char, pos) {
    this.countCurrentIndent(char);
    this.generateScopeTokens(pos, TokenTypes.OBJECT, true);

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

    if (this.state !== YarbpLexer.states.IN_DIRECTIVE && YarbpLexer.isSpaceChar(char)) {
      const endState = YarbpLexer.endStatesForPrefixes[this.tokens[this.tokens.length - 1].value];

      if (endState) {
        this.state = endState;
        this.handleState(char, pos);
      } else {
        // Например `. ` или `.` + перевод строки: ключа нет.
        // Помечаем ошибку, но не теряем остаток документа.
        this.error = 'empty key';
        this.state = YarbpLexer.states.ERROR;
        this.handleUnparsed(char);
      }
    }
  };

  handleDirectiveEnded(char) {
    this.addToken(TokenTypes.DIRECTIVE);

    this.state = char === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  };

  handleUnparsed(char) {
    this.addToken(TokenTypes.UNPARSED);
    this.currentToken = '';
    this.currentMatchPosition = undefined;
    // После ошибки начинаем следующий значимый фрагмент как новую строку:
    // так остаток документа не теряется.
    this.state = YarbpLexer.states.WAITING_AFTER_NEWLINE;
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
    this.handlePrimitiveEnded(pos, char);
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
      pos - 1,
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

    const previousTokenType = this.tokens[this.tokens.length - 1].type;
    if (previousTokenType === TokenTypes.PRIMITIVE || previousTokenType === TokenTypes.TYPE) {
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