/**
 * Направляющие отступов и номера строк для редактора кода.
 *
 * Слой рисуется поверх подсветки, но под textarea, и проявляется только когда
 * каретка стоит перед первым непустым символом строки. Для каждого уникального
 * отступа в документе рисуется одна вертикальная линия (без дублей по строкам),
 * сверху линии подписан размер отступа в пробелах. Слева показываются номера
 * строк — они появляются и исчезают вместе с линиями.
 */

import { measureCharWidth } from './utils.js';

const MIN_GUTTER_WIDTH = 34;
const GUTTER_LEFT_PADDING = 10;
const GUTTER_RIGHT_PADDING = 8;
const FALLBACK_CHAR_WIDTH_RATIO = 0.6;

export class IndentGuides {
  /**
   * @param {HTMLTextAreaElement} textarea - поле ввода кода
   * @param {HTMLElement|null} container - контейнер редактора (по умолчанию ближайший .editor-container)
   */
  constructor(textarea, container = null) {
    this.textarea = textarea;
    this.container = container || textarea?.closest('.editor-container') || null;

    this.overlay = null;
    this.gutter = null;
    this.linesLayer = null;
    this.numbersLayer = null;

    this.lineInfo = [];
    this.levels = [];
    this.visible = false;
    this.currentLevel = null;

    this.charWidth = 7.2;
    this.lineHeight = 18;
    this.paddingLeft = 15;
    this.paddingTop = 15;
    this.gutterWidth = MIN_GUTTER_WIDTH;

    this.contentDirty = true;
    this.geometryDirty = true;
    this.guidesDirty = true;
    this.numbersRangeKey = null;

    this.frameId = null;
    this.destroyed = false;
    this.resizeObserver = null;

    this.onInput = () => {
      this.contentDirty = true;
      this.schedule();
    };
    this.onScroll = () => this.schedule();
    this.onFocusOrBlur = () => this.schedule();
    this.onSelectionChange = () => {
      if (document.activeElement === this.textarea) this.schedule();
    };
    this.onResize = () => {
      this.geometryDirty = true;
      this.schedule();
    };
    this.onFontsReady = () => {
      this.geometryDirty = true;
      this.schedule();
    };
  }

  /**
   * Создаёт слой и подписывается на изменения редактора.
   */
  init() {
    if (this.destroyed || !this.textarea || !this.container || this.overlay) return;

    this.buildDom();
    this.bindEvents();
    this.refresh();
  }

  buildDom() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'indent-guide-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.gutter = document.createElement('div');
    this.gutter.className = 'indent-guide-gutter';

    this.numbersLayer = document.createElement('div');
    this.numbersLayer.className = 'indent-guide-numbers';

    this.linesLayer = document.createElement('div');
    this.linesLayer.className = 'indent-guide-lines';

    this.gutter.appendChild(this.numbersLayer);
    this.overlay.appendChild(this.gutter);
    this.overlay.appendChild(this.linesLayer);
    this.container.appendChild(this.overlay);
  }

  bindEvents() {
    this.textarea.addEventListener('input', this.onInput);
    this.textarea.addEventListener('scroll', this.onScroll, { passive: true });
    this.textarea.addEventListener('focus', this.onFocusOrBlur);
    this.textarea.addEventListener('blur', this.onFocusOrBlur);
    document.addEventListener('selectionchange', this.onSelectionChange);
    window.addEventListener('resize', this.onResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.schedule());
      this.resizeObserver.observe(this.container);
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(this.onFontsReady).catch(() => {});
    }
  }

  /**
   * Пересчитывает содержимое и перерисовывает слой (например, после смены файла).
   */
  refresh() {
    if (this.destroyed) return;
    this.contentDirty = true;
    this.render();
  }

  schedule() {
    if (this.destroyed || this.frameId !== null) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.render();
    });
  }

  render() {
    if (this.destroyed || !this.overlay) return;

    if (this.contentDirty) {
      this.parseContent();
      this.contentDirty = false;
      this.geometryDirty = true;
    }

    if (this.geometryDirty) {
      this.updateGeometry();
      this.geometryDirty = false;
    }

    this.applyScroll();

    if (this.guidesDirty) {
      this.renderGuides();
      this.guidesDirty = false;
      this.currentLevel = null;
    }

    this.renderNumbers();
    this.updateVisibility();
    this.updateCurrentLevel();
  }

  /**
   * Разбирает текст: начала строк, отступы и уникальные уровни отступа.
   */
  parseContent() {
    const lines = this.textarea.value.split('\n');
    const levels = new Set();

    this.lineInfo = [];
    let position = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let indent = 0;
      while (indent < lineText.length && lineText[indent] === ' ') indent++;

      const hasContent = lineText.length > indent;
      this.lineInfo.push({ start: position, indent, hasContent });

      if (hasContent && indent > 0) levels.add(indent);
      position += lineText.length + 1;
    }

    this.levels = Array.from(levels).sort((a, b) => a - b);
    this.guidesDirty = true;
    this.numbersRangeKey = null;
  }

  updateGeometry() {
    const style = getComputedStyle(this.textarea);
    const fontSize = parseFloat(style.fontSize) || 12;

    this.lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;
    this.paddingTop = parseFloat(style.paddingTop) || 0;
    this.charWidth = measureCharWidth(style, fontSize * FALLBACK_CHAR_WIDTH_RATIO);

    const digits = String(Math.max(this.lineInfo.length, 1)).length;
    this.gutterWidth = Math.max(
      MIN_GUTTER_WIDTH,
      Math.ceil(digits * this.charWidth + GUTTER_LEFT_PADDING + GUTTER_RIGHT_PADDING)
    );
    this.container.style.setProperty('--editor-gutter', `${this.gutterWidth}px`);

    this.paddingLeft = parseFloat(getComputedStyle(this.textarea).paddingLeft) || 15;

    this.guidesDirty = true;
    this.numbersRangeKey = null;
  }

  applyScroll() {
    const scrollLeft = this.textarea.scrollLeft;
    const scrollTop = this.textarea.scrollTop;
    this.linesLayer.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.numbersLayer.style.transform = `translateY(${-scrollTop}px)`;
  }

  /**
   * Привязка к пиксельной сетке устройства — так же, как браузер рисует каретку.
   * Без неё линия может встать на 1px левее/правее каретки при дробном dpr.
   */
  snapToDevicePixel(value) {
    const ratio = window.devicePixelRatio || 1;
    return Math.floor(value * ratio) / ratio;
  }

  /**
   * Одна линия на уровень отступа + подпись с количеством пробелов над ней.
   */
  renderGuides() {
    const fragment = document.createDocumentFragment();
    const top = this.paddingTop;
    const height = Math.max(this.lineInfo.length * this.lineHeight, this.lineHeight);

    for (const level of this.levels) {
      const left = this.snapToDevicePixel(this.paddingLeft + level * this.charWidth);

      const line = document.createElement('div');
      line.className = 'indent-guide-line';
      line.dataset.level = String(level);
      line.style.left = `${left}px`;
      line.style.top = `${top}px`;
      line.style.height = `${height}px`;
      fragment.appendChild(line);

      const label = document.createElement('div');
      label.className = 'indent-guide-label';
      label.textContent = String(level);
      label.style.left = `${left}px`;
      label.style.top = `${top}px`;
      fragment.appendChild(label);
    }

    this.linesLayer.replaceChildren(fragment);
  }

  /**
   * Номера строк — только для видимой области, чтобы не плодить DOM.
   */
  renderNumbers() {
    const total = this.lineInfo.length;
    if (!total) {
      this.numbersLayer.replaceChildren();
      this.numbersRangeKey = null;
      return;
    }

    const scrollTop = this.textarea.scrollTop;
    const viewportHeight = this.container.clientHeight;
    const lastIndex = total - 1;

    const first = Math.max(0, Math.floor((scrollTop - this.paddingTop) / this.lineHeight));
    const last = Math.min(
      lastIndex,
      Math.ceil((scrollTop + viewportHeight - this.paddingTop) / this.lineHeight)
    );

    const key = `${first}:${last}`;
    if (key === this.numbersRangeKey) return;
    this.numbersRangeKey = key;

    const fragment = document.createDocumentFragment();
    for (let i = first; i <= last; i++) {
      const number = document.createElement('div');
      number.className = 'indent-guide-number';
      number.textContent = String(i + 1);
      number.style.top = `${this.paddingTop + i * this.lineHeight}px`;
      number.style.height = `${this.lineHeight}px`;
      number.style.lineHeight = `${this.lineHeight}px`;
      fragment.appendChild(number);
    }

    this.numbersLayer.replaceChildren(fragment);
  }

  /**
   * Каретка должна стоять ровно перед первым непустым символом строки.
   */
  isCaretBeforeFirstSymbol() {
    const textarea = this.textarea;

    if (!textarea || !this.lineInfo.length) return false;
    if (document.activeElement !== textarea) return false;
    if (textarea.selectionStart !== textarea.selectionEnd) return false;

    const line = this.lineInfo[this.findLineIndex(textarea.selectionStart)];
    if (!line || !line.hasContent) return false;

    return textarea.selectionStart - line.start === line.indent;
  }

  findLineIndex(offset) {
    let low = 0;
    let high = this.lineInfo.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const start = this.lineInfo[mid].start;
      const nextStart = mid + 1 < this.lineInfo.length
        ? this.lineInfo[mid + 1].start
        : Infinity;

      if (offset < start) {
        high = mid - 1;
      } else if (offset >= nextStart) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, Math.min(low, this.lineInfo.length - 1));
  }

  updateVisibility() {
    const shouldBeVisible = this.isCaretBeforeFirstSymbol();
    if (shouldBeVisible === this.visible) return;

    this.visible = shouldBeVisible;
    this.overlay.classList.toggle('is-visible', shouldBeVisible);
  }

  /**
   * Подсвечивает направляющую уровня отступа текущей строки с кареткой.
   */
  updateCurrentLevel() {
    const lineIndex = this.findLineIndex(this.textarea.selectionStart);
    const line = this.lineInfo[lineIndex];
    const level = this.isCaretBeforeFirstSymbol() && line ? line.indent : null;

    if (level === this.currentLevel) return;
    this.currentLevel = level;

    for (const element of this.linesLayer.querySelectorAll('.indent-guide-line')) {
      element.classList.toggle('is-current', Number(element.dataset.level) === level);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.textarea.removeEventListener('input', this.onInput);
    this.textarea.removeEventListener('scroll', this.onScroll);
    this.textarea.removeEventListener('focus', this.onFocusOrBlur);
    this.textarea.removeEventListener('blur', this.onFocusOrBlur);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.container?.style.removeProperty('--editor-gutter');

    this.overlay?.remove();
    this.overlay = null;
  }
}
