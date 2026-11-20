import { DiagnosticsStatusRenderer } from './DiagnosticsStatusRenderer.js';
import { escText } from '../../utils/escape.js';

// Панель «JSON-документ»: конвертер → JSON + строка диагностики.
export class JsonDocumentRenderer extends DiagnosticsStatusRenderer {
  createConverter() {
    throw new Error('createConverter must be implemented');
  }

  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;

    const AST = this.parser.getAST();
    const source = this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '';
    const converter = this.createConverter(AST, source);
    const spec = JSON.stringify(converter.convert(), null, 2);

    this.showWarnings(converter.warnings);

    if (spec === this.lastOutput) {
      this.syncRenderScroll();
      return;
    }

    this.lastOutput = spec;
    this.renderTextarea.value = spec;
    this.renderHighlightDiv.innerHTML = escText(spec);
    this.syncRenderScroll();
  }
}
