import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpBPMNConverter } from '../ast-converters/bpmn/YarbpBPMNConverter.js';
import { XMLHighlighter } from '../highlighters/XMLHighlighter.js';

export class BPMNRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.downloadButton = null;
  }

  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpBPMNConverter(AST);
    const XML = converter.convert();

    this.renderTextarea.value = XML;

    const highlighter = new XMLHighlighter(XML);
    this.renderHighlightDiv.innerHTML = highlighter.highlight();

    this.syncRenderScroll();
    this.mountDownloadButton(XML);
  }

  mountDownloadButton(xml) {
    const host = this.renderTextarea.closest('.editor-container') ||
      this.renderTextarea.closest('#render-pane');
    if (!host) return;

    // Повторная отрисовка того же флейвора не должна плодить кнопки.
    const old = host.querySelector('.bpmn-download-btn');
    if (old) old.remove();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bpmn-download-btn';
    btn.textContent = 'BPMN';
    btn.title = 'Скачать BPMN';
    btn.setAttribute('aria-label', 'Скачать BPMN');

    host.appendChild(btn);
    this.downloadButton = btn;

    btn.addEventListener('click', () => {
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diagram.bpmn';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  /** Смена флейвора: убрать кнопку, привязанную к BPMN-панели. */
  destroy() {
    if (this.downloadButton) {
      this.downloadButton.remove();
      this.downloadButton = null;
    }

    const host = this.renderTextarea.closest('.editor-container') ||
      this.renderTextarea.closest('#render-pane');
    if (host) host.querySelectorAll('.bpmn-download-btn').forEach(btn => btn.remove());
  }
}