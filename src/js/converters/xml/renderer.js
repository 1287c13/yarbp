import { YarbpBasicRenderer } from '../shared/renderer.js';
import { XMLHighlighter } from '../shared/XMLHighlighter.js';
import { YarbpXMLConverter } from './converter.js';

export class XMLRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpXMLConverter(AST);
    const XML = converter.convert();

    this.renderTextarea.value = XML;

    const highlighter = new XMLHighlighter(XML);
    this.renderHighlightDiv.innerHTML = highlighter.highlight();

    this.syncRenderScroll();
  }
}
