/* convertors */
import { YarbpJSONConverter } from './ast-converters/JSONConvertor.js'
import { YarbpXMLConverter } from './ast-converters/XMLConvertor.js'
import { YarbpProtoConverter } from './ast-converters/ProtobufConvertor.js'
import { YarbpXPMConverter } from './ast-converters/XPMConverter.js'

/* renderers */
import { YarbpBasicRenderer } from './YarbpBasicRenderer.js'
import { HTMLUIRenderer } from './renderers/HTMLUIRenderer.js'
import { XPMRenderer } from './renderers/XPMRenderer.js'

/* highlighters */
import { XMLHighlighter } from './highlighters/XMLHighlighter.js'

import { escapeHtml } from '../utils.js'

const YarbpTextExamples = Object.freeze({
  COMPLICATED: ``,
  SIMPLE: ``,
  SHOP_ORDER: ``,
  FLEX_FORMS: ``,
  PROTO: ``,
  XPM: ``
});

class YarbpLexerRenderer extends YarbpBasicRenderer {
  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;
    const wrapScopeTags = (str) => {
      str = str.replaceAll(/SCOPE_IN/g, '<span class="scope-in">SCOPE_IN</span>');
      str = str.replaceAll(/SCOPE_OUT/g, '<span class="scope-out">SCOPE_OUT</span>');
      return str;
    };
    this.renderTextarea.value = this.lexer.getPrettyView();
    this.renderHighlightDiv.innerHTML = wrapScopeTags(this.renderTextarea.value);
    this.syncRenderScroll();
  };
}

class ASTRenderer extends YarbpBasicRenderer {
  render() {
    const ASTView = JSON.stringify(this.parser.getAST(), undefined, 2);

    this.renderTextarea.value = ASTView;
    this.renderHighlightDiv.innerHTML = ASTView;
    this.syncRenderScroll();
  };
}

class JSONRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpJSONConverter(AST);
    const JSONView = JSON.stringify(converter.convert(), null, 2);

    this.renderTextarea.value = JSONView;
    this.renderHighlightDiv.innerHTML = JSONView;
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
    this.renderHighlightDiv.innerHTML = protoContent;
    this.syncRenderScroll();
  };
}

const KnownFlavors = Object.freeze({
  LEXER_DEBUG: {
    names: ['lexer', 'лексер'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: YarbpLexerRenderer
  },
  AST: {
    names: ['ast', 'аст'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: ASTRenderer
  },
  JSON: {
    names: ['json', 'джейсон'],
    textExample: [YarbpTextExamples.SHOP_ORDER],
    renderer: JSONRenderer
  },
  XML: {
    names: ['xml', 'хмл'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: XMLRenderer
  },
  PROTOBUF: {
    names: ['proto', 'protobuf'],
    textExample: [YarbpTextExamples.PROTO],
    renderer: ProtobufRenderer
  },
  UI_MOCKUP: {
    names: ['ui', 'форма'],
    textExample: [YarbpTextExamples.UI],
    renderer: HTMLUIRenderer
  },
  XPM: {
    names: ['кпо', 'xpm'],
    textExample: [YarbpTextExamples.XPM],
    renderer: XPMRenderer
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

  normalizeFlavorName(directive) {
    let flavourDirectiveParts = directive.split(' ');
    if (flavourDirectiveParts[0] !== 'as' && flavourDirectiveParts[0] !== 'как') return undefined;
    return directive.replace('as', '').replace('как', '').replaceAll(/[-_ ()]/g, '').toLowerCase();
  };
}