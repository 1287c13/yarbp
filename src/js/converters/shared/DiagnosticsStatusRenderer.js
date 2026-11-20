import { YarbpBasicRenderer } from './renderer.js';

// База для панелей, которые показывают результат конвертера и строку диагностики: `warnings[]` конвертера → строка под…
export class DiagnosticsStatusRenderer extends YarbpBasicRenderer {
  get statusClassName() {
    return 'json-status';
  }

  showWarnings(warnings) {
    const host = this.panelHost();
    if (!host) return;

    if (!this.statusBox || !this.statusBox.isConnected) {
      const box = document.createElement('div');
      box.className = this.statusClassName;
      box.setAttribute('role', 'status');
      box.hidden = true;
      host.appendChild(box);
      this.statusBox = box;
    }

    const items = (warnings || []).filter(Boolean);
    this.statusBox.hidden = !items.length;

    if (!items.length) {
      this.statusBox.textContent = '';
      this.statusBox.title = '';
      return;
    }

    const label = (item) => (item.line ? 'строка ' + item.line + ': ' : '') + item.message;
    const shown = items.slice(0, 3).map(label);
    const rest = items.length - shown.length;

    this.statusBox.textContent = shown.join('; ') + (rest > 0 ? '; и ещё ' + rest : '');
    this.statusBox.title = items.map(label).join('\n');
  }

  panelHost() {
    return this.renderTextarea.closest('.editor-container') ||
      this.renderTextarea.closest('#render-pane');
  }

  destroy() {
    const host = this.panelHost();
    if (host) {
      host.querySelectorAll('.' + this.statusClassName).forEach(element => element.remove());
    }
    this.statusBox = null;
    this.lastOutput = null;
  }
}
