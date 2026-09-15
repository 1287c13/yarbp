import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpBPMNConverter } from '../ast-converters/bpmn/YarbpBPMNConverter.js';
import { XMLHighlighter } from '../highlighters/XMLHighlighter.js';

export class BPMNRenderer extends YarbpBasicRenderer {
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
    const controls = document.querySelector('.top-controls');
    if (!controls) return;

    const old = controls.querySelector('.bpmn-download-btn');
    if (old) old.remove();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bpmn-download-btn';
    btn.title = 'Скачать BPMN';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24"
           fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <path d="M12 3v12" />
        <path d="M7 11l5 5 5-5" />
        <path d="M4 21h16" />
      </svg>
    `;

    controls.prepend(btn);

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
}