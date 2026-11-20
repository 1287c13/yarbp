import { YarbpBasicRenderer } from '../shared/renderer.js';
import { escText } from '../../utils/escape.js';
import { YarbpJSONConverter } from './converter.js';

export class JSONRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpJSONConverter(AST);
    const JSONView = JSON.stringify(converter.convert(), null, 2);

    this.renderTextarea.value = JSONView;
    this.renderHighlightDiv.innerHTML = escText(JSONView);
    this.syncRenderScroll();
  }
}
