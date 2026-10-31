import { DiagnosticsStatusRenderer } from './DiagnosticsStatusRenderer.js';
import { YarbpMermaidConverter } from '../ast-converters/MermaidConvertor.js';
import { escText } from '../../escape.js';

/** `! как мермейд` — flowchart Mermaid для PR и markdown. */
export class MermaidRenderer extends DiagnosticsStatusRenderer {
  get statusClassName() {
    return 'mermaid-status';
  }

  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;

    const AST = this.parser.getAST();
    const source = this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '';
    const converter = new YarbpMermaidConverter(AST, { source });
    const text = converter.convert();

    this.showWarnings(converter.warnings);

    if (text === this.lastOutput) {
      this.syncRenderScroll();
      return;
    }

    this.lastOutput = text;
    this.renderTextarea.value = text;
    this.renderHighlightDiv.innerHTML = escText(text);
    this.syncRenderScroll();
  }
}
