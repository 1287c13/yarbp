import {calcLeadingSpaces, calcTrailingSpaces} from '../utils/utils.js';

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
  CODE_BLOCK: 'CODE_BLOCK', /* fenced code island: raw text + optional language */

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

    /* Поля фрагмента кода и «значения с новой строки». В Token.attrs их нет:
       pretty-view и golden-снимки лексера не должны менять состав колонок. */
    this.language = props.language;
    this.contentStart = props.contentStart;
    this.contentEnd = props.contentEnd;
    this.onNextLine = props.onNextLine;
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

    /* значение примитивного ключа на следующей строке */
    WAITING_FOR_NEXT_LINE_VALUE: 'WAITING_FOR_NEXT_LINE_VALUE',
    NEXT_LINE_VALUE_PENDING: 'NEXT_LINE_VALUE_PENDING',
    NEXT_LINE_VALUE_ENCOUNTERED: 'NEXT_LINE_VALUE_ENCOUNTERED',
    NEXT_LINE_VALUE_ABSENT: 'NEXT_LINE_VALUE_ABSENT',

    /* фрагмент кода: ``` язык? сырой текст ``` */
    CODE_BLOCK_ENCOUNTERED: 'CODE_BLOCK_ENCOUNTERED',

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

  /** Длина открывающего fence: 1 или 3 обратных апострофа (2 — не fence). */
  static codeFenceLengthAt(text, pos) {
    let count = 0;
    while (text[pos + count] === '`') count++;
    if (count >= 3) return 3;
    if (count === 1) return 1;
    return 0;
  }

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

    /* Нефатальные замечания: golden-снимки их не видят, строка статуса — видит. */
    this.diagnostics = [];
    this.pendingPrimitive = null;
    this.lastPrimitive = null;
    this.valueStartedOnNextLine = false;
    this.nextPos = undefined;

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

    this.diagnostics = [];
    this.pendingPrimitive = null;
    this.lastPrimitive = null;
    this.valueStartedOnNextLine = false;
    this.nextPos = undefined;

    this.addControlToken(TokenTypes.START,0);
  }

  tokenize() {
    for (let pos = 0; pos < this.text.length; pos++) {
      const char = this.text[pos];
      this.state = this.defineState(char, pos);
      this.handleState(char, pos);

      /* Фрагмент кода — лексический остров: обработчик перескакивает сразу
         за закрывающие кавычки, не пропуская содержимое через автомат. */
      if (this.nextPos !== undefined) {
        pos = this.nextPos;
        this.nextPos = undefined;
      }
    }

    if (this.pendingPrimitive) {
      this.finishPendingPrimitiveAsEmpty();
      this.state = YarbpLexer.states.WAITING_AFTER_NEWLINE;
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

    if (this.valueStartedOnNextLine) {
      token.onNextLine = true;
      this.valueStartedOnNextLine = false;
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

    // Директива без тела (`! ` — имя ещё не набрано) состоит из одного
    // префикса: `token.value` пуст, и сдвинуть начало на длину префикса
    // нечем. Без этой ветки токен начинался бы с пробела после `!`, а сам
    // `!` оставался бы вне директивы — подсветка флейвора, AST-позиция
    // директивы и подсказки видели бы директиву без восклицательного знака
    // (из-за чего вставка из автодополнения дублировала `!`).
    if (token.type === TokenTypes.DIRECTIVE && token.prefix && !token.value) {
      token.start -= token.prefix.length;
      token.end = token.start + token.prefix.length;
      return;
    }

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

  defineState(char, pos) {

    this.previousState = this.state;

    if (this.currentToken === ':' && char === '\n' && this.onlyAllowedTokens)
      return YarbpLexer.states.OBJECT_ENDED;

    if (this.currentToken === '..' && char === '\n' && this.onlyAllowedTokens)
      return YarbpLexer.states.ARRAY_ENDED;

    /* Значение примитива на следующей строке: ключ уже добавлен, ждём
       значение. Пробелы/пустые строки копятся как обычный отступ. */
    if (this.state === YarbpLexer.states.WAITING_FOR_NEXT_LINE_VALUE)
      return this.defineNextLineValueState(char, pos);

    /* Фрагмент кода — лексический остров. Проверяем до обычных правил
       значения, иначе ``` попадёт в IN_VALUE как обычный текст. */
    if ((this.state === YarbpLexer.states.WAITING_FOR_VALUE
        || this.state === YarbpLexer.states.WAITING_AFTER_NEWLINE)
        && char === '`' && this.shouldStartCodeBlock(pos))
      return YarbpLexer.states.CODE_BLOCK_ENCOUNTERED;

    // Невалидный мусор, накопленный в WAITING, иначе молча потеряется.
    if (this.state === YarbpLexer.states.WAITING && char === '\n'
        && !YarbpLexer.tokenValidationRegexp.test(this.currentToken))
      return YarbpLexer.states.ERROR;

    if (this.state === YarbpLexer.states.WAITING_FOR_VALUE && char === '\n'
        && this.lastPrimitive)
      return YarbpLexer.states.NEXT_LINE_VALUE_PENDING;

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
        && this.currentToken.length >= 2
        && ((this.currentToken.trim())[0] === this.currentToken.at(-1) && this.currentToken.at(-1) !== '('
            || (this.currentToken.trim()[0] === '(' && this.currentToken.at(-1) === ')'))
        &&  char === '\n')
      return YarbpLexer.states.VALUE_ENDED;

    if (this.state === YarbpLexer.states.IN_QUOTED_VALUE
        && this.currentToken.length >= 2
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
        && !YarbpLexer.isPrefixChar(char)) {
      // `---`, `--?`, `--!`, `--/` — комментарий, а не неявный объект.
      // Проверяем первые два дефиса, иначе комментарий успевает открыть
      // пустой scope и в IR появляется ключ "".
      if (char === '-' &&
          (this.text[pos + 1] === '-' || this.currentToken.trim().endsWith('-')))
        return YarbpLexer.states.WAITING_AFTER_NEWLINE;
      return YarbpLexer.states.IMPLICIT_OBJECT_ENCOUNTERED;
    }

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

  /**
   * Что стоит на следующей строке после примитивного ключа:
   * значение, новый узел или конец документа.
   *
   * Значением считаются только однозначные начала: кавычка/скобка,
   * три обратных кавычки, число, yes/no/да/нет/null. Bareword остаётся
   * новым узлом (кейс 7_shorthand: `.c` + `d:e = f`).
   */
  defineNextLineValueState(char, pos) {
    const S = YarbpLexer.states;

    if (char === ' ' || char === '\t' || char === '\n')
      return S.WAITING_FOR_NEXT_LINE_VALUE;

    if (char === '`' && this.shouldStartCodeBlock(pos))
      return S.CODE_BLOCK_ENCOUNTERED;

    if (char === '"' || char === "'" || char === '(')
      return S.NEXT_LINE_VALUE_ENCOUNTERED;

    if (this.isScalarValueStart(pos))
      return S.NEXT_LINE_VALUE_ENCOUNTERED;

    return S.NEXT_LINE_VALUE_ABSENT;
  };

  /** Число или литерал проекта (yes/no/да/нет/null), но не `--`-комментарий. */
  isScalarValueStart(pos) {
    const rest = this.text.slice(pos);
    if (/^-?\d/.test(rest) && !rest.startsWith('--')) return true;
    return /^(?:yes|no|да|нет|null)(?![\p{L}\p{N}_])/u.test(rest);
  };

  /**
   * Закрывающий fence: для ``` — где угодно, для одного ` — отдельной
   * строкой (иначе обратный апостроф внутри кода закрыл бы блок раньше).
   */
  findClosingCodeFence(open, fenceLength) {
    if (fenceLength === 3) {
      return this.text.indexOf('```', open + 3);
    }

    let lineStart = this.text.indexOf('\n', open);
    if (lineStart === -1) return -1;
    lineStart += 1;

    while (lineStart <= this.text.length) {
      let pos = lineStart;
      while (this.text[pos] === ' ' || this.text[pos] === '\t') pos++;
      if (this.text[pos] === '`') return pos;

      const next = this.text.indexOf('\n', lineStart);
      if (next === -1) return -1;
      lineStart = next + 1;
    }

    return -1;
  };

  /**
   * Одиночный ` считается fence только при наличии закрывающей строки:
   * иначе обратная совместимость ломается на случайном апострофе в значении.
   */
  shouldStartCodeBlock(pos) {
    const fenceLength = YarbpLexer.codeFenceLengthAt(this.text, pos);
    if (fenceLength === 3) return true;
    if (fenceLength !== 1) return false;
    return this.findClosingCodeFence(pos, 1) !== -1;
  };

  /**
   * Снимает структурный отступ самого fence с каждой строки содержимого.
   * Внутренние отступы кода сохраняются относительно fence: так блок,
   * сдвинутый вместе с макросом, эквивалентен блоку без сдвига.
   */
  dedentCodeBlockContent(content, open) {
    const lineStart = this.text.lastIndexOf('\n', open - 1) + 1;
    const prefix = this.text.slice(lineStart, open);

    /* Fence после ключа в той же строке (`.код ```bsl`) структурного
       отступа не задаёт. */
    if (!/^[ \t]*$/.test(prefix)) return content;

    const indent = prefix.length;
    if (indent === 0) return content;

    return content.split('\n').map(line => {
      let cut = 0;
      while (cut < indent && (line[cut] === ' ' || line[cut] === '\t')) cut++;
      return line.slice(cut);
    }).join('\n');
  };

  handleState(char, pos) {
    const S = YarbpLexer.states;

    switch (this.state) {
      case S.WAITING:
      case S.WAITING_AFTER_NEWLINE:
        // Пустая строка ничего не значит: ни отступа, ни области. Раньше её
        // `\n` попадал в накопитель, `calcTrailingSpaces` давал отступ 0 и
        // текущий блок закрывался — из-за этого документ с пустой строкой
        // терял структуру (B-0 в refactoring.md).
        if (char === '\n' && this.currentToken.trim() === '') {
          this.currentToken = '';
          return;
        }
        this.addCharToToken(char);
        return;

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
          // Значение в начале новой строки — это следующий элемент массива.
          // Закрываем deferred-scope предыдущего bareword, иначе оно станет
          // его ребёнком (например, `g` + `'2'`).
          if (this.previousState === S.WAITING_AFTER_NEWLINE) {
            this.countCurrentIndent();
            this.generateScopeTokens(pos, TokenTypes.PRIMITIVE);
          }

          // После комментария currentMatchPosition может указывать на `--`.
          // Для кавычки начинаем токен с её реальной позиции, иначе
          // диапазоны VALUE и COMMENT пересекаются.
          this.currentToken = '';
          this.currentMatchPosition = pos;
        }
        this.addCharToToken(char);
        return;

      case S.WAITING_FOR_NEXT_LINE_VALUE:
        // Пустая строка между ключом и значением допустима; отступ копится
        // так же, как в WAITING_AFTER_NEWLINE, чтобы scope-токены не съехали.
        if (char === '\n' && this.currentToken.trim() === '') {
          this.currentToken = '';
          return;
        }
        this.addCharToToken(char);
        return;

      case S.NEXT_LINE_VALUE_PENDING:
        // Ключ уже добавлен, после него были только пробелы до перевода
        // строки. Решение «значение или пусто» принимает следующая строка.
        this.pendingPrimitive = {
          endPos: pos,
          keyStart: this.lastPrimitive?.keyStart ?? pos,
          typed: Boolean(this.lastPrimitive?.typed)
        };
        this.lastPrimitive = null;
        this.currentToken = '';
        this.state = S.WAITING_FOR_NEXT_LINE_VALUE;
        return;

      case S.NEXT_LINE_VALUE_ENCOUNTERED:
        this.handleNextLineValueEncountered(char, pos);
        return;

      case S.NEXT_LINE_VALUE_ABSENT:
        this.handleNextLineValueAbsent(char, pos);
        return;

      case S.CODE_BLOCK_ENCOUNTERED:
        this.handleCodeBlock(pos);
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

    const typed = this.currentToken.includes(':');
    const keyStart = this.currentMatchPosition;

    this.addToken(TokenTypes.PRIMITIVE);
    this.lastPrimitive = { typed, keyStart };

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
    const typed = this.currentToken.includes(':');
    const keyStart = this.currentMatchPosition;

    this.handlePrimitiveEnded(pos, char);

    if (this.error) return;

    /* Пока не решили, есть ли значение на следующей строке, пустой VALUE
       не добавляем: иначе значение со следующей строки станет отдельным
       узлом. Для старых кейсов токен появится на том же месте при
       finishPendingPrimitiveAsEmpty(). */
    this.pendingPrimitive = { endPos: pos, keyStart, typed };
    this.lastPrimitive = null;
    this.state = YarbpLexer.states.WAITING_FOR_NEXT_LINE_VALUE;
  }

  handleNextLineValueEncountered(char, pos) {
    const S = YarbpLexer.states;

    this.pendingPrimitive = null;
    this.valueStartedOnNextLine = true;
    this.currentToken = '';
    this.currentMatchPosition = pos;

    if (char === '`') {
      this.state = S.CODE_BLOCK_ENCOUNTERED;
    } else if (char === '"' || char === "'" || char === '(') {
      this.state = S.IN_QUOTED_VALUE;
    } else {
      this.state = S.IN_VALUE;
    }

    this.handleState(char, pos);
  }

  handleNextLineValueAbsent(char, pos) {
    const indent = this.currentToken;

    this.finishPendingPrimitiveAsEmpty();

    /* Отступ относился к следующему узлу: возвращаем его, иначе
       handlePrefixEncountered/handleImplicitObjectEncountered увидят 0. */
    this.currentToken = indent;
    this.state = YarbpLexer.states.WAITING_AFTER_NEWLINE;
    this.state = this.defineState(char, pos);
    this.handleState(char, pos);
  }

  finishPendingPrimitiveAsEmpty() {
    const pending = this.pendingPrimitive;
    if (!pending) return;

    this.pendingPrimitive = null;
    this.valueStartedOnNextLine = false;
    this.addToken(TokenTypes.ANY_VALUE, pending.endPos, '');

    /* Пустые типизированные поля — легальные объявления (кейс 5). Для
       остальных отсутствие значения показываем в строке статуса. */
    if (!pending.typed) {
      this.diagnostics.push({ message: 'expected value', start: pending.keyStart });
    }
  }

  /**
   * Фрагмент кода — лексический остров.
   *
   * Открывающие ``` и всё до закрывающих ``` не проходят через автомат:
   * содержимое сохраняется как есть, язык берётся из первого слова после
   * открывающих кавычек. Закрывающая строка может быть с отступом — её
   * отступ и перевод строки перед ней в значение не входят; отступы самих
   * строк кода сохраняются.
   */
  handleCodeBlock(pos) {
    const open = pos;
    const fenceLength = YarbpLexer.codeFenceLengthAt(this.text, open);
    const close = this.findClosingCodeFence(open, fenceLength);

    if (close === -1) {
      this.addUnterminatedCodeBlock(open);
      return;
    }

    const end = close + fenceLength;
    const firstNewline = this.text.indexOf('\n', open + fenceLength);

    let language = null;
    let contentStart;
    let contentEnd;

    if (firstNewline === -1 || close < firstNewline) {
      /* ```код``` в одну строку: языка нет, содержимое между кавычками. */
      contentStart = open + fenceLength;
      contentEnd = close;
    } else {
      const info = this.text.slice(open + fenceLength, firstNewline).trim();
      language = info.split(/\s+/)[0] || null;
      contentStart = firstNewline + 1;

      const lineStart = this.text.lastIndexOf('\n', close - 1) + 1;
      const beforeClose = this.text.slice(lineStart, close);
      contentEnd = /^[ \t]*$/.test(beforeClose)
        ? Math.max(contentStart, lineStart - 1)
        : close;
    }

    const token = new Token({
      type: TokenTypes.CODE_BLOCK,
      value: this.dedentCodeBlockContent(
        this.text.slice(contentStart, contentEnd), open),
      prefix: undefined,
      start: open,
      end: end,
      error: '',
      language: language,
      contentStart: contentStart,
      contentEnd: contentEnd
    });

    if (this.valueStartedOnNextLine) {
      token.onNextLine = true;
      this.valueStartedOnNextLine = false;
    }

    this.tokens.push(token);
    this.onlyAllowedTokens = false;
    this.pendingPrimitive = null;
    this.currentToken = '';
    this.currentMatchPosition = end;
    this.error = '';
    this.nextPos = end - 1;

    const after = this.text[end];
    this.state = after === '\n'
      ? YarbpLexer.states.WAITING_AFTER_NEWLINE
      : YarbpLexer.states.WAITING;
  }

  addUnterminatedCodeBlock(open) {
    const token = new Token({
      type: TokenTypes.UNPARSED,
      value: this.text.slice(open),
      prefix: undefined,
      start: open,
      end: this.text.length,
      error: 'unterminated code block'
    });

    if (this.valueStartedOnNextLine) {
      token.onNextLine = true;
      this.valueStartedOnNextLine = false;
    }

    this.tokens.push(token);
    this.onlyAllowedTokens = false;
    this.pendingPrimitive = null;
    this.currentToken = '';
    this.currentMatchPosition = this.text.length;
    this.error = '';
    this.nextPos = this.text.length;
    this.state = YarbpLexer.states.WAITING_AFTER_NEWLINE;
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