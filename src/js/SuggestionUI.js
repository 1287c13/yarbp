const CHAR_WIDTH  = 7.3;
const LINE_HEIGHT = 18;
const INIT_HEIGHT = 35;
const INIT_WIDTH = 0;

export class SuggestionUI {
  constructor(textarea, container) {
    this.textarea = textarea;
    this.container = container;

    this.root = document.createElement('div');
    this.root.className = 'suggestion-popup';
    this.root.hidden = true;

    this.list = document.createElement('ul');
    this.list.className = 'suggestion-list';

    this.blockDocBox = document.createElement('div');
    this.blockDocBox.className = 'suggestion-block-doc';

    this.itemDocBox = document.createElement('div');
    this.itemDocBox.className = 'suggestion-item-doc';

    this.hintBox = document.createElement('div');
    this.hintBox.className = 'suggestion-hint';
    this.hintBox.hidden = true;

    this.root.appendChild(this.list);
    this.root.appendChild(this.blockDocBox);
    this.root.appendChild(this.itemDocBox);
    this.root.appendChild(this.hintBox);
    container.appendChild(this.root);

    this.activeIndex = 0;
    this.current = null;
    this.isHintMode = false;

    this.list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      this.activeIndex = Number(li.dataset.index);
      this.apply();
    });
  }

  isOpen() {
    return !this.root.hidden;
  }

  show({ suggestions, blockDoc, replaceFrom, hint }) {
    if ((!suggestions || !suggestions.length) && hint) {
      this.current = null;
      this.isHintMode = true;
      this.root.classList.add('hint-mode');
      this.renderHint(hint);
      this.position();
      this.root.hidden = false;
      return;
    }

    if (!suggestions || !suggestions.length) {
      this.hide();
      return;
    }

    this.isHintMode = false;
    this.root.classList.remove('hint-mode');
    this.current = { suggestions, blockDoc, replaceFrom };
    this.activeIndex = 0;

    this.renderList();
    this.renderDoc();
    this.renderHint(null);
    this.position();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.root.classList.remove('hint-mode');
    this.current = null;
    this.isHintMode = false;
  }

  refresh() {
    if (!this.isOpen()) return;
    this.position();
  }

  renderList() {
    this.list.innerHTML = '';
    this.list.hidden = false;
    if (!this.current) return;
    this.current.suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      li.dataset.index = i;
      if (i === this.activeIndex) li.classList.add('active');
      this.list.appendChild(li);
    });
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
    if (!text) {
      this.hintBox.hidden = true;
      this.hintBox.textContent = '';
      return;
    }
    this.hintBox.textContent = text;
    this.hintBox.hidden = false;
    this.list.hidden = true;
    this.blockDocBox.hidden = true;
    this.itemDocBox.hidden = true;
  }

  position() {
    const offset = this.textarea.selectionStart;
    const before = this.textarea.value.slice(0, offset);
    const lines  = before.split('\n');
    const col    = lines[lines.length - 1].length;
    const row    = lines.length - 1;

    const taRect = this.textarea.getBoundingClientRect();
    const cRect  = this.container.getBoundingClientRect();

    const baseLeft = taRect.left - cRect.left;
    const baseTop  = taRect.top  - cRect.top;

    const x = baseLeft + INIT_WIDTH + col * CHAR_WIDTH;
    const y = baseTop  + INIT_HEIGHT + row * LINE_HEIGHT - this.textarea.scrollTop;

    this.root.style.left = `${x}px`;
    this.root.style.top  = `${y}px`;
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
    const end = ta.selectionStart;

    // replaceFrom может быть устаревшим (update вызван по дебаунсу).
    // Не даём ему уехать правее курсора.
    let start = this.current.replaceFrom ?? end;
    if (start > end) start = end;

    ta.setRangeText(s.insert, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    this.hide();
  }

  handleKey(e) {
    if (!this.isOpen()) return false;
    if (this.isHintMode) {
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); return true; }
      return false;
    }
    switch (e.key) {
      case 'ArrowUp':   e.preventDefault(); this.moveUp();   return true;
      case 'ArrowDown': e.preventDefault(); this.moveDown(); return true;
      case 'Tab':       e.preventDefault(); this.apply();    return true;
      case 'Escape':    e.preventDefault(); this.hide();     return true;
    }
    return false;
  }
}