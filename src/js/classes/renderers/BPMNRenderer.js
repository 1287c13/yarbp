import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpBPMNConverter } from '../ast-converters/bpmn/YarbpBPMNConverter.js';
import { XMLHighlighter } from '../highlighters/XMLHighlighter.js';
import { Ticker } from '../../Ticker.js';

/**
 * Пауза автообновления схемы.
 *
 * Пересборка BPMN — самая тяжёлая операция редактора: модель, раскладка
 * (несколько проходов оптимизации), DI, сериализация и подсветка XML. На
 * каждый keystroke это секунды на большой схеме, а смотреть на промежуточные
 * состояния всё равно никто не успевает. Поэтому: первая отрисовка — сразу,
 * следующие — после паузы в наборе, плюс кнопка принудительного обновления.
 */
const BPMN_RENDER_DELAY_MS = 2000;

/** Кружок из стрелок: «обновить». */
const REFRESH_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 11a8 8 0 1 0-2.4 5.9"/><path d="M20 4v7h-7"/></svg>';

export class BPMNRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.actions = null;
    this.downloadButton = null;
    this.refreshButton = null;
    this.statusBox = null;
    this.ticker = new Ticker(BPMN_RENDER_DELAY_MS);
    this.lastXML = '';
    this.lastTokens = null;
    this.rendered = false;
  }

  /**
   * Вызывается на каждый ввод (observer лексера).
   *
   * Первый вызов рисует сразу — панель не должна пустовать при переключении
   * флейвора. Дальше — по тикеру, чтобы набор текста не пересобирал схему.
   */
  render() {
    if (!this.rendered) {
      this.renderNow();
      return;
    }

    // Тема и раскладка тоже просят перерисовку, но документ при этом не
    // менялся: токены — тот же массив, значит пересобирать схему незачем.
    if (this.lexer && this.lastTokens === this.lexer.tokens) return;

    this.markStale(true);
    this.ticker.schedule(() => this.performRender());
  }

  /** Принудительная перерисовка: кнопка «обновить» рядом со скачиванием. */
  renderNow() {
    this.ticker.cancel();
    this.performRender();
  }

  performRender() {
    const AST = this.parser.getAST();
    const converter = new YarbpBPMNConverter(AST, {
      source: this.lexer && typeof this.lexer.text === 'string' ? this.lexer.text : '',
    });
    const XML = converter.convert();

    this.rendered = true;
    this.lastTokens = this.lexer ? this.lexer.tokens : null;
    this.markStale(false);
    this.showWarnings(converter.warnings);

    // Тот же результат — не трогаем DOM: каретка, прокрутка и выделение
    // в панели результата остаются на месте.
    if (XML === this.lastXML && this.downloadButton) return;

    this.lastXML = XML;
    this.renderTextarea.value = XML;
    this.renderHighlightDiv.innerHTML = new XMLHighlighter(XML).highlight();
    this.syncRenderScroll();
    this.mountButtons();
  }

  /**
   * Строка диагностики панели BPMN (B-1).
   *
   * Конвертер сообщает, что не понял (неизвестный узел, дубль id, узел без
   * входящего потока, процесс без старта). Показываем первые три строки и
   * счётчик остальных; полный список — в `title`.
   */
  showWarnings(warnings) {
    const host = this.buttonHost();
    if (!host) return;

    if (!this.statusBox || !this.statusBox.isConnected) {
      const box = document.createElement('div');
      box.className = 'bpmn-status';
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

  /* ------------------------------------------------------------------ */
  /* Кнопки панели: скачать и обновить                                   */
  /* ------------------------------------------------------------------ */

  buttonHost() {
    return this.renderTextarea.closest('.editor-container') ||
      this.renderTextarea.closest('#render-pane');
  }

  mountButtons() {
    const host = this.buttonHost();
    if (!host) return;

    if (!this.actions || !this.actions.isConnected) {
      const actions = document.createElement('div');
      actions.className = 'bpmn-actions';
      host.appendChild(actions);
      this.actions = actions;
    }

    if (!this.refreshButton || !this.refreshButton.isConnected) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bpmn-refresh-btn';
      btn.innerHTML = REFRESH_ICON;
      btn.title = 'Обновить схему';
      btn.setAttribute('aria-label', 'Обновить схему BPMN');
      btn.addEventListener('click', () => this.renderNow());
      this.actions.appendChild(btn);
      this.refreshButton = btn;
    }

    if (!this.downloadButton || !this.downloadButton.isConnected) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bpmn-download-btn';
      btn.textContent = 'BPMN';
      btn.title = 'Скачать BPMN';
      btn.setAttribute('aria-label', 'Скачать BPMN');
      btn.addEventListener('click', () => this.download());
      this.actions.appendChild(btn);
      this.downloadButton = btn;
    }
  }

  /** Показ «схема устарела»: автообновление ждёт паузы в наборе. */
  markStale(stale) {
    if (!this.refreshButton) return;

    this.refreshButton.classList.toggle('is-stale', !!stale);
    this.refreshButton.title = stale
      ? 'Схема устарела: обновится сама после паузы или по этой кнопке'
      : 'Обновить схему';
  }

  download() {
    const blob = new Blob([this.lastXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.bpmn';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Смена флейвора: снять тикер и убрать кнопки BPMN. */
  destroy() {
    this.ticker.cancel();

    if (this.actions) {
      this.actions.remove();
      this.actions = null;
    }

    if (this.statusBox) {
      this.statusBox.remove();
      this.statusBox = null;
    }

    const host = this.buttonHost();
    if (host) {
      host.querySelectorAll('.bpmn-actions, .bpmn-download-btn, .bpmn-refresh-btn, .bpmn-status')
        .forEach(element => element.remove());
    }

    this.downloadButton = null;
    this.refreshButton = null;
    this.rendered = false;
  }
}
