import { YarbpBasicRenderer } from '../shared/renderer.js';
import { escText } from '../../utils/escape.js';

export class LexerDebugRenderer extends YarbpBasicRenderer {
  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;
    const wrapScopeTags = (str) => escText(str)
      .replaceAll(/SCOPE_IN/g, '<span class="scope-in">SCOPE_IN</span>')
      .replaceAll(/SCOPE_OUT/g, '<span class="scope-out">SCOPE_OUT</span>');
    this.renderTextarea.value = this.lexer.getPrettyView();
    this.renderHighlightDiv.innerHTML = wrapScopeTags(this.renderTextarea.value);
    this.syncRenderScroll();
  }
}
