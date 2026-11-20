import { YarbpBasicRenderer } from '../shared/renderer.js';
import { YarbpFlexFormsConverter } from './converter.js';
import {
  buildFormConfig,
  buildFormPage,
  buildPreviewMarkup,
  formConfigError,
  formConfigWarnings,
  formFileName,
  FLEX_FORMS_PREVIEW_CSS,
  FLEX_FORMS_PHONE,
} from './page.js';
import { FLEX_FORMS_MOCK_SERVER } from './mock-server.js';

const PREVIEW_DEBOUNCE_MS = 400;

// Страница-хост предпросмотра.
const PREVIEW_HOST_PAGE = new URL('../../../preview/host.html', import.meta.url).href;

const EMPTY_IR_HINT = '<!DOCTYPE html><meta charset="utf-8">' +
  '<style>html,body{margin:0;height:100%;background:#0a0c10;color:#8b93a7;' +
  'font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;' +
  'justify-content:center;text-align:center;padding:16px}</style>' +
  'Форма не собрана — проверьте разметку.';

// Рендерер флейвора «форма-ТСД» (`! как форма-тсд`).
export class FlexFormsRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.container = null;
    this.iframe = null;
    this.lastIR = '';          // IR, уже отданный в iframe (как строка)
    this.timer = null;         // таймер отложенной перерисовки
    this.errorTimer = null;    // плашка ошибки выгрузки
    this.resizeObserver = null;
    this.windowResizeHandler = null;
    this.previewSerial = 0;    // номер загрузки хоста: каждая — свежий документ
    this.pendingPreviewHtml = null;
    this.previewMounted = false;
    this.onPreviewMessage = (event) => this.handlePreviewMessage(event);
    window.addEventListener('message', this.onPreviewMessage);
  }

  render() {
    const container = this.ensureContainer();
    if (!container) return;

    this.applyTheme(container);

    const IR = this.convertToIR();
    const serialized = IR === null ? '' : JSON.stringify(IR);

    if (serialized === this.lastIR && this.iframe && this.iframe.isConnected) return;

    if (IR === null) {
      // Разметка неполная — прошлый предпросмотр не трогаем; если его не было, показываем, что форма пока не собрана.
      if (this.iframe && !this.previewMounted) this.showPreviewHtml(EMPTY_IR_HINT);
      return;
    }

    clearTimeout(this.timer);
    const delay = this.previewMounted ? PREVIEW_DEBOUNCE_MS : 0;
    this.timer = setTimeout(() => this.mountPreview(IR, serialized), delay);
  }

  convertToIR() {
    let AST = null;
    try { AST = this.parser.getAST(); } catch (e) { return null; }
    if (!AST) return null;

    try {
      return new YarbpFlexFormsConverter(AST).convert();
    } catch (e) {
      console.warn('[flexforms] IR не собран:', e.message);
      return null;
    }
  }

  ensureContainer() {
    const renderPane = this.renderTextarea.closest('#render-pane');
    if (!renderPane) return null;

    const editorContainer = this.renderTextarea.closest('.editor-container');
    if (editorContainer) editorContainer.style.display = 'none';

    if (this.container && this.container.isConnected && renderPane.contains(this.container)) {
      return this.container;
    }

    this.disconnectResize();
    const stale = renderPane.querySelector('.ui-render-container');
    if (stale) stale.remove();

    const container = document.createElement('div');
    container.className = 'ui-render-container ff-render-container';
    container.style.cssText = 'padding:0;overflow:hidden;height:100%;box-sizing:border-box;position:relative;';
    container.innerHTML = '<style>' + FLEX_FORMS_PREVIEW_CSS + '</style>' + buildPreviewMarkup();
    renderPane.appendChild(container);

    const screen = container.querySelector('.ff-phone-screen');

    // Документ подставляет страница-хост (preview/host.html): srcdoc наследовал бы
    // CSP редактора, а странице формы нужны встроенные скрипты и стили.
    const iframe = document.createElement('iframe');
    iframe.title = 'Предпросмотр формы ТСД';
    iframe.setAttribute('allow', 'clipboard-write');
    screen.appendChild(iframe);

    this.container = container;
    this.iframe = iframe;
    this.lastIR = '';
    this.previewSerial = 0;
    this.pendingPreviewHtml = null;
    this.previewMounted = false;
    this.createExportButtons(container);
    this.observeResize(container);

    return container;
  }

  applyTheme(container) {
    const isDark = document.body.classList.contains('dark');
    container.style.background = isDark ? '#2d2d2d' : '#ffffff';
  }

  // Три выгрузки: JSON-конфиг для расширения 1С, готовая HTML-страница и Python-мок сервера.
  createExportButtons(container) {
    const group = document.createElement('div');
    group.className = 'ff-export-buttons';

    const config = document.createElement('button');
    config.type = 'button';
    config.className = 'ff-export-btn ff-export-btn--config';
    config.textContent = 'JSON';
    config.title = 'Скачать конфиг формы (JSON для вставки в 1С)';
    config.setAttribute('aria-label', 'Скачать конфиг формы в JSON');
    config.addEventListener('click', () => this.downloadConfig());

    const page = document.createElement('button');
    page.type = 'button';
    page.className = 'ff-export-btn ff-export-btn--html';
    page.textContent = 'HTML';
    page.title = 'Скачать готовую HTML-страницу формы';
    page.setAttribute('aria-label', 'Скачать HTML-страницу формы');
    page.addEventListener('click', () => this.downloadPage());

    const mock = document.createElement('button');
    mock.type = 'button';
    mock.className = 'ff-export-btn ff-export-btn--mock';
    mock.textContent = 'мок-сервер';
    mock.title = 'Скачать Python-мок сервера: хук, отправка и health';
    mock.setAttribute('aria-label', 'Скачать Python-мок сервера');
    mock.addEventListener('click', () => this.downloadMockServer());

    group.appendChild(config);
    group.appendChild(page);
    group.appendChild(mock);
    container.appendChild(group);

    return config;
  }

  // IR текущей разметки → файл конфига для расширения 1С.
  downloadConfig() {
    const IR = this.convertToIR();
    const error = formConfigError(IR);
    if (error) {
      this.showExportError(error);
      return;
    }

    this.saveFile(buildFormConfig(IR), formFileName(IR, 'json'), 'application/json;charset=utf-8');

    // Файл уже скачан: замечания не блокируют выгрузку, а говорят, что расширение 1С применит конфиг «как есть» (например,…
    const warnings = formConfigWarnings(IR);
    if (warnings.length) this.showExportError(warnings.join(' '), 'warning');
  }

  // IR текущей разметки → самостоятельная HTML-страница.
  downloadPage() {
    const IR = this.convertToIR();
    const error = formConfigError(IR);
    if (error) {
      this.showExportError(error);
      return;
    }

    this.saveFile(buildFormPage(IR, { standalone: true }), formFileName(IR, 'html'), 'text/html;charset=utf-8');
  }

  // Python-мок сервера: один stdlib-модуль с хуком, отправкой и health.
  downloadMockServer() {
    this.saveFile(FLEX_FORMS_MOCK_SERVER, 'flexforms_mock_server.py', 'text/x-python;charset=utf-8');
  }

  saveFile(text, fileName, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Отказ выгрузки показываем в панели, а не тостом: тост макета занят сообщениями самой формы (хук, отправка), а…
  showExportError(message, tone = 'error') {
    if (!this.container || !this.container.isConnected) return;

    let box = this.container.querySelector('.ff-export-error');
    if (!box) {
      box = document.createElement('div');
      this.container.appendChild(box);
    }
    box.className = 'ff-export-error' + (tone === 'warning' ? ' ff-export-error--warning' : '');
    box.textContent = message;

    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, tone === 'warning' ? 7000 : 4000);
  }

  mountPreview(IR, serialized) {
    if (!this.iframe || !this.iframe.isConnected) return;

    try {
      this.showPreviewHtml(buildFormPage(IR, { preview: true }));
      this.lastIR = serialized;
    } catch (e) {
      console.error('[flexforms] страница формы не собрана:', e);
    }
  }

  // Отдать готовую страницу в iframe через страницу-хост.
  showPreviewHtml(html) {
    if (!this.iframe || !this.iframe.isConnected) return;

    this.pendingPreviewHtml = html;
    this.previewSerial += 1;
    this.iframe.src = PREVIEW_HOST_PAGE + '?v=' + this.previewSerial;
    this.previewMounted = true;
  }

  handlePreviewMessage(event) {
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data) return;

    if (data.type === 'yarbp-preview-error') {
      console.error('[flexforms] предпросмотр не подставился:', data.message);
      return;
    }

    if (data.type !== 'yarbp-preview-ready') return;
    if (!this.iframe || !this.iframe.contentWindow) return;
    if (event.source !== this.iframe.contentWindow) return;
    if (typeof this.pendingPreviewHtml !== 'string') return;

    this.iframe.contentWindow.postMessage(
      { type: 'yarbp-preview', html: this.pendingPreviewHtml },
      window.location.origin
    );
  }

  destroy() {
    window.removeEventListener('message', this.onPreviewMessage);
    this.disconnectResize();
    clearTimeout(this.timer);
    clearTimeout(this.errorTimer);
    this.pendingPreviewHtml = null;
    this.iframe = null;
    this.container = null;
  }


  observeResize(container) {
    this.fitPhone();

    if (typeof ResizeObserver === 'undefined') {
      this.windowResizeHandler = () => this.fitPhone();
      window.addEventListener('resize', this.windowResizeHandler);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container || !this.container.isConnected) {
        this.disconnectResize();
        return;
      }
      this.fitPhone();
    });
    this.resizeObserver.observe(container);
  }

  disconnectResize() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
  }

  // Рамка масштабируется целиком: SVG — вектор (не мылит), а экран (iframe) сохраняет свой логический размер 356x471.
  fitPhone() {
    if (!this.container || !this.container.isConnected) return;

    const preview = this.container.querySelector('.ff-preview');
    const phone = this.container.querySelector('.ff-phone');
    const box = this.container.querySelector('.ff-phone-scale');
    if (!preview || !phone || !box) return;

    const padding = 32;                        // .ff-preview padding:16px с двух сторон
    const availableW = Math.max(140, preview.clientWidth - padding);
    const availableH = Math.max(200, preview.clientHeight - padding);
    const screenBottom = FLEX_FORMS_PHONE.screen.top + FLEX_FORMS_PHONE.screen.height;

    const scale = Math.min(
      1,
      availableW / FLEX_FORMS_PHONE.width,
      availableH / screenBottom
    );

    // Размер рамки в раскладке — уже умноженный: место занимает именно он, иначе трансформация вылезала бы за панель и…
    box.style.width = (FLEX_FORMS_PHONE.width * scale).toFixed(2) + 'px';
    box.style.height = (FLEX_FORMS_PHONE.height * scale).toFixed(2) + 'px';
    phone.style.transform = 'scale(' + scale.toFixed(4) + ')';
  }

  syncRenderScroll() {}
}
