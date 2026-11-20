import { YarbpLexer, TokenTypes } from './YarbpLexer.js';
import { splitWithEscaping, dedentMultilineString } from '../utils/utils.js'
import { expandMacros } from './macroPostprocess.js'
import { applySugarTyping, applyImports, idsDisabled } from './languageDirectives.js'

export const nodeTypes = Object.freeze({
  ROOT: 'ROOT',           /* single general root for document*/
  MEANING: 'MEANING',     /* any meaning node into document */
  COMMENT: 'COMMENT',     /* user comments */
  COMMENT_TODO: 'TODO',   /* user highlights on what to do or to think about */
  COMMENT_IMPORTANT: 'IMPORTANT', /* user highlights on what is important */
  COMMENT_OUT: 'DELETED', /* ignored parts */
  DIRECTIVE: 'DIRECTIVE'  /* directions for target view renderer */
});

export const valueTypes = Object.freeze({
  STRING: 'STRING',
  BOOL: 'BOOL',
  NUMBER: 'NUMBER',
  NULL: 'NULL',
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  CODE: 'CODE' /* фрагмент кода: value — сырой текст, language — язык или null */
});

class ASTNode {
  static attrs = Object.freeze({
    nodeType: 'parsedTokenType',  /* enum nodeTypes */
    key: 'key',                   /* node name if not anonymous */
    id: 'id',                     /* node identifier from `#id` in the key */
    value: 'value',               /* node value used for primitives only else children are value */
    valueType: 'valueType',       /* enum valueTypes */
    language: 'language',         /* язык фрагмента кода (valueTypes.CODE) */
    extendedType: 'extendedType', /* user type if specified */
    prefix: 'prefix',             /* prefix symbols if used */
    position: 'position',         /* whole location in text */
    directives: 'directives',     /* directives met into this node's scope */
    comments: 'comments',         /* comments met into this node's scope */
    children: 'children',         /* value (content) of non-primitive nodes */
    declarationFlags: 'declarationFlags' /* enum declarationFlags */
  });

  constructor(props) {
    Object.keys(ASTNode.attrs).forEach(key => {
      if (props.hasOwnProperty(key)) { this[key] = props[key]; }
    });
  };
}


/**
 * `expandMacros` исторически всегда возвращает `children` (даже пустой), и
 * снимки AST это фиксируют. Быстрый путь без макросов держит ту же форму,
 * иначе у документов без детей поле пропадает.
 */
function withChildren(node) {
  return Array.isArray(node.children) ? node : { ...node, children: [] };
}

/**
 * AST — общий кэш для подсказок и конвертеров. Ни один потребитель не должен
 * его менять: иначе следующий рендер увидит уже испорченное дерево. Заморозка
 * делает это правило явным — запись в узел в strict mode (ES-модули) падает.
 */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.freeze(value);
  Object.keys(value).forEach(key => deepFreeze(value[key]));
  return value;
}

export class YarbpParser {
  static QUOTES = ['"', "'", "(", ")"];
  static ARRAY_SEPARATOR = ' ';
  static LITERAL_TOKENS = Object.freeze({
    'yes':  {type: valueTypes.BOOL, value: true},
    'no':   {type: valueTypes.BOOL, value: false},
    'да':   {type: valueTypes.BOOL, value: true},
    'нет':  {type: valueTypes.BOOL, value: false},
    'null': {type: valueTypes.NULL, value: null}
  });

  constructor(lexer) {
    this.lexer = lexer;
    this.tokens = [];
    this.idx = 0;
    this.AST = { };
    /* `! отключить идентификаторы` выключает вынос `#id` в поле `id`.
       Значение ставит `getAST()` перед обходом токенов. */
    this.idsEnabled = true;
    // Кэш AST: за один пересчёт его просят дважды (подсказки и рендерер).
    this.cachedTokens = null;
    this.cachedAST = null;
    this.cachedDiagnostics = [];
    this.cachedImportVersion = null;

    /* Импорт объектов из других документов песочницы: резолвер и версия
       содержимого файлов. Без резолвера проход импорта не запускается. */
    this.importResolver = null;
    this.importVersionProvider = null;

    /* Нефатальные замечания раскрытия подстановок (нет ключа, цикл и т.п.).
       В AST не попадают, чтобы не менять golden-снимки и контракт конвертеров. */
    this.lastDiagnostics = [];
  };

  /**
   * Ключ узла и его идентификатор: `поле#итог` → `{key: 'поле', id: 'итог'}`.
   *
   * Разделитель — первый `#` в ключе. Пустые половины (`#итог`, `поле#`)
   * идентификатором не считаются: ключ остаётся как есть, чтобы такие
   * документы разбирались по-старому. При `! отключить идентификаторы`
   * (`this.idsEnabled === false`) `#` тоже остаётся частью ключа.
   *
   * @returns {{key: string, id?: string}}
   */
  keyProps(value) {
    const text = String(value ?? '');
    const hash = this.idsEnabled ? text.indexOf('#') : -1;

    if (hash <= 0 || hash === text.length - 1) return { key: text };

    return { key: text.slice(0, hash), id: text.slice(hash + 1) };
  }

  /** sequential processing of tokens and recursive calls to create a tree */
  traverse(root) {
    let valueInConstructing = undefined;
    let isNestedKeyMet = false;

    /** go into cycle to handle a next token */
    for (this.idx; this.idx < this.lexer.tokens.length; this.idx++) {
      let token = this.lexer.tokens[this.idx];

      /** if directive or comment - put it to last encountered value */
      if ([TokenTypes.COMMENT, TokenTypes.COMMENT_TODO, TokenTypes.COMMENT_IMPORTANT,
            TokenTypes.COMMENT_OUT, TokenTypes.DIRECTIVE].includes(token.type)) {
        let parent = root.children?.at(-1) ?? root;

        let props = {
          nodeType: token.type,
          value: token.value,
          position: { start: token.start, end: token.end }};

        if (token.type === TokenTypes.DIRECTIVE) {
          props.prefix = '!';
          if (!parent.directives) { parent.directives = []; }
          parent.directives.push(new ASTNode(props));
        } else {
          if (!parent.comments) { parent.comments = []; }
          parent.comments.push(new ASTNode(props));
        }


      } else

      /** if object or array - it's a new node's declaration, so enrich root */
      if ( [TokenTypes.OBJECT, TokenTypes.ARRAY].includes(token.type) ) {
        const typeMap = {
          [TokenTypes.OBJECT]: valueTypes.OBJECT,
          [TokenTypes.ARRAY]: valueTypes.ARRAY};

        root.nodeType = nodeTypes.MEANING;
        const keyProps = this.keyProps(token.value);
        root.key = keyProps.key;
        if (keyProps.id) root.id = keyProps.id;
        root.valueType = typeMap[token.type];
        root.prefix = token.prefix || '';
        root.position = { start: token.start, end: token.end };
      } else

      /** if a key for primitive value - start constructing a new node (key-value pair) */
      if (token.type === TokenTypes.PRIMITIVE) {

        const keyProps = this.keyProps(token.value);
        const nodeProps = {
          nodeType: nodeTypes.MEANING,
          key: keyProps.key,
          prefix: '.',
          position: { start: token.start, end: token.end }
        };
        if (keyProps.id) nodeProps.id = keyProps.id;

        valueInConstructing = new ASTNode(nodeProps);
        isNestedKeyMet = true;
      } else

      /** if type specified - deside is it for valueInConstructing or is it for root, then enrich */
      if (token.type === TokenTypes.TYPE) {
        let enrichedEntity = isNestedKeyMet ? valueInConstructing : root;
        enrichedEntity.type = token.value;
      } else

      /** фрагмент кода: примитив с сырым значением и необязательным языком */
      if (token.type === TokenTypes.CODE_BLOCK) {
        const codePosition = {
          start: token.contentStart ?? token.start,
          end: token.contentEnd ?? token.end
        };
        const codeProps = {
          nodeType: nodeTypes.MEANING,
          valueType: valueTypes.CODE,
          value: token.value,
          language: token.language ?? null,
          position: codePosition
        };

        let enrichedEntities = [];

        if (isNestedKeyMet) {
          valueInConstructing.valueType = codeProps.valueType;
          valueInConstructing.value = codeProps.value;
          valueInConstructing.language = codeProps.language;
          valueInConstructing.position = codeProps.position;
          enrichedEntities = [valueInConstructing];

        } else if (root.valueType === valueTypes.ARRAY) {
          enrichedEntities = [new ASTNode(codeProps)];

        } else if (root.valueType === valueTypes.OBJECT && !isNestedKeyMet) {
          root.value = token.value;
          root.language = token.language ?? null;

        } else {
          enrichedEntities = [new ASTNode(codeProps)];
        }

        enrichedEntities.forEach(enrichedEntity => {
          enrichedEntity.nodeType = nodeTypes.MEANING;
          if (!enrichedEntity.position) {
            enrichedEntity.position = codePosition;
          }

          if (!root.children) { root.children = []; }
          root.children.push(enrichedEntity);
          isNestedKeyMet = false;
        });
      } else

      /** if value - deside is it for key or is it standing alone
       *  - if is for key so enrich valueInConstructing and stop constructing a key-value
       *  - if standing alone so create a new node
       *  Add node to root anyway. */
      if (token.type === TokenTypes.ANY_VALUE) {
        let enrichedEntities = [];

        if (isNestedKeyMet) {
          valueInConstructing.valueType = this.resolveType(token.value);
          valueInConstructing.value = this.resolveValue(token.value);
          /* Значение со следующей строки: позиция узла должна указывать
             на строку значения, а не на ключ (п. 4.6). */
          if (token.onNextLine) {
            valueInConstructing.position = { start: token.start, end: token.end };
          }
          enrichedEntities = [valueInConstructing];

        } else if (root.valueType === valueTypes.ARRAY) {

          const match = this.lexer.text.slice(0, token.start).match(/\s+$/);
          const leadingWhitespace = match ? match[0] : '';
          let arrayValues = [token.value];
          if (!leadingWhitespace.includes('\n'))
            { arrayValues = splitWithEscaping(
              token.value, YarbpParser.QUOTES, YarbpParser.ARRAY_SEPARATOR); }

          enrichedEntities = arrayValues.map(
            val => new ASTNode({
              valueType: this.resolveType(val), value: this.resolveValue(val) }));

        } else if (root.valueType === valueTypes.OBJECT && !isNestedKeyMet) {
          root.value = this.resolveValue(token.value).slice(1).trim();

        } else {
          enrichedEntities = [ new ASTNode({
            valueType: this.resolveType(token.value),
            value: this.resolveValue(token.value) }) ];
        }

        enrichedEntities.forEach(enrichedEntity => {
          enrichedEntity.nodeType = nodeTypes.MEANING;
          if (!enrichedEntity.position) {
            enrichedEntity.position = { start: token.start, end: token.end };
          }

          if (!root.children) { root.children = []; }
          root.children.push(enrichedEntity);
          isNestedKeyMet = false;
        });
      } else

      if (token.type === TokenTypes.SCOPE_IN) {
        let newChildNode = new ASTNode({ });
        this.idx ++;
        newChildNode = this.traverse(newChildNode);
        if (!root.children) { root.children = []; }
        root.children.push(newChildNode);
      } else

      if (token.type === TokenTypes.SCOPE_OUT) {
        if (isNestedKeyMet && valueInConstructing) {
          valueInConstructing.nodeType = nodeTypes.MEANING;
          if (!root.children) { root.children = []; }
          root.children.push(valueInConstructing);
          isNestedKeyMet = false;
          valueInConstructing = undefined;
        }
        return root;
      }

    }

    return root;
  };

  resolveType(value) {
    const literalToken = YarbpParser.LITERAL_TOKENS[value];
    if (literalToken) return literalToken.type;

    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const isQuoted = (firstChar === '"' && lastChar === '"') ||
                     (firstChar === "'" && lastChar === "'");

    if (isQuoted) return valueTypes.STRING;
    if (value.trim() !== '' && !isNaN(value)) return valueTypes.NUMBER;
    return valueTypes.STRING;
  }

  resolveValue(value) {
    const literalToken = YarbpParser.LITERAL_TOKENS[value];
    if (literalToken) { return literalToken.value; }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    const isDoubleQuoted = firstChar === '"' && lastChar === '"';
    const isSingleQuoted = firstChar === "'" && lastChar === "'";

    if (isDoubleQuoted || isSingleQuoted) {
      return dedentMultilineString(value.slice(1, -1));
    }
    if (value.trim() !== '' && !isNaN(value)) { return Number(value); }
    return value;
  }

  /**
   * Есть ли в документе что раскрывать: определение `@имя` или подстановка
   * `((имя))`. Проверка по тексту дешёвая; `@` внутри кавычек даст ложное
   * «да», и это безопасно — просто выполнится полный проход.
   */
  hasMacroSyntax() {
    const text = this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '';
    return text.includes('@') || text.includes('((');
  }

  /**
   * Подключить резолвер файлов для `! импорт`.
   *
   * @param {Function} resolver — ключ файла → {ok, id, name, content} или
   *   {ok:false, reason, candidates}; см. FileManager.resolveImport.
   * @param {Function} [versionProvider] — версия содержимого файлов: при её
   *   изменении кэш AST пересобирается, даже если текст текущего документа
   *   не менялся.
   */
  setImportResolver(resolver, versionProvider = null) {
    this.importResolver = typeof resolver === 'function' ? resolver : null;
    this.importVersionProvider = typeof versionProvider === 'function' ? versionProvider : null;
    this.invalidate();
  }

  /** Сбросить кэш AST (например, после изменения другого файла). */
  invalidate() {
    this.cachedTokens = null;
    this.cachedAST = null;
    this.cachedDiagnostics = [];
    this.cachedImportVersion = null;
  }

  /**
   * Разбор импортируемого документа: без резолвера импорта (MVP — один
   * уровень), но со своими макросами и своим `! разбор-сахара`.
   */
  parseImportedFile(text) {
    const lexer = new YarbpLexer();
    lexer.setInitialState(text);
    lexer.tokenize();
    const parser = new YarbpParser(lexer);
    return {
      ast: parser.getAST(),
      diagnostics: parser.lastDiagnostics || [],
    };
  }

  getAST() {
    // Пока токены не пересобраны, AST тот же: за один пересчёт его просят
    // дважды (подсказки и рендерер). `tokenize()` создаёт новый массив токенов,
    // поэтому ссылка — надёжный признак «документ не менялся».
    const importVersion = this.importVersionProvider ? this.importVersionProvider() : 0;
    if (this.cachedAST && this.cachedTokens === this.lexer.tokens &&
        this.cachedImportVersion === importVersion) {
      this.lastDiagnostics = this.cachedDiagnostics;
      return this.cachedAST;
    }

    this.idx = 0;
    this.AST = { root: new ASTNode({ nodeType: nodeTypes.ROOT }) };

    /* `! отключить идентификаторы` / `! disable ids` — языковая директива:
       решает, станет ли `#id` полем узла или останется частью ключа. Читаем до
       обхода: директива действует на весь документ, где бы она ни стояла. */
    this.idsEnabled = !idsDisabled(this.lexer?.tokens || [], this.lexer?.text || '');

    const ast = this.traverse(this.AST.root);

    // Без макросов раскрывать нечего: `expandMacros` пересобирает дерево и
    // клонирует каждый узел, а результат структурно равен входу.
    const diagnostics = [];
    const result = this.hasMacroSyntax()
      ? expandMacros(ast, diagnostics, this.lexer?.text || '')
      : withChildren(ast);

    /* Импорт объектов из других документов — до L-2: файл-источник
       приходит уже со своим раскрытым сахаром. */
    if (this.importResolver) {
      applyImports(result, {
        tokens: this.lexer?.tokens || [],
        sourceText: this.lexer?.text || '',
        diagnostics,
        resolveImport: this.importResolver,
        parseFile: text => this.parseImportedFile(text),
      });
    }

    /* Языковые директивы (`! разбор-сахара`) меняют AST до конвертеров:
       `тег = 1 / 2` превращается в явные `.свойство 1`. Без директив проход
       ничего не делает и не трогает старые документы. */
    applySugarTyping(result, {
      tokens: this.lexer?.tokens || [],
      sourceText: this.lexer?.text || '',
      diagnostics,
      resolveType: value => this.resolveType(value),
      resolveValue: value => this.resolveValue(value),
    });

    deepFreeze(result);
    this.cachedTokens = this.lexer.tokens;
    this.cachedAST = result;
    this.cachedDiagnostics = diagnostics;
    this.cachedImportVersion = importVersion;
    this.lastDiagnostics = diagnostics;
    return result;
  }
}