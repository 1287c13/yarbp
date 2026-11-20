import { measureCharWidth } from '../utils/utils.js';

let uiCounter = 0;

/**
 * Меню подсказок с тремя явными состояниями: `idle` / `hint` / `list`.
 *
 * - в `hint` (начало строки) список не перехватывает `Tab`: он уходит в
 *   редактор и делает отступ;
 * - в `list` `Tab` принимает вариант, `↑`/`↓` выбирают, `Escape` закрывает;
 * - при непустом выделении `Tab` не «полузаменяет» выделение: меню
 *   закрывается, а отступ делает редактор.
 */
export class SuggestionUI {
  constructor(textarea, container) {
    this.textarea = textarea;
    this.container = container;

    const id = 'yarbp-suggestions-' + (++uiCounter);

    this.root = document.createElement('div');
    this.root.className = 'suggestion-popup';
    this.root.hidden = true;

    this.list = document.createElement('ul');
    this.list.className = 'suggestion-list';
    this.list.id = id;
    this.list.setAttribute('role', 'listbox');

    this.blockDocBox = document.createElement('div');
    this.blockDocBox.className = 'suggestion-block-doc';

    this.itemDocBox = document.createElement('div');
    this.itemDocBox.className = 'suggestion-item-doc';

    this.hintBox = document.createElement('div');
    this.hintBox.className = 'suggestion-hint';
    this.hintBox.hidden = true;
    this.hintBox.setAttribute('role', 'status');

    // Порядок в popup: шапка-контекст («Свойства формы») → список → описание
    // выбранного варианта → чип hint-режима. Раньше контекст и описание стояли
    // подряд под списком одной серой массой, и было непонятно, что из них к
    // чему относится.
    this.root.appendChild(this.blockDocBox);
    this.root.appendChild(this.list);
    this.root.appendChild(this.itemDocBox);
    this.root.appendChild(this.hintBox);
    container.appendChild(this.root);

    this.state = 'idle';
    this.activeIndex = 0;
    this.current = null;

    if (this.textarea) {
      this.textarea.setAttribute('aria-controls', id);
      this.textarea.setAttribute('aria-autocomplete', 'list');
      this.textarea.setAttribute('aria-expanded', 'false');
    }

    this.list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      this.activeIndex = Number(li.dataset.index);
      this.apply();
    });
  }

  isOpen() {
    return this.state !== 'idle' && !this.root.hidden;
  }

  show({ suggestions, blockDoc, replaceFrom, replace, hint, prefix }) {
    const variants = suggestions || [];

    if (variants.length) {
      this.state = 'list';
      this.current = {
        suggestions: variants,
        blockDoc: blockDoc || '',
        replaceFrom,
        replace: replace !== false,
        prefix: prefix || '',
      };
      this.activeIndex = this.findActiveIndex(variants, prefix);

      this.root.hidden = false;
      this.root.classList.remove('hint-mode');

      this.renderList();
      this.renderDoc();
      // Только чип подсказки: renderHint() дополнительно прячет список и
      // доки, а в режиме списка они только что отрисованы.
      this.renderHintBox('');
      this.position();
      this.textarea?.setAttribute('aria-expanded', 'true');
      return;
    }

    if (hint) {
      this.state = 'hint';
      this.current = null;
      this.activeIndex = 0;

      this.root.hidden = false;
      this.root.classList.add('hint-mode');

      this.renderHint(hint);
      this.position();
      this.textarea?.setAttribute('aria-expanded', 'true');
      return;
    }

    this.hide();
  }

  findActiveIndex(suggestions, prefix) {
    if (!prefix) return 0;
    const p = String(prefix).toLowerCase();
    const idx = suggestions.findIndex(s =>
      String(s.label).toLowerCase().startsWith(p));
    return idx >= 0 ? idx : 0;
  }

  hide() {
    this.state = 'idle';
    this.root.hidden = true;
    this.root.classList.remove('hint-mode');
    this.current = null;
    this.activeIndex = 0;
    this.textarea?.setAttribute('aria-expanded', 'false');
    this.textarea?.removeAttribute('aria-activedescendant');
  }

  refresh() {
    if (!this.isOpen()) return;
    this.position();
  }

  renderList() {
    this.list.innerHTML = '';
    this.list.hidden = false;
    this.blockDocBox.hidden = false;
    this.itemDocBox.hidden = false;
    if (!this.current) return;

    this.current.suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      li.dataset.index = i;
      li.id = this.list.id + '-item-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === this.activeIndex ? 'true' : 'false');
      if (i === this.activeIndex) li.classList.add('active');
      this.list.appendChild(li);
    });

    this.updateActiveDescendant();
  }

  updateActiveDescendant() {
    if (!this.current) {
      this.textarea?.removeAttribute('aria-activedescendant');
      return;
    }
    const id = this.list.id + '-item-' + this.activeIndex;
    this.textarea?.setAttribute('aria-activedescendant', id);
    const active = this.list.querySelector('li.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  renderDoc() {
    if (!this.current) {
      this.blockDocBox.hidden = true;
      this.itemDocBox.hidden = true;
      return;
    }

    const blockDoc = this.current.blockDoc || '';
    this.blockDocBox.textContent = blockDoc;
    this.blockDocBox.hidden = blockDoc === '';

    const s = this.current.suggestions[this.activeIndex];
    const itemDoc = s?.doc || '';
    this.itemDocBox.textContent = itemDoc;
    this.itemDocBox.hidden = itemDoc === '';
  }

  renderHint(text) {
    this.list.hidden = true;
    this.blockDocBox.hidden = true;
    this.itemDocBox.hidden = true;
    this.renderHintBox(text);
  }

  /**
   * Чип-подсказка (например «▼ Alt») — без побочных эффектов для списка и
   * доков. Отдельно от renderHint(), потому что в режиме списка список уже
   * отрисован и прятать его нельзя (иначе popup схлопывается в полоску).
   */
  renderHintBox(text) {
    this.hintBox.textContent = text || '';
    this.hintBox.hidden = !text;
  }

  position() {
    const ta = this.textarea;
    if (!ta) return;

    const offset = ta.selectionStart;
    const before = ta.value.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineText = before.slice(lineStart);
    const row = (before.match(/\n/g) || []).length;

    const taRect = ta.getBoundingClientRect();
    const cRect = this.container.getBoundingClientRect();
    const style = getComputedStyle(ta);

    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const fontSize = parseFloat(style.fontSize) || 12;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;
    const charWidth = measureCharWidth(style, fontSize * 0.6);
    const tabSize = parseInt(style.tabSize, 10) || 2;

    let col = 0;
    for (const ch of lineText) {
      col += ch === '\t' ? tabSize - (col % tabSize) : 1;
    }

    const baseLeft = taRect.left - cRect.left;
    const baseTop = taRect.top - cRect.top;

    let x = baseLeft + paddingLeft + col * charWidth - ta.scrollLeft;
    let y = baseTop + paddingTop + (row + 1) * lineHeight - ta.scrollTop;

    const popupWidth = this.root.offsetWidth || 0;
    const popupHeight = this.root.offsetHeight || 0;

    const maxLeft = Math.max(0, cRect.width - paddingRight - popupWidth);
    x = Math.min(Math.max(0, x), maxLeft);

    // У нижней границы окна меню переворачивается вверх — как в IDE.
    const bottom = y + popupHeight;
    if (bottom > cRect.height && y - lineHeight - popupHeight >= 0) {
      y = y - lineHeight - popupHeight;
    }

    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
  }

  moveUp() {
    if (!this.current) return;
    this.activeIndex = (this.activeIndex - 1 + this.current.suggestions.length)
      % this.current.suggestions.length;
    this.renderList();
    this.renderDoc();
  }

  moveDown() {
    if (!this.current) return;
    this.activeIndex = (this.activeIndex + 1) % this.current.suggestions.length;
    this.renderList();
    this.renderDoc();
  }

  apply() {
    if (!this.current) return;
    const s = this.current.suggestions[this.activeIndex];
    if (!s) return;

    const ta = this.textarea;
    const selectionStart = ta.selectionStart;
    const selectionEnd = ta.selectionEnd;

    let start;
    let end;

    if (selectionStart !== selectionEnd) {
      // Выделение заменяем целиком — не «половину» до каретки.
      start = selectionStart;
      end = selectionEnd;
    } else if (this.current.replace === false) {
      start = selectionStart;
      end = selectionEnd;
    } else {
      start = this.current.replaceFrom ?? selectionStart;
      if (start > selectionStart) start = selectionStart;
      end = selectionStart;
    }

    start = Math.max(0, Math.min(start, ta.value.length));
    end = Math.max(start, Math.min(end, ta.value.length));

    const prepared = this.prepareInsert(s.insert ?? s.label ?? '', s, start);
    start = prepared.start;
    const finish = start + prepared.text.length;
    const replaced = ta.value.slice(start, end);
    const before = ta.value;

    this.hide();

    /* Вставка идёт через execCommand('insertText'), а не setRangeText: только
       так правка попадает в нативную историю отмены, и Ctrl+Z возвращает
       набранный префикс. setRangeText историю не пополняет (в Chrome ещё и
       сбрасывает её), поэтому после принятия подсказки Ctrl+Z молчал. */
    const doc = ta.ownerDocument || document;
    if (doc.activeElement !== ta) ta.focus();
    ta.setSelectionRange(start, end);
    const accepted = typeof doc.execCommand === 'function'
      ? doc.execCommand('insertText', false, prepared.text)
      : false;

    /* execCommand устарел и в некоторых окружениях (headless, чужой iframe)
       молча ничего не делает — подстановка обязана появиться в любом случае.
       Но при совпадении вставляемого текста с заменяемым значение не меняется
       законно, поэтому «не изменилось» само по себе — не признак отказа. */
    if (!accepted || (ta.value === before && replaced !== prepared.text)) {
      ta.setRangeText(prepared.text, start, end, 'end');
    }

    if (prepared.cursor != null) {
      const cursor = start + prepared.cursor;
      ta.setSelectionRange(cursor, cursor);
    } else if (finish !== ta.selectionStart) {
      ta.setSelectionRange(finish, finish);
    }

    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Контракт вставки: `$0` — место каретки, переводы строк получают отступ
   * текущей строки. Шаблоны в словарях описывают только относительный
   * отступ, поэтому вложенность не зависит от того, где стоит ключ.
   */
  prepareInsert(raw, variant = null, start = null) {
    const ta = this.textarea;
    const offset = start == null ? ta.selectionStart : start;
    const lineStart = ta.value.lastIndexOf('\n', offset - 1) + 1;

    let lineIndent = 0;
    while (lineStart + lineIndent < ta.value.length) {
      const ch = ta.value[lineStart + lineIndent];
      if (ch !== ' ' && ch !== '\t') break;
      lineIndent++;
    }

    // Соседняя строка на уровень выше: убираем лишние пробелы не только
    // у следующих строк шаблона, но и перед самим курсором. Иначе `:` так и
    // останется в отступе свойств, а не строки.
    let dedentChars = 0;
    if (variant?.dedent) {
      const cursorCol = Math.max(0, offset - lineStart);
      dedentChars = Math.min(variant.dedent * 2, cursorCol);
      for (let i = offset - dedentChars; i < offset; i++) {
        if (ta.value[i] !== ' ' && ta.value[i] !== '\t') {
          dedentChars = 0;
          break;
        }
      }
    }

    const adjustedStart = Math.max(lineStart, offset - dedentChars);
    const baseIndent = ta.value.slice(
      lineStart, lineStart + Math.max(0, lineIndent - dedentChars));

    const lines = String(raw).split('\n');
    let text = '';
    let cursor = null;

    lines.forEach((line, index) => {
      if (index > 0) text += '\n' + baseIndent;

      const marker = line.indexOf('$0');
      if (marker >= 0) {
        cursor = text.length + marker;
        line = line.slice(0, marker) + line.slice(marker + 2);
      }

      text += line;
    });

    return { text, cursor, start: adjustedStart };
  }


  handleKey(e) {
    if (!this.isOpen()) return false;

    // Alt/Ctrl/Cmd — это шорткаты редактора (Alt, Ctrl+Space и т.п.).
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    if (this.state === 'hint') {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
        return true;
      }
      return false;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        this.hide();
        return false;
      }
      if (this.textarea.selectionStart !== this.textarea.selectionEnd) {
        this.hide();
        return false;
      }
      e.preventDefault();
      this.apply();
      return true;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.moveUp();
        return true;
      case 'ArrowDown':
        e.preventDefault();
        this.moveDown();
        return true;
      case 'Escape':
        e.preventDefault();
        this.hide();
        return true;
    }

    return false;
  }
}

