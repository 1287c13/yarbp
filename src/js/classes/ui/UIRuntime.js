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

  snapshot() {
    return {
      activeTab: this.activeTab,
      fields: Object.assign({}, this.fields),
      lists: Object.assign({}, this.lists),
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
    this._onClick = this._onClick.bind(this);
    this._onInput = this._onInput.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  mount() {
    if (this.mounted) return this;
    this.root.addEventListener('click', this._onClick);
    this.root.addEventListener('input', this._onInput);
    this.root.addEventListener('change', this._onChange);
    document.addEventListener('keydown', this._onKeydown);
    this._syncModel();
    this.mounted = true;
    return this;
  }

  destroy() {
    if (!this.mounted) return;
    this.root.removeEventListener('click', this._onClick);
    this.root.removeEventListener('input', this._onInput);
    this.root.removeEventListener('change', this._onChange);
    document.removeEventListener('keydown', this._onKeydown);
    this.closeDialog();
    this.mounted = false;
  }

  targetId(raw) {
    const text = String(raw || '').trim().replace(/^#/, '').replace(/\s+/g, ' ');
    const parts = text.split(/[.\s]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  findTab(raw) {
    const id = this.targetId(raw);
    if (!id) return null;
    const byData = Array.from(this.root.querySelectorAll('[data-tab-id]'))
      .find(el => el.dataset.tabId === id);
    return byData || this.root.querySelector('#' + id);
  }

  findField(raw) {
    const id = this.targetId(raw);
    if (!id) return null;
    return Array.from(this.root.querySelectorAll('input, select'))
      .find(el => el.name === id || el.id === id) || null;
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
    const check = button.dataset.check;
    if (!check) {
      if (button.dataset.dialog) {
        this.showDialog(button.dataset.dialog, button.dataset.dialogOk);
      }
      return true;
    }

    const field = this.findField(check);
    const empty = !field || String(field.value || '').trim() === '';
    const invalid = button.dataset.checkType === 'пусто' ? empty : false;
    if (!invalid) return true;
    if (button.dataset.dialog) {
      this.showDialog(button.dataset.dialog, button.dataset.dialogOk);
    }
    return button.dataset.checkGoal !== 'запретить';
  }

  transfer(button) {
    const source = this.findTab(button.dataset.source);
    const target = this.findTab(button.dataset.target);
    if (!source || !target) return;

    const fields = Array.from(source.querySelectorAll('input, select'));
    const values = fields.map(field => {
      const label = field.closest('.input-group')?.querySelector('label')?.textContent || field.name;
      return { label: label, value: field.value || '—' };
    }).filter(item => item.value !== '—');
    if (!values.length) return;

    let list = target.querySelector('.items-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'items-list';
      target.appendChild(list);
    }
    const item = document.createElement('div');
    item.className = 'list-item';
    values.forEach(data => {
      const span = document.createElement('span');
      span.textContent = data.label + ': ' + data.value;
      item.appendChild(span);
    });
    list.appendChild(item);

    const targetId = target.dataset.tabId || this.targetId(button.dataset.target);
    this.viewModel.addListItem(targetId, values);

    fields.forEach(field => {
      if (field.tagName === 'SELECT') field.selectedIndex = -1;
      else field.value = '';
      this.viewModel.setField(field.name, field.value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    this.activateTarget(button.dataset.target);
  }


  clearField(button) {
    const row = button.closest('.field-row');
    const field = row && row.querySelector('input, select');
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

  showForm(button) {
    const card = button.closest('.fieldset-card');
    const tabs = card && card.querySelector('.tabs');
    const formPanel = card && card.querySelector('.form-view');
    if (tabs && formPanel) {
      this.activateTab(tabs, formPanel.dataset.tabPanel);
      return;
    }
    if (!card) return;
    card.querySelector('.list-view').style.display = 'none';
    card.querySelector('.form-view').style.display = 'block';
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
    card.querySelector('.list-view').style.display = 'block';
    card.querySelector('.form-view').style.display = 'none';
  }

  submitItem(button) {
    const card = button.closest('.fieldset-card');
    if (!card) return;
    const formView = card.querySelector('.form-view');
    const itemsList = card.querySelector('.items-list');
    if (!formView || !itemsList) return;

    const invalid = Array.from(formView.querySelectorAll('input, select'))
      .find(field => typeof field.checkValidity === 'function' && !field.checkValidity());
    if (invalid) {
      if (typeof invalid.reportValidity === 'function') invalid.reportValidity();
      return;
    }

    const data = [];
    formView.querySelectorAll('input, select').forEach(field => {
      const label = field.closest('.input-group')?.querySelector('label')?.textContent || field.name;
      data.push({ label: label, value: field.value || '—' });
      this.viewModel.setField(field.name, field.value);
    });

    const item = document.createElement('div');
    item.className = 'list-item';
    data.forEach(entry => {
      const span = document.createElement('span');
      span.textContent = entry.label + ': ' + entry.value;
      item.appendChild(span);
    });
    itemsList.appendChild(item);

    const panel = itemsList.closest('[data-tab-id]');
    this.viewModel.addListItem(panel ? panel.dataset.tabId : 'list', data);

    formView.querySelectorAll('input').forEach(field => {
      field.value = '';
      this.viewModel.setField(field.name, '');
    });
    formView.querySelectorAll('select').forEach(field => {
      field.selectedIndex = 0;
      this.viewModel.setField(field.name, field.value);
    });
    const listPanel = card.querySelector('.list-view');
    const tabs = card.querySelector('.tabs');
    if (tabs && listPanel) this.activateTab(tabs, listPanel.dataset.tabPanel);
    else {
      card.querySelector('.list-view').style.display = 'block';
      formView.style.display = 'none';
    }
  }

  /** Перечитать DOM после внешнего восстановления значений. */
  syncFromDOM() {
    this._syncModel();
  }

  _syncModel() {
    this.root.querySelectorAll('input, select').forEach(field => {
      this.viewModel.setField(field.name, field.value);
    });
    const active = this.root.querySelector('.tab-btn.active');
    if (active) this.viewModel.setActiveTab(active.dataset.tabTarget);
  }

  _onInput(event) {
    const field = event.target;
    if (field && field.matches && field.matches('input, select')) {
      this.viewModel.setField(field.name, field.value);
    }
  }

  _onChange(event) {
    const field = event.target;
    if (field && field.matches && field.matches('input, select')) {
      this.viewModel.setField(field.name, field.value);
    }
  }

  _onClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const tab = target.closest('.tab-btn');
    if (tab) {
      this.activateTab(tab.closest('.tabs'), tab.dataset.tabTarget);
      return;
    }

    const clear = target.closest('.field-clear');
    if (clear) { this.clearField(clear); return; }

    const remove = target.closest('.remove-item');
    if (remove) { this.removeItem(remove); return; }

    const show = target.closest('.show-form-btn');
    if (show) { this.showForm(show); return; }

    const back = target.closest('.back-to-list');
    if (back) { this.backToList(back); return; }

    const submit = target.closest('.submit-item');
    if (submit) { this.submitItem(submit); return; }

    const action = target.closest('.ui-action');
    if (action) {
      if (!this.checkAction(action)) return;
      if (action.dataset.source && action.dataset.target) {
        this.transfer(action);
        return;
      }
      if (action.dataset.navigation) this.activateTarget(action.dataset.navigation);
    }
  }

  _onKeydown(event) {
    if (event.key === 'Escape') this.closeDialog();
  }

}
