import { TokenTypes } from './YarbpLexer.js';
import { splitWithEscaping, dedentMultilineString } from '../utils.js'
import { expandMacros } from '../macroPostprocess.js'

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
  ARRAY: 'ARRAY'
});

const declarationSpecific = Object.freeze({
  IS_ANONYMOUS: 'IS_ANONYMOUS', /* no name given */
  IS_IMPLICIT: 'IS_IMPLICIT',   /* type is calculated by rules, not specified */
  IS_ATTRIBUTE: 'IS_ATTRIBUTE', /* declared as named attr, not child */
  IS_SUGAR: 'IS_SUGAR'          /* shorthands used */
});

class ASTNode {
  static attrs = Object.freeze({
    nodeType: 'parsedTokenType',  /* enum nodeTypes */
    key: 'key',                   /* node name if not anonymous */
    value: 'value',               /* node value used for primitives only else children are value */
    valueType: 'valueType',       /* enum valueTypes */
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
  };

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
          baseValueType: String,
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
        root.key = token.value;
        root.valueType = typeMap[token.type];
        root.prefix = token.prefix || '';
        root.position = { start: token.start, end: token.end };
      } else

      /** if a key for primitive value - start constructing a new node (key-value pair) */
      if (token.type === TokenTypes.PRIMITIVE) {

        valueInConstructing = new ASTNode({
          nodeType: nodeTypes.MEANING,
          key: token.value,
          prefix: '.',
          position: { start: token.start, end: token.end }
        });
        isNestedKeyMet = true;
      } else

      /** if type specified - deside is it for valueInConstructing or is it for root, then enrich */
      if (token.type === TokenTypes.TYPE) {
        let enrichedEntity = isNestedKeyMet ? valueInConstructing : root;
        enrichedEntity.type = token.value;
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
          enrichedEntities = [valueInConstructing];

        } else if (root.valueType === valueTypes.ARRAY
                  && !YarbpParser.QUOTES.includes(token.value[0])) {

          let arrayValues = splitWithEscaping(
            token.value, YarbpParser.QUOTES, YarbpParser.ARRAY_SEPARATOR);

          enrichedEntities = arrayValues.map(
            val => new ASTNode({
              valueType: this.resolveType(val), value: this.resolveValue(val) })
          );

        } else {
          enrichedEntities = [ new ASTNode({
            valueType: this.resolveType(token.value),
            value: this.resolveValue(token.value) }) ];
        }

        enrichedEntities.forEach(enrichedEntity => {
          enrichedEntity.nodeType = nodeTypes.MEANING;
          enrichedEntity.position = { start: token.start, end: token.end };

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

  getAST() {
    this.idx = 0;
    this.AST = { root: new ASTNode({ nodeType: nodeTypes.ROOT }) };

    return expandMacros(this.traverse(this.AST.root));
  }
}