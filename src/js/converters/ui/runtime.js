/**
 * View-model и runtime UI-макета.
 *
 * `UIGenerator` остаётся сборщиком разметки из AST. Здесь живут состояние и
 * действия формы: табы, очистка, переносы `.источник` → `.приемник`,
 * проверки и диалоги. Модуль намеренно не импортирует ничего: его исходник
 * можно встроить в standalone-выгрузку без сборщика.
 */

export class UIViewModel {
  constructor() {
    this.activeTab = null;
    this.fields = Object.create(null);
    this.lists = Object.create(null);
    this.tables = Object.create(null);
  }

  setField(name, value) {
    if (name) this.fields[name] = value;
  }

  getField(name) {
    return this.fields[name];
  }

  setActiveTab(target) {
    this.activeTab = target || null;
  }

  addListItem(listId, item) {
    if (!listId) return;
    if (!this.lists[listId]) this.lists[listId] = [];
    this.lists[listId].push(item);
  }

  setTableRows(tableId, rows) {
    if (tableId) this.tables[tableId] = rows;
  }

  snapshot() {
    return {
      activeTab: this.activeTab,
      fields: Object.assign({}, this.fields),
      lists: Object.assign({}, this.lists),
      tables: Object.assign({}, this.tables),
    };
  }
}

export class UIRuntime {
  constructor(root = document, viewModel = new UIViewModel()) {
    this.root = root;
    this.viewModel = viewModel;
    this.mounted = false;
    this.dialog = null;
    this.returnFocus = null;
    this.handlers = Object.create(null);
    this.handlersRequested = false;
    this._onClick = this._onClick.bind(this);
    this._onInput = this._onInput.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onSubmit = this._onSubmit.bind(this);
  }

  mount() {
    if (this.mounted) return this;
    this.root.addEventListener('click', this._onClick);
    this.root.addEventListener('input', this._onInput);
    this.root.addEventListener('change', this._onChange);
    this.root.addEventListener('submit', this._onSubmit);
    document.addEventListener('keydown', this._onKeydown);
    this._syncModel();
    this.syncConditionals();
    // `.код`-обработчики: сначала подписка (разметка уже в DOM), потом код.
    this.bindHandlers();
    this.loadHandlers();
    this.mounted = true;
    return this;
  }

  destroy() {
    if (!this.mounted) return;
    this.root.removeEventListener('click', this._onClick);
    this.root.removeEventListener('input', this._onInput);
    this.root.removeEventListener('change', this._onChange);
    this.root.removeEventListener('submit', this._onSubmit);
    document.removeEventListener('keydown', this._onKeydown);
    this.closeDialog();
    this.mounted = false;
  }

  targetId(raw) {
    const text = String(raw || '').trim().replace(/^#/, '').replace(/\s+/g, ' ');
    const parts = text.split(/[.\s]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  /** Ссылка `.навигация #табы.таб` → массив сегментов без `#`. */
  refParts(raw) {
    return String(raw === undefined || raw === null ? '' : raw)
      .replace(/#/g, ' ')
      .split(/[.\s]+/)
      .filter(Boolean);
  }

  /** Совпадает ли путь элемента с хвостом ссылки (`добавить.количество`). */
  pathMatches(elementPath, parts) {
    if (!elementPath || !parts.length) return false;
    const own = String(elementPath).split('.');
    if (parts.length > own.length) return false;
    const tail = own.slice(own.length - parts.length);
    return tail.every((segment, index) => segment === parts[index]);
  }

  /** Поиск по ссылке: сначала хвост пути, потом id/имя. */
  findByRef(selector, raw, attrs) {
    const parts = this.refParts(raw);
    if (!parts.length) return null;
    const elements = Array.from(this.root.querySelectorAll(selector));
    const byPath = elements.find(el => this.pathMatches(el.dataset.elementPath, parts));
    if (byPath) return byPath;
    const last = parts[parts.length - 1];
    for (let i = 0; i < attrs.length; i += 1) {
      const found = elements.find(el => el.getAttribute(attrs[i]) === last);
      if (found) return found;
    }
    return null;
  }

  findTab(raw) {
    return this.findByRef('.tab-panel, .tabs', raw,
      ['data-tab-id', 'data-tabs-id', 'id']);
  }

  findField(raw) {
    return this.findByRef('input, select, textarea', raw,
      ['name', 'id', 'data-field']);
  }

  activateTab(tabs, target) {
    if (!tabs || !target) return;
    tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabTarget === target);
    });
    tabs.querySelectorAll('.tab-panel').forEach(panel => {
      panel.style.display = '';
      panel.classList.toggle('active', panel.dataset.tabPanel === target);
    });
    this.viewModel.setActiveTab(target);
  }

  activateTarget(raw) {
    const tab = this.findTab(raw);
    if (!tab) return false;
    const tabs = tab.closest('.tabs');
    if (tabs && tab.dataset.tabPanel) {
      this.activateTab(tabs, tab.dataset.tabPanel);
      return true;
    }
    return false;
  }

  showDialog(message, okLabel) {
    if (!message) return null;
    this.closeDialog();

    const backdrop = document.createElement('div');
    backdrop.className = 'ui-dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'ui-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const text = document.createElement('p');
    text.textContent = message;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = okLabel || 'Ок';
    box.appendChild(text);
    box.appendChild(ok);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this.dialog = backdrop;
    this.returnFocus = document.activeElement;
    const close = () => this.closeDialog();
    ok.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    ok.focus();
    return backdrop;
  }

  closeDialog() {
    if (!this.dialog) return;
    this.dialog.remove();
    this.dialog = null;
    if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus();
    this.returnFocus = null;
  }

  checkAction(button) {
    const refs = String(button.dataset.check || '').split(/\s+/).filter(Boolean);
    if (!refs.length) {
      if (button.dataset.dialog) {
        this.showDialog(button.dataset.dialog, button.dataset.dialogOk);
      }
      return true;
    }

    const type = button.dataset.checkType || 'пусто';
    const failed = refs.some(ref => {
      const field = this.findField(ref);
      if (!field) return true;
      const value = field.value === undefined || field.value === null ? '' : field.value;
      const empty = String(value).trim() === '';
      return type === 'пусто' ? empty : false;
    });
    if (!failed) return true;
    if (button.dataset.dialog) {
      this.showDialog(button.dataset.dialog, button.dataset.dialogOk);
    }
    return button.dataset.checkGoal !== 'запретить';
  }

  transfer(button) {
    const source = this.findTab(button.dataset.source);
    const target = this.findTab(button.dataset.target);
    if (!source || !target) return;

    const values = this.readControls(source);
    if (!values.length) return;

    const list = this.ensureList(target);
    list.appendChild(this.itemNode(values));

    const targetId = target.dataset.tabId || this.targetId(button.dataset.target);
    this.viewModel.addListItem(targetId, values);

    this.clearControls(source);
    this.activateTarget(button.dataset.target);
  }

  /** Значения полей панели: пропускаем невыбранные переключатели. */
  readControls(scope) {
    const values = [];
    scope.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.type === 'radio' && !field.checked) return;
      if (field.type === 'checkbox') {
        values.push({
          label: this.labelOf(field),
          value: field.checked ? field.value || 'да' : '',
        });
        return;
      }
      values.push({ label: this.labelOf(field), value: field.value || '' });
    });
    return values.filter(entry => String(entry.value || '').trim() !== '');
  }

  /** Подпись поля: текст `label` группы или имя поля. */
  labelOf(field) {
    const group = field.closest('.input-group, .checkbox-group, .radio-group');
    const label = group && group.querySelector('label, .field-label');
    const text = label ? label.textContent.trim() : '';
    return text || field.dataset.field || field.name || '';
  }

  /** Строка списка: подпись и значение — отдельными узлами. */
  itemNode(values) {
    const item = document.createElement('div');
    item.className = 'list-item';
    values.forEach(entry => {
      if (entry.label) {
        const label = document.createElement('span');
        label.className = 'item-label';
        label.textContent = entry.label;
        item.appendChild(label);
      }
      const value = document.createElement('span');
      value.className = 'item-value';
      value.textContent = String(entry.value === undefined ? '' : entry.value);
      item.appendChild(value);
    });
    return item;
  }

  ensureList(scope) {
    let list = scope.querySelector('.items-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'items-list';
      scope.appendChild(list);
    }
    return list;
  }

  /** После переноса поля источника пустеют, переключатели сбрасываются. */
  clearControls(scope) {
    scope.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.tagName === 'SELECT') field.selectedIndex = -1;
      else if (field.type === 'checkbox' || field.type === 'radio') field.checked = false;
      else field.value = '';
      this.viewModel.setField(field.name, field.value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    this.syncConditionals();
  }

  clearField(button) {
    const row = button.closest('.field-row');
    const field = (row && row.querySelector('input, select'))
      || (button.dataset && button.dataset.clear
        ? this.root.querySelector('#' + CSS.escape(button.dataset.clear))
        : null);
    if (!field) return;
    if (field.tagName === 'SELECT') field.selectedIndex = -1;
    else field.value = '';
    this.viewModel.setField(field.name, field.value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.focus();
  }

  removeItem(button) {
    const item = button.closest('.repeatable-item');
    if (item) item.remove();
  }

  /**
   * `+ Добавить ещё`: клон последней записи формы добавления. Значения
   * очищаются, id/name получают новый индекс, заголовок — новый номер.
   */
  addCopy(button) {
    const view = button.closest('.form-view') || button.closest('.fieldset-card');
    const list = view && view.querySelector('[id$="-form-list"]');
    if (!list) return;
    const items = Array.from(list.querySelectorAll('.repeatable-item'));
    const last = items[items.length - 1];
    if (!last) return;

    const index = items.length;
    const clone = last.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.id) field.id = field.id.replace(/-\d+$/, '') + '-' + index;
      if (field.name) field.name = field.name.replace(/\[\d+\]/, '[' + index + ']');
      if (field.tagName === 'SELECT') field.selectedIndex = 0;
      else if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = field.defaultChecked;
      } else {
        field.value = '';
      }
      delete field.dataset.invalid;
    });
    clone.querySelectorAll('label[for]').forEach(label => {
      label.setAttribute('for', label.getAttribute('for').replace(/-\d+$/, '') + '-' + index);
    });

    const header = clone.querySelector('.repeatable-header span');
    if (header) {
      header.textContent = header.textContent.replace(/\d+$/, String(index + 1));
    }

    list.appendChild(clone);
    const first = clone.querySelector('input, select');
    if (first) first.focus();
  }

  /** Строки таблицы без служебных элементов. */
  tableRows(wrap) {
    return wrap ? Array.from(wrap.querySelectorAll('tbody tr')) : [];
  }

  /** Склонение «1 запись / 2 записи / 5 записей» для счётчика. */
  recordWord(count) {
    const value = Math.abs(count) % 100;
    const tail = value % 10;
    if (value > 10 && value < 20) return 'записей';
    if (tail === 1) return 'запись';
    if (tail >= 2 && tail <= 4) return 'записи';
    return 'записей';
  }

  /**
   * Служебное оформление таблицы: номера строк, счётчик и пустое состояние.
   * Вызывается после любого изменения состава строк.
   */
  updateTableChrome(wrap) {
    if (!wrap) return;
    const rows = this.tableRows(wrap);
    rows.forEach((row, index) => {
      const cell = row.querySelector('td.ui-table-index');
      const label = String(index + 1);
      if (cell && cell.textContent !== label) cell.textContent = label;
    });
    const count = wrap.querySelector('.ui-table-count');
    if (count) {
      const text = rows.length + ' ' + this.recordWord(rows.length);
      if (count.textContent !== text) count.textContent = text;
    }
    const empty = wrap.querySelector('.ui-table-empty');
    if (empty && empty.hidden !== (rows.length > 0)) {
      empty.hidden = rows.length > 0;
    }
    const isEmpty = rows.length === 0;
    if (wrap.classList.contains('is-empty') !== isEmpty) {
      wrap.classList.toggle('is-empty', isEmpty);
    }
  }

  /** Новая строка начинается с пустых значений, а не с шаблона колонки. */
  resetTableControls(row) {
    row.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.tagName === 'SELECT') field.selectedIndex = 0;
      else if (field.type === 'checkbox' || field.type === 'radio') field.checked = false;
      else field.value = '';
      if (field.dataset && field.dataset.mask) this.applyMask(field);
    });
  }

  /**
   * `+ Добавить запись`: клон шаблонной строки в конец tbody.
   * `focusColumn` — индекс ячейки, на которую вернуть фокус (Enter в таблице).
   */
  addTableRow(button, focusColumn = null) {
    const wrap = button && button.closest ? button.closest('[data-ui-table]') : null;
    if (!wrap) return null;
    const template = wrap.querySelector('.ui-table-row-template');
    const body = wrap.querySelector('tbody');
    if (!template || !body) return null;

    const row = template.content.firstElementChild.cloneNode(true);
    this.resetTableControls(row);
    body.appendChild(row);
    this.syncTable(wrap);

    const cells = Array.from(row.children);
    const targetCell = focusColumn !== null && focusColumn !== undefined
      ? cells[focusColumn]
      : null;
    const target = (targetCell && targetCell.querySelector(
      'input:not([type="hidden"]), select, textarea')) ||
      row.querySelector('input:not([type="hidden"]), select, textarea');
    if (target) {
      target.focus();
      if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
    return row;
  }

  removeTableRow(button) {
    const wrap = button && button.closest ? button.closest('[data-ui-table]') : null;
    const row = button && button.closest ? button.closest('tr') : null;
    if (!wrap || !row) return;

    const column = Array.from(row.children).indexOf(button.closest('td'));
    const rows = this.tableRows(wrap);
    const index = rows.indexOf(row);
    row.remove();
    this.syncTable(wrap);

    const remaining = this.tableRows(wrap);
    if (!remaining.length) {
      const add = wrap.querySelector('.add-table-row');
      if (add) add.focus();
      return;
    }

    // Фокус остаётся в той же колонке, но уже следующей (или предыдущей) строки.
    const next = remaining[Math.min(index, remaining.length - 1)];
    const cell = next.children[column];
    const target = cell && cell.querySelector(
      'input:not([type="hidden"]), select, textarea, button');
    if (target) target.focus();
  }

  syncTable(wrap) {
    if (!wrap) return;
    const tableId = wrap.dataset.uiTable;
    const rows = this.tableRows(wrap).map(row => {
      const values = {};
      row.querySelectorAll('input, select, textarea').forEach(field => {
        const name = field.dataset.field || field.name;
        if (!name) return;
        values[name] = this.fieldValue(field);
      });
      return values;
    });
    this.viewModel.setTableRows(tableId, rows);
    this.updateTableChrome(wrap);
  }

  showForm(button) {
    const card = button.closest('.fieldset-card');
    const tabs = card && card.querySelector('.tabs');
    const formPanel = card && card.querySelector('.form-view');
    if (tabs && formPanel) {
      this.activateTab(tabs, formPanel.dataset.tabPanel);
      return;
    }
    if (!card) return;
    const list = card.querySelector('.list-view');
    const form = card.querySelector('.form-view');
    if (list) list.style.display = 'none';
    if (form) form.style.display = 'block';
  }

  backToList(button) {
    const card = button.closest('.fieldset-card');
    const tabs = card && card.querySelector('.tabs');
    const listPanel = card && card.querySelector('.list-view');
    if (tabs && listPanel) {
      this.activateTab(tabs, listPanel.dataset.tabPanel);
      return;
    }
    if (!card) return;
    const list = card.querySelector('.list-view');
    const form = card.querySelector('.form-view');
    if (list) list.style.display = 'block';
    if (form) form.style.display = 'none';
  }

  submitItem(button) {
    const scope = button.closest('.fieldset-card') || button.closest('.tabs');
    if (!scope) return;
    const formView = scope.querySelector('.form-view') || scope;
    const itemsList = scope.querySelector('.items-list');
    if (!formView || !itemsList) return;

    const invalid = Array.from(formView.querySelectorAll('input, select, textarea'))
      .find(field => typeof field.checkValidity === 'function' && !field.checkValidity());
    if (invalid) {
      if (typeof invalid.reportValidity === 'function') invalid.reportValidity();
      return;
    }

    const data = this.readControls(formView);
    if (!data.length) return;
    itemsList.appendChild(this.itemNode(data));

    const panel = itemsList.closest('[data-tab-id]');
    this.viewModel.addListItem(panel ? panel.dataset.tabId : 'list', data);

    this.clearControls(formView);
    formView.querySelectorAll('select').forEach(field => {
      if (field.selectedIndex < 0 && field.options.length) field.selectedIndex = 0;
    });

    const listPanel = scope.querySelector('.list-view');
    const tabs = scope.querySelector('.tabs');
    if (tabs && listPanel) {
      this.activateTab(tabs, listPanel.dataset.tabPanel);
    } else if (listPanel) {
      listPanel.style.display = 'block';
      formView.style.display = 'none';
    }
  }

  /** Перечитать DOM после внешнего восстановления значений. */
  syncFromDOM() {
    this._syncModel();
  }

  /** Сериализуемое состояние формы. */
  getState() {
    this._syncModel();
    return this.viewModel.snapshot();
  }

  /**
   * Восстановить поля, активный таб, списки и таблицы из снимка. Снимок
   * приходит из getState() или UIViewModel.snapshot().
   */
  restore(state) {
    if (!state) return this;
    this.viewModel = new UIViewModel();
    this.viewModel.activeTab = state.activeTab || null;
    Object.keys(state.fields || {}).forEach(name => {
      this.viewModel.setField(name, state.fields[name]);
    });
    Object.keys(state.lists || {}).forEach(id => {
      this.viewModel.lists[id] = state.lists[id];
    });
    Object.keys(state.tables || {}).forEach(id => {
      this.viewModel.tables[id] = state.tables[id];
    });

    this._applyFields();
    this._restoreTables();
    this._restoreLists();
    this._applyActiveTab();
    return this;
  }

  _applyFields() {
    this.root.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.closest('[data-ui-table]')) return;
      const value = this.viewModel.getField(field.name);
      if (value === undefined) return;
      if (field.type === 'checkbox') field.checked = !!value && value !== 'нет';
      else if (field.type === 'radio') field.checked = String(field.value) === String(value);
      else field.value = value;
    });
    this.syncConditionals();
  }

  _restoreTables() {
    this.root.querySelectorAll('[data-ui-table]').forEach(wrap => {
      const rows = this.viewModel.tables[wrap.dataset.uiTable];
      if (!Array.isArray(rows)) return;
      const body = wrap.querySelector('tbody');
      const template = wrap.querySelector('.ui-table-row-template');
      if (!body || !template) return;
      while (body.firstChild) body.removeChild(body.firstChild);
      rows.forEach(values => {
        const row = template.content.firstElementChild.cloneNode(true);
        row.querySelectorAll('input, select, textarea').forEach(field => {
          const key = field.dataset.field || field.name;
          const value = values[key];
          if (value === undefined) return;
          if (field.type === 'checkbox') field.checked = this.isTruthyValue(value);
          else if (field.tagName === 'SELECT') field.value = String(value);
          else field.value = value;
        });
        body.appendChild(row);
      });
      this.updateTableChrome(wrap);
    });
  }

  /** Значение из снимка состояния для флажка. */
  isTruthyValue(value) {
    const text = String(value === undefined || value === null ? '' : value)
      .trim().toLowerCase();
    return value === true || text === 'да' || text === '1' ||
      text === 'true' || text === 'on';
  }

  _restoreLists() {
    this.root.querySelectorAll('.items-list').forEach(list => {
      const panel = list.closest('[data-tab-id]');
      const id = panel ? panel.dataset.tabId : list.id;
      const rows = this.viewModel.lists[id];
      if (!Array.isArray(rows)) return;
      while (list.firstChild) list.removeChild(list.firstChild);
      rows.forEach(entry => {
        const values = Array.isArray(entry) ? entry : [entry];
        list.appendChild(this.itemNode(values.map(data => ({
          label: data && data.label ? data.label : '',
          value: data && data.value !== undefined ? data.value : String(data || ''),
        }))));
      });
    });
  }

  _applyActiveTab() {
    if (!this.viewModel.activeTab) return;
    const button = Array.from(this.root.querySelectorAll('.tab-btn'))
      .find(el => el.dataset.tabTarget === this.viewModel.activeTab);
    if (button) this.activateTab(button.closest('.tabs'), button.dataset.tabTarget);
  }

  _syncModel() {
    this.root.querySelectorAll('input, select, textarea').forEach(field => {
      // Поля таблицы живут строками в `tables`, а не в общем словаре полей.
      if (field.closest('[data-ui-table]')) return;
      this.viewModel.setField(field.name, this.fieldValue(field));
    });
    this.root.querySelectorAll('[data-ui-table]').forEach(wrap => this.syncTable(wrap));
    this._syncListsFromDOM();
    const active = this.root.querySelector('.tab-btn.active');
    if (active) this.viewModel.setActiveTab(active.dataset.tabTarget);
  }

  _syncListsFromDOM() {
    this.root.querySelectorAll('.items-list').forEach(list => {
      const panel = list.closest('[data-tab-id]');
      const id = panel ? panel.dataset.tabId : list.id;
      if (this.viewModel.lists[id]) return;
      this.viewModel.lists[id] = Array.from(list.querySelectorAll('.list-item'))
        .map(item => ({ label: '', value: item.textContent.trim() }));
    });
  }

  _onInput(event) {
    const field = event.target;
    if (!field || !field.matches || !field.matches('input, select, textarea')) return;
    this.applyMask(field);
    const table = field.closest('[data-ui-table]');
    if (table) this.syncTable(table);
    else this.viewModel.setField(field.name, this.fieldValue(field));
    if (field.dataset && field.dataset.invalid) {
      if (!this.fieldError(field)) {
        delete field.dataset.invalid;
        field.classList.remove('field-invalid');
      }
    }
  }

  _onChange(event) {
    const field = event.target;
    if (!field || !field.matches || !field.matches('input, select, textarea')) return;
    const table = field.closest('[data-ui-table]');
    if (table) this.syncTable(table);
    else this.viewModel.setField(field.name, this.fieldValue(field));
    this.syncConditionals();
  }

  /** Значение поля в view-model: у флага это `да`/пусто, у радио — выбор. */
  fieldValue(field) {
    if (field.type === 'checkbox') return field.checked ? (field.value || 'да') : '';
    if (field.type === 'radio') return field.checked ? field.value : '';
    return field.value;
  }

  /* --------------------------- маски и проверки ----------------------- */

  /** Маска ввода по `data-mask`: телефон, число, штрихкод, почта. */
  applyMask(field) {
    const mask = field.dataset ? (field.dataset.mask || '') : '';
    if (!mask) return field.value;

    if (mask === 'tel') {
      const digits = field.value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11);
      field.value = this.formatPhone(digits);
      return field.value;
    }
    if (mask === 'barcode') {
      field.value = field.value.replace(/[^\dA-Za-zА-Яа-я\-_]/g, '').slice(0, 64);
      return field.value;
    }
    if (mask === 'integer' || mask === 'number') {
      const negative = field.value.trim().startsWith('-');
      const allowed = mask === 'integer' ? /[^\d]/g : /[^\d.,]/g;
      let body = field.value.replace(allowed, '');
      if (mask === 'number') body = body.replace(/,/g, '.');
      field.value = (negative ? '-' : '') + body;
      return field.value;
    }
    if (mask === 'email') {
      field.value = field.value.replace(/\s/g, '');
      return field.value;
    }
    return field.value;
  }

  /** `+7 (999) 123-45-67` из цифр — формат набирается по мере ввода. */
  formatPhone(digits) {
    if (!digits) return '';
    const rest = digits.startsWith('7') ? digits.slice(1) : digits;
    if (!rest) return '+7';
    let out = '+7 (' + rest.slice(0, 3);
    if (rest.length <= 3) return out;
    out += ') ' + rest.slice(3, 6);
    if (rest.length <= 6) return out;
    out += '-' + rest.slice(6, 8);
    if (rest.length <= 8) return out;
    return out + '-' + rest.slice(8, 10);
  }

  /** Текст ошибки поля; пустая строка — значение корректно. */
  fieldError(field) {
    const required = field.hasAttribute('required');
    const value = field.type === 'checkbox'
      ? (field.checked ? 'да' : '')
      : String(field.value || '').trim();
    if (required && !value) return 'поле обязательно';
    if (!value) return '';

    const mask = field.dataset ? (field.dataset.mask || '') : '';
    if (mask === 'tel' && field.value.replace(/\D/g, '').length !== 11) {
      return 'телефон в формате +7 (999) 123-45-67';
    }
    if (mask === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return 'почта вида foo@bar.com';
    }
    if (mask === 'integer' && !/^-?\d+$/.test(value)) return 'целое число';
    if (mask === 'number' && !/^-?\d+([.,]\d+)?$/.test(value)) return 'число';
    return '';
  }

  /** Проверка формы: подсвечивает поля и отдаёт первый невалидный элемент. */
  validateForm(form) {
    const scope = form || this.root;
    let first = null;

    scope.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.type === 'radio' || field.type === 'checkbox') return;
      const error = this.fieldError(field);
      field.classList.toggle('field-invalid', !!error);
      if (error) {
        field.dataset.invalid = error;
        if (!first) first = field;
      } else {
        delete field.dataset.invalid;
      }
    });

    const seen = Object.create(null);
    scope.querySelectorAll('input[type="radio"][required]').forEach(radio => {
      if (seen[radio.name]) return;
      seen[radio.name] = true;
      const chosen = scope.querySelector(
        'input[type="radio"][name="' + radio.name + '"]:checked');
      if (!chosen && !first) first = radio;
    });

    return first;
  }

  /** Подпись поля для сообщения: `<label for>` или имя поля. */
  fieldCaption(field) {
    const label = field.id ? this.root.querySelector('label[for="' + field.id + '"]') : null;
    const text = label ? label.textContent.trim() : '';
    return text || field.getAttribute('name') || 'поле';
  }

  /* --------------------------- код-обработчики ------------------------ */

  /** Общий реестр обработчиков страницы: переживает перерисовку формы. */
  handlerRegistry() {
    if (typeof window === 'undefined') return this.handlers;
    if (!window.__yarbpUIHandlers) window.__yarbpUIHandlers = Object.create(null);
    this.handlers = window.__yarbpUIHandlers;
    return this.handlers;
  }

  /** Подписка на события элементов с `data-handler`: разметка — только данные. */
  bindHandlers() {
    if (!this.root.querySelectorAll) return;
    this.root.querySelectorAll('[data-handler]').forEach(element => {
      const id = element.getAttribute('data-handler');
      const event = element.getAttribute('data-handler-event') || 'click';
      if (!id || !event || event === 'load') return;
      element.addEventListener(event, handlerEvent =>
        this.runHandler(id, element, handlerEvent));
    });
  }

  /**
   * Прочитать `.код`-обработчики из разметки и собрать их в реестр.
   *
   * Код пришёл из документа, а не из исходников приложения, поэтому он
   * исполняется отдельным blob-скриптом: CSP редактора запрещает и inline-
   * скрипты, и `new Function`. В выгрузке (`HTMLExporter`) тот же код
   * вставляется inline с nonce — тогда реестр заполнен до монтирования и
   * blob не нужен. Если политика блокирует и blob, форма просто остаётся
   * без `.код`: предпросмотр не ломается.
   */
  loadHandlers() {
    if (this.handlersRequested) return;
    this.handlersRequested = true;

    const payload = this.root.querySelector
      ? this.root.querySelector('script.yarbp-handlers')
      : null;
    if (!payload) return;

    let bag = null;
    try {
      bag = JSON.parse(payload.textContent || '{}');
    } catch (error) {
      console.warn('[UIRuntime] данные обработчиков .код испорчены:', error);
      return;
    }

    const registry = this.handlerRegistry();
    const missing = Object.keys(bag || {}).filter(id => {
      const code = bag[id] && typeof bag[id].code === 'string' ? bag[id].code.trim() : '';
      return !!code && typeof registry[id] !== 'function';
    });
    if (!missing.length) {
      // Код уже объявлен страницей (выгрузка вставляет его с nonce): остаётся
      // выполнить `.событие загрузка`, как и после загрузки blob-скрипта.
      this.runLoadHandlers();
      return;
    }

    const body = missing.map(id =>
      'target[' + JSON.stringify(id) + '] = function (event, runtime, form) {\n' +
      bag[id].code + '\n};').join('\n');
    const source = '(function (target) {\n' + body +
      '\n})(window.__yarbpUIHandlers = window.__yarbpUIHandlers || {});';

    let url = '';
    try {
      url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    } catch (error) {
      console.warn('[UIRuntime] не удалось собрать обработчики .код:', error);
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      URL.revokeObjectURL(url);
      this.runLoadHandlers();
    };
    script.onerror = () => {
      URL.revokeObjectURL(url);
      console.info('[UIRuntime] политика страницы запрещает выполнение .код ' +
        'в предпросмотре — код работает в скачанной HTML-странице формы');
    };
    const host = document.head || document.body || document.documentElement;
    if (host) host.appendChild(script);
  }

  /** Событие `load`: обработчики сразу после того, как код готов. */
  runLoadHandlers() {
    if (!this.root.querySelectorAll) return;
    this.root.querySelectorAll('[data-handler]').forEach(element => {
      if ((element.getAttribute('data-handler-event') || '') !== 'load') return;
      this.runHandler(element.getAttribute('data-handler'), element, null);
    });
  }

  /**
   * Вызвать обработчик `.код`: `function (event, runtime, form)`.
   * `this` внутри — сам элемент, ошибки обработчика форму не ломают.
   */
  runHandler(id, element, event) {
    const registry = this.handlerRegistry();
    const handler = id && registry ? registry[id] : null;
    if (typeof handler !== 'function') return false;
    const form = element && element.closest
      ? (element.closest('form') || this.root)
      : this.root;
    try {
      handler.call(element, event, this, form);
      return true;
    } catch (error) {
      console.error('[UIRuntime] обработчик «' + id + '» упал:', error);
      return false;
    }
  }

  /** Значение поля по имени — короткий доступ для кода `.код`. */
  value(name) {
    const field = this.findField(name);
    if (field) return this.fieldValue(field);
    return this.viewModel.getField(name);
  }

  /**
   * Проставить значение поля так же, как это сделал бы пользователь:
   * модель, `.dynamic-block` и таблица обновляются теми же событиями.
   */
  setValue(name, value) {
    const field = this.findField(name);
    const text = value === undefined || value === null ? '' : String(value);
    if (!field) {
      this.viewModel.setField(name, text);
      return null;
    }

    if (field.type === 'checkbox') {
      field.checked = !(value === false || value === undefined || value === null ||
        text === '' || text === '0' || text.toLowerCase() === 'нет');
      this.viewModel.setField(field.name, this.fieldValue(field));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return field;
    }

    if (field.type === 'radio') {
      const group = Array.from(this.root.querySelectorAll('input[type="radio"]'))
        .filter(radio => radio.name === field.name);
      group.forEach(radio => {
        radio.checked = radio.value === text;
        if (radio.checked) this.viewModel.setField(radio.name, radio.value);
      });
      this.syncConditionals();
      return field;
    }

    const changed = field.value !== text;
    field.value = text;
    this.viewModel.setField(field.name, text);
    if (changed) {
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return field;
  }

  /** Блоки `.dynamic-block` показываем по выбранному значению переключателя. */
  syncConditionals() {
    if (!this.root.querySelectorAll) return;
    const scope = this.root;
    scope.querySelectorAll('.dynamic-block').forEach(block => {
      const name = block.dataset.showName;
      if (!name) return;
      const value = block.dataset.showValue || '';
      const chosen = Array.from(scope.querySelectorAll('input, select'))
        .filter(field => field.name === name)
        .map(field => (field.type === 'radio' || field.type === 'checkbox')
          ? (field.checked ? field.value : '')
          : field.value)
        .filter(Boolean);
      block.classList.toggle('is-visible', chosen.indexOf(value) >= 0);
    });
  }

  /** Отправка формы: сначала проверка, потом данные наружу — без перезагрузки. */
  _onSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();

    const form = (event && event.target && event.target.closest
      ? event.target.closest('form')
      : null) || this.root;
    const invalid = this.validateForm(form);
    if (invalid) {
      if (invalid.focus) invalid.focus();
      const message = invalid.dataset && invalid.dataset.invalid
        ? (this.fieldCaption(invalid) + ': ' + invalid.dataset.invalid)
        : 'Проверьте обязательные поля';
      this.showDialog('Заполните форму: ' + message, 'Ок');
      return;
    }

    const state = this.getState();
    const target = this.root.dispatchEvent ? this.root : document;
    target.dispatchEvent(new CustomEvent('yarbp:submit', {
      detail: state,
      bubbles: true,
    }));
    this.showDialog('Данные отправлены', 'Ок');
  }

  _onClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const tab = target.closest('.tab-btn');
    if (tab) {
      this.activateTab(tab.closest('.tabs'), tab.dataset.tabTarget);
      return;
    }

    // `.проверить` + `.диалог`/`.неуспех` гасят действие до его выполнения.
    const action = target.closest('.ui-action');
    if (action && !this.checkAction(action)) return;

    const clear = target.closest('.field-clear') || target.closest('[data-clear]');
    if (clear) { this.clearField(clear); return; }

    const addRow = target.closest('.add-table-row');
    if (addRow) { this.addTableRow(addRow); return; }

    const removeRow = target.closest('.remove-table-row');
    if (removeRow) { this.removeTableRow(removeRow); return; }

    const remove = target.closest('.remove-item');
    if (remove) { this.removeItem(remove); return; }

    const show = target.closest('.show-form-btn');
    if (show) { this.showForm(show); return; }

    const back = target.closest('.back-to-list');
    if (back) { this.backToList(back); return; }

    const copy = target.closest('.add-copy');
    if (copy) { this.addCopy(copy); return; }

    const submit = target.closest('.submit-item');
    if (submit) { this.submitItem(submit); return; }
  }

  _onKeydown(event) {
    if (event.key === 'Escape') {
      this.closeDialog();
      return;
    }
    if (event.key === 'Enter') this.tableEnter(event);
  }

  /**
   * Enter в ячейке таблицы — переход к той же колонке следующей строки.
   * На последней строке создаётся новая запись: так таблицу можно заполнять
   * подряд, не уводя фокус на кнопку «Добавить запись».
   *
   * Работаем только с текстовыми `input`: у `select` Enter открывает список,
   * у `textarea` — переносит строку, у флажков — переключает значение.
   */
  tableEnter(event) {
    if (!event || event.defaultPrevented || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return false;
    }
    const field = event.target;
    if (!field || !field.matches || !field.matches('input')) return false;
    if (['checkbox', 'radio', 'hidden', 'button', 'submit', 'reset'].includes(field.type)) {
      return false;
    }
    const wrap = field.closest('[data-ui-table]');
    const row = field.closest('tr');
    if (!wrap || !row) return false;
    // У документа может быть несколько смонтированных runtime: чужую таблицу
    // не трогаем.
    if (this.root && this.root.contains && !this.root.contains(wrap)) return false;

    const rows = this.tableRows(wrap);
    const rowIndex = rows.indexOf(row);
    if (rowIndex === -1) return false;
    const column = Array.from(row.children).indexOf(field.closest('td'));
    if (column < 0) return false;

    if (rowIndex === rows.length - 1) {
      const add = wrap.querySelector('.add-table-row');
      if (!add) return false;
      event.preventDefault();
      this.addTableRow(add, column);
      return true;
    }

    const next = rows[rowIndex + 1];
    const cell = next.children[column];
    const target = cell && cell.querySelector(
      'input:not([type="hidden"]), select, textarea');
    if (!target) return false;
    event.preventDefault();
    target.focus();
    return true;
  }

}
