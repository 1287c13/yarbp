import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpOpenAPIConverter } from '../ast-converters/OpenAPIConvertor.js';
import { escText } from '../../escape.js';

/**
 * Панель «JSON-документ»: конвертер → JSON + строка диагностики.
 *
 * Общая часть для OpenAPI и JSON Schema: оба конвертера отдают объект и
 * warnings[], поэтому отличается только сам конвертер и имя класса строки
 * статуса (чтобы стили и `destroy()` не путались между панелями).
 */
export class JsonDocumentRenderer extends YarbpBasicRenderer {
  /** @abstract */
  createConverter() {
    throw new Error('createConverter must be implemented');
  }

  get statusClassName() {
    return 'json-status';
  }

  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;

    const AST = this.parser.getAST();
    const source = this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '';
    const converter = this.createConverter(AST, source);
    const spec = JSON.stringify(converter.convert(), null, 2);

    this.showWarnings(converter.warnings);

    if (spec === this.lastSpec) {
      this.syncRenderScroll();
      return;
    }

    this.lastSpec = spec;
    this.renderTextarea.value = spec;
    this.renderHighlightDiv.innerHTML = escText(spec);
    this.syncRenderScroll();
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
    this.lastSpec = null;
  }
}

/** `! как openapi` — контракт REST API. */
export class OpenAPIRenderer extends JsonDocumentRenderer {
  createConverter(ast, source) {
    return new YarbpOpenAPIConverter(ast, { source });
  }

  get statusClassName() {
    return 'openapi-status';
  }
}
