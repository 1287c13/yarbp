import { YarbpBasicRenderer } from '../shared/renderer.js';
import { escText } from '../../utils/escape.js';

export class ASTRenderer extends YarbpBasicRenderer {
  render() {
    const ASTView = JSON.stringify(this.parser.getAST(), undefined, 2);

    this.renderTextarea.value = ASTView;
    this.renderHighlightDiv.innerHTML = escText(ASTView);
    this.syncRenderScroll();
  }
}
