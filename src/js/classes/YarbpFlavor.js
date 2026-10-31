/* convertors */
import { YarbpJSONConverter } from './ast-converters/JSONConvertor.js'
import { YarbpXMLConverter } from './ast-converters/XMLConvertor.js'
import { YarbpProtoConverter } from './ast-converters/ProtobufConvertor.js'

/* suggestions */
import { xpmSuggestions } from './suggestions/xpmSuggestions.js';
import { bpmnSuggestions } from './suggestions/bpmnSuggestions.js';
import { flexFormsSuggestions } from './suggestions/flexFormsSuggestions.js';

/* renderers */
import { YarbpBasicRenderer } from './YarbpBasicRenderer.js'
import { HTMLUIRenderer } from './renderers/HTMLUIRenderer.js'
import { XPMRenderer } from './renderers/XPMRenderer.js'
import { BPMNRenderer } from './renderers/BPMNRenderer.js';
import { FlexFormsRenderer } from './renderers/FlexFormsRenderer.js';
import { OpenAPIRenderer } from './renderers/OpenAPIRenderer.js';
import { JsonSchemaRenderer } from './renderers/JsonSchemaRenderer.js';
import { MermaidRenderer } from './renderers/MermaidRenderer.js';

/* highlighters */
import { XMLHighlighter } from './highlighters/XMLHighlighter.js'

/* escaping */
import { escText } from '../escape.js'


class YarbpLexerRenderer extends YarbpBasicRenderer {
  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;
    const wrapScopeTags = (str) => escText(str)
      .replaceAll(/SCOPE_IN/g, '<span class="scope-in">SCOPE_IN</span>')
      .replaceAll(/SCOPE_OUT/g, '<span class="scope-out">SCOPE_OUT</span>');
    this.renderTextarea.value = this.lexer.getPrettyView();
    this.renderHighlightDiv.innerHTML = wrapScopeTags(this.renderTextarea.value);
    this.syncRenderScroll();
  };
}

class ASTRenderer extends YarbpBasicRenderer {
  render() {
    const ASTView = JSON.stringify(this.parser.getAST(), undefined, 2);

    this.renderTextarea.value = ASTView;
    this.renderHighlightDiv.innerHTML = escText(ASTView);
    this.syncRenderScroll();
  };
}

class JSONRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpJSONConverter(AST);
    const JSONView = JSON.stringify(converter.convert(), null, 2);

    this.renderTextarea.value = JSONView;
    this.renderHighlightDiv.innerHTML = escText(JSONView);
    this.syncRenderScroll();
  };
}

class XMLRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpXMLConverter(AST);
    const XML = converter.convert();

    this.renderTextarea.value = XML;

    let highlighter = new XMLHighlighter(XML);
    this.renderHighlightDiv.innerHTML = highlighter.highlight();

    this.syncRenderScroll();
  };
}

class ProtobufRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpProtoConverter(AST);
    const protoContent = converter.convert();

    this.renderTextarea.value = protoContent ;
    this.renderHighlightDiv.innerHTML = escText(protoContent);
    this.syncRenderScroll();
  };
}

const KnownFlavors = Object.freeze({
  LEXER_DEBUG: {
    names: ['lexer', 'лексер'],
    textExample: [],
    renderer: YarbpLexerRenderer
  },
  AST: {
    names: ['ast', 'аст'],
    textExample: [],
    renderer: ASTRenderer
  },
  JSON: {
    names: ['json', 'джейсон'],
    textExample: [],
    renderer: JSONRenderer
  },
  XML: {
    names: ['xml', 'хмл'],
    textExample: [],
    renderer: XMLRenderer
  },
  PROTOBUF: {
    names: ['proto', 'protobuf'],
    textExample: [],
    renderer: ProtobufRenderer
  },
  UI_MOCKUP: {
    names: ['ui', 'форма'],
    textExample: [],
    renderer: HTMLUIRenderer
  },
  XPM: {
    names: ['кпо', 'xpm'],
    textExample: [],
    renderer: XPMRenderer,
    suggestions: xpmSuggestions,
  },
  BPMN: {
    names: ['бпмн', 'bpmn'],
    textExample: [],
    renderer: BPMNRenderer,
    suggestions: bpmnSuggestions
  },
  OPENAPI: {
    /* `! как openapi` / `! как OpenAPI` / `! as open-api` — одно и то же */
    names: ['openapi', 'open-api', 'swagger'],
    textExample: [],
    renderer: OpenAPIRenderer,
  },
  JSON_SCHEMA: {
    /* `! как схема` — схема данных для валидаторов, без путей и эндпоинтов */
    names: ['схема', 'jsonschema', 'json-schema'],
    textExample: [],
    renderer: JsonSchemaRenderer,
  },
  MERMAID: {
    /* `! как мермейд` — текстовая схема процесса для PR и markdown */
    names: ['мермейд', 'mermaid'],
    textExample: [],
    renderer: MermaidRenderer,
  },
  FLEX_FORMS: {
    /* `normalizeFlavorName` снимает `[-_ ()]` и приводит к нижнему регистру,
       поэтому в карте — только «сплющенные» имена: `как форма-тсд` → `форматсд`. */
    names: ['форматсд', 'тсд', 'flexforms', 'сканер'],
    textExample: [],
    renderer: FlexFormsRenderer,
    suggestions: flexFormsSuggestions,
  }
});

const FlavorMap = new Map(
  Object.values(KnownFlavors).flatMap(flavor =>
    flavor.names.map(name => [name, flavor])
  )
);

export class YarbpFlavor {
  constructor(flavorDirective) {
    this.flavorName = this.normalizeFlavorName(flavorDirective);
    this.flavorData = FlavorMap.get(this.flavorName);
  };

  /**
   * Директива → «сплющенное» имя флейвора: `! как Форма-ТСД` → `форматсд`.
   *
   * Директива не чувствительна к регистру, лишним пробелам, дефисам и
   * подчёркиваниям: `! AS json`, `! as-json`, `! как  JSON` — одно и то же.
   * Без ведущего `as`/`как` директива флейвором не считается (undefined).
   *
   * Граница после `as`/`как` проверяется lookahead-ом, а не `\b`: в JS `\b`
   * опирается на ASCII-`\w`, поэтому для «как» он не срабатывает.
   */
  normalizeFlavorName(directive) {
    const match = String(directive ?? '').match(/^\s*(?:as|как)(?=[\s\-_]|$)\s*(.+)$/i);
    if (!match) return undefined;

    const name = match[1].replaceAll(/[\s\-_()]/g, '').toLowerCase();
    return name || undefined;
  };
}