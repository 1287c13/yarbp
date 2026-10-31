import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpOpenAPIConverter } from '../ast-converters/OpenAPIConvertor.js';
import { escText } from '../../escape.js';

/**
 * Панель флейвора `! как openapi`: JSON-контракт OpenAPI 3.0 + строка
 * диагностики.
 *
 * Устроено как панель BPMN (B-1): конвертер сообщает, что не понял
 * (неизвестный узел, путь без методов, ссылка на несуществующую схему), а
 * здесь это показывается строкой, а не теряется молча.
 */
export class OpenAPIRenderer extends YarbpBasicRenderer {
  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;

    const AST = this.parser.getAST();
    const converter = new YarbpOpenAPIConverter(AST, {
      source: this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '',
    });
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
      box.className = 'openapi-status';
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
      host.querySelectorAll('.openapi-status').forEach(element => element.remove());
    }
    this.statusBox = null;
    this.lastSpec = null;
  }
}
