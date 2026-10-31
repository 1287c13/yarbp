import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';

/**
 * База для панелей, которые показывают результат конвертера и строку
 * диагностики: `warnings[]` конвертера → строка под панелью (как в BPMN).
 *
 * Наследники задают только `createConverter()`/`render()` и имя класса строки
 * (`.openapi-status`, `.schema-status`, `.mermaid-status`), чтобы стили и
 * `destroy()` не путались между панелями.
 */
export class DiagnosticsStatusRenderer extends YarbpBasicRenderer {
  get statusClassName() {
    return 'json-status';
  }

  /** Строка диагностики: первые три сообщения и счётчик остальных. */
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

  /** Контейнер панели — тот же, что у BPMN: там есть position для строки. */
  panelHost() {
    return this.renderTextarea.closest('.editor-container') ||
      this.renderTextarea.closest('#render-pane');
  }

  /** Смена флейвора: убираем строку диагностики, чтобы не висела. */
  destroy() {
    const host = this.panelHost();
    if (host) {
      host.querySelectorAll('.' + this.statusClassName).forEach(element => element.remove());
    }
    this.statusBox = null;
    this.lastOutput = null;
  }
}
