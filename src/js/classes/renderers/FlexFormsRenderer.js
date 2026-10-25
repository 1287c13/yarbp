import { YarbpBasicRenderer } from '../YarbpBasicRenderer.js';
import { YarbpFlexFormsConverter } from '../ast-converters/FlexFormsConvertor.js';
import {
  buildFormConfig,
  buildFormPage,
  buildPreviewMarkup,
  formConfigError,
  formFileName,
  FLEX_FORMS_PREVIEW_CSS,
  FLEX_FORMS_PHONE,
} from './flexforms/FlexFormsPage.js';
import { FLEX_FORMS_MOCK_SERVER } from './flexforms/FlexFormsMockServer.js';

/** Пауза перед перезагрузкой предпросмотра: пока печатают — не дёргаем iframe. */
const PREVIEW_DEBOUNCE_MS = 400;

/** Заглушка экрана, если из разметки не собирается IR. */
const EMPTY_IR_HINT = '<!DOCTYPE html><meta charset="utf-8">' +
  '<style>html,body{margin:0;height:100%;background:#0a0c10;color:#8b93a7;' +
  'font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;' +
  'justify-content:center;text-align:center;padding:16px}</style>' +
  'Форма не собрана — проверьте разметку.';

/**
 * Рендерер флейвора «форма-ТСД» (`! как форма-тсд`).
 *
 * Разметка ЯРБП → AST → IR формы (YarbpFlexFormsConverter) → страница формы,
 * собранная дословно из редизайна ТСД (FlexFormsPage) → предпросмотр в рамке
 * корпуса ТСД внутри iframe.
 *
 * Наружу рендерер отдаёт **конфиг JSON** (кнопка «JSON»), **готовую
 * HTML-страницу** (кнопка «HTML») и **Python-мок сервера** (кнопка
 * «мок-сервер»). JSON нужен расширению 1С, HTML можно открыть как обычную
 * страницу: CSS, движок и IR уже внутри, мок-сервер поднимает локальные
 * эндпоинты хука/отправки/health для проверки формы.
 *
 * Почему iframe: страница формы — самостоятельное приложение (свой `data-theme`,
 * localStorage, beforeunload, `100dvh`). В iframe она живёт ровно тем же кодом,
 * что и на ТСД, без правок CSS/движка. `srcdoc` наследует origin редактора,
 * поэтому localStorage в предпросмотре работает.
 */
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
  }

  render() {
    const container = this.ensureContainer();
    if (!container) return;

    this.applyTheme(container);

    const IR = this.convertToIR();
    const serialized = IR === null ? '' : JSON.stringify(IR);

    if (serialized === this.lastIR && this.iframe && this.iframe.isConnected) return;

    if (IR === null) {
      // Разметка неполная — прошлый предпросмотр не трогаем; если его не было,
      // показываем, что форма пока не собрана.
      if (this.iframe && !this.iframe.srcdoc) this.iframe.srcdoc = EMPTY_IR_HINT;
      return;
    }

    clearTimeout(this.timer);
    // Первый показ — сразу, дальше — после паузы в наборе.
    const delay = this.iframe.srcdoc ? PREVIEW_DEBOUNCE_MS : 0;
    this.timer = setTimeout(() => this.mountPreview(IR, serialized), delay);
  }

  /** Разметка → IR. null, если AST не собран или конвертер не смог. */
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

  /** Контейнер предпросмотра в панели результата (класс — как у остальных рендереров). */
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

    // srcdoc задаём свойством: так не нужно экранировать кавычки и амперсанды.
    const iframe = document.createElement('iframe');
    iframe.title = 'Предпросмотр формы ТСД';
    iframe.setAttribute('allow', 'clipboard-write');
    screen.appendChild(iframe);

    this.container = container;
    this.iframe = iframe;
    this.lastIR = '';
    this.createExportButtons(container);
    this.observeResize(container);

    return container;
  }

  /** Фон панели под тему редактора (как у остальных рендереров). */
  applyTheme(container) {
    const isDark = document.body.classList.contains('dark');
    container.style.background = isDark ? '#2d2d2d' : '#ffffff';
  }

  /**
   * Три выгрузки: JSON-конфиг для расширения 1С, готовая HTML-страница и
   * Python-мок сервера. Подписи текстовые: одинаковые иконки не объясняли бы,
   * что скачивается.
   */
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

  /**
   * IR текущей разметки → файл конфига для расширения 1С.
   *
   * Текст — ровно тот JSON, который получает страница предпросмотра (см.
   * buildFormConfig), поэтому на стороне 1С достаточно подставить его в
   * оболочку вместо маркера. Файл пишется как UTF-8 без BOM: это стандарт JSON,
   * и `ПрочитатьJSON` не спотыкается о первый символ.
   */
  downloadConfig() {
    const IR = this.convertToIR();
    const error = formConfigError(IR);
    if (error) {
      this.showExportError(error);
      return;
    }

    this.saveFile(buildFormConfig(IR), formFileName(IR, 'json'), 'application/json;charset=utf-8');
  }

  /**
   * IR текущей разметки → самостоятельная HTML-страница.
   *
   * Без `{ preview: true }`: в файле не должно быть редакторских заглушек,
   * отключающих автофокус и сбрасывающих сохранённый IR. Страница содержит
   * CSS, движок и данные формы, поэтому открывается без сборки и сети.
   */
  downloadPage() {
    const IR = this.convertToIR();
    const error = formConfigError(IR);
    if (error) {
      this.showExportError(error);
      return;
    }

    this.saveFile(buildFormPage(IR, { standalone: true }), formFileName(IR, 'html'), 'text/html;charset=utf-8');
  }

  /**
   * Python-мок сервера: один stdlib-модуль с хуком, отправкой и health.
   * Он не зависит от IR: метод определяется по последнему сегменту URL,
   * поэтому подходит и для `/rt_morato_bot/hs/dp/link`, и для `/api/v2/link`.
   */
  downloadMockServer() {
    this.saveFile(FLEX_FORMS_MOCK_SERVER, 'flexforms_mock_server.py', 'text/x-python;charset=utf-8');
  }

  /** Текст → файл. */
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

  /**
   * Отказ выгрузки показываем в панели, а не тостом: тост макета занят
   * сообщениями самой формы (хук, отправка), а молчание кнопки выглядит
   * поломкой. Плашка уходит сама.
   */
  showExportError(message) {
    if (!this.container || !this.container.isConnected) return;

    let box = this.container.querySelector('.ff-export-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ff-export-error';
      this.container.appendChild(box);
    }
    box.textContent = message;

    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 4000);
  }

  mountPreview(IR, serialized) {
    if (!this.iframe || !this.iframe.isConnected) return;

    try {
      this.iframe.srcdoc = buildFormPage(IR, { preview: true });
      this.lastIR = serialized;
    } catch (e) {
      console.error('[flexforms] страница формы не собрана:', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Рамка: масштаб под размер панели                                    */
  /* ------------------------------------------------------------------ */

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

  /**
   * Рамка масштабируется целиком: SVG — вектор (не мылит), а экран (iframe)
   * сохраняет свой логический размер 356x471. Значит форма верстается один раз
   * и дальше только масштабируется: в узкой панели она уменьшается, а не
   * перекомпоновывается под её ширину (иначе при широкой панели форма «расползалась»
   * бы на планшетную раскладку, а в узкой обрезалась).
   *
   * Крупнее 1:1 не увеличиваем. При масштабе 1 CSS-пиксель формы равен пикселю
   * редизайна: предпросмотр показывает ровно тот же размер, что страница на ТСД,
   * а текст и 1px-рамки полей остаются резкими. Раньше рамка могла расти до 1.6,
   * и «тот же» макет в панели выглядел крупнее, чем на устройстве.
   *
   * Вписываем не корпус, а саму форму. Корпус нарисован вместе с клавиатурой и
   * потому почти в два раза длиннее экрана (799 против 84+471): подгонка по
   * корпусу ужимала бы форму даже в высокой панели (в панели 720 точек это
   * −14%, то есть та самая разница с редизайном). Поэтому по высоте считаем
   * запас до НИЗА ЭКРАНА, и если он влезает — масштаб остаётся 1, а «хвост»
   * корпуса просто уезжает в прокрутку панели.
   */
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

    // Размер рамки в раскладке — уже умноженный: место занимает именно он,
    // иначе трансформация вылезала бы за панель и рисовала бы скроллбары.
    box.style.width = (FLEX_FORMS_PHONE.width * scale).toFixed(2) + 'px';
    box.style.height = (FLEX_FORMS_PHONE.height * scale).toFixed(2) + 'px';
    phone.style.transform = 'scale(' + scale.toFixed(4) + ')';
  }

  syncRenderScroll() {}
}
