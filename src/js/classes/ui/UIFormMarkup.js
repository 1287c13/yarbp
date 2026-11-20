/**
 * IR → HTML. Только сборка строк: ни DOM, ни состояния.
 *
 * Разметка повторяет эталон `notes/design/target.html` один в один: те же
 * элементы, классы и текст. Стили в `UIFormStyles` рассчитаны ровно на этот
 * DOM, поэтому предпросмотр и выгрузка выглядят одинаково.
 *
 * Обработчики `.код` остаются данными: `data-handler` + инертный JSON
 * `<script type="application/json" class="yarbp-handlers">`. Ни eval, ни
 * inline-атрибутов.
 */

import { escText, escAttr } from '../../utils/escape.js';

/** Путь узла без корневого `форма.` — так его видно в data-атрибутах. */
export function relPath(path) {
  return String(path || '').replace(/^форма\.?/, '');
}

function attr(name, value) {
  if (value === undefined || value === null || value === false || value === '') return '';
  return ' ' + name + '="' + escAttr(value) + '"';
}

function flag(name, enabled) {
  return enabled ? ' ' + name : '';
}

function pathAttr(path) {
  return attr('data-element-path', relPath(path));
}

/** Хвост из пробелов: `#id` → `id`. */
function stripHash(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim().replace(/^#/, '');
}

/** Короткий класс из значения (`accounting` → `accounting`). */
function slugClass(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Обработчик `.код`: id записи и его событие. Саму функцию ищет UIRuntime —
 * в предпросмотре по данным `script.yarbp-handlers`, в выгрузке по inline-коду
 * с nonce.
 */
function handlerAttrs(node) {
  const handler = node && node.handler;
  if (!handler || !handler.id) return '';
  return attr('data-handler', handler.id) + attr('data-handler-event', handler.event);
}

/** Данные обработчиков: инертный JSON `<script type="application/json">`. */
function handlersPayload(handlers) {
  const bag = Object.create(null);
  (handlers || []).forEach(handler => {
    if (!handler || !handler.id) return;
    bag[handler.id] = {
      event: handler.event,
      code: handler.code,
      path: handler.path || '',
    };
  });
  if (!Object.keys(bag).length) return '';
  // `\u003c` вместо `<`: в тексте скрипта `</script>` иначе закрыл бы тег.
  const json = JSON.stringify(bag).replace(/</g, '\\u003c');
  return '<script type="application/json" class="yarbp-handlers">' + json + '</script>';
}

const SIDE_CLASS = {
  left: 'left-column',
  right: 'right-column',
  side: 'side-column',
  center: 'center-column',
};

/**
 * Атрибуты колонки: канонический класс для «левая/правая/боковая/центральная»,
 * `form-column` + `data-column` — для колонки с произвольным именем,
 * `data-share` — для ручной доли ширины.
 */
function columnAttrs(column) {
  const canonical = SIDE_CLASS[column.side];
  const classes = canonical || 'form-column';
  let out = ' class="' + classes + '"';
  if (!canonical && column.name) out += attr('data-column', column.name);
  if (column.share && column.share > 1) out += attr('data-share', String(column.share));
  return out;
}

/** Форма целиком: контейнер, поток колонок, полезная нагрузка обработчиков. */
export function formMarkup(ir) {
  if (!ir) return '';
  const columns = ir.columns || [];
  const out = [];

  out.push('<div class="form-container">');
  out.push('<form' + attr('action', ir.action) +
    ' method="' + (ir.method === 'get' ? 'get' : 'post') + '"' +
    pathAttr('форма') + handlerAttrs(ir) + '>');
  out.push('<div class="form-grid">');

  columns.forEach(column => {
    out.push('<div' + columnAttrs(column) + '>');
    (column.items || []).forEach(node => out.push(nodeMarkup(node, { nested: false })));
    out.push('</div>');
  });

  out.push('</div>');
  out.push('</form>');

  const payload = handlersPayload(ir.handlers);
  if (payload) out.push(payload);
  out.push('</div>');
  return out.join('\n');
}

/** Один IR-узел любого вида. `ctx.nested` — внутри карточки. */
export function nodeMarkup(node, ctx = {}) {
  if (!node) return '';
  switch (node.type) {
    case 'card': return cardMarkup(node, ctx);
    case 'group': return itemsMarkup(node.items, ctx);
    case 'plate': return plateMarkup(node, ctx);
    case 'list': return listMarkup(node, ctx);
    case 'table': return tableMarkup(node, ctx);
    case 'views': return viewsMarkup(node, ctx);
    case 'field': return fieldMarkup(node, ctx);
    case 'select': return selectMarkup(node, ctx);
    case 'radio': return radioMarkup(node, ctx);
    case 'checkbox': return checkboxMarkup(node, ctx);
    case 'block': return blockMarkup(node, ctx);
    case 'note': return noteMarkup(node, ctx);
    case 'button': return buttonMarkup(node, ctx);
    default: return '';
  }
}

function itemsMarkup(items, ctx) {
  return (items || []).map(node => nodeMarkup(node, ctx)).join('\n');
}

/* ------------------------------- карточки ------------------------------ */

/** Карточка: `<fieldset class="fieldset-card">` + `legend`. */
function cardMarkup(node, ctx) {
  const classes = ['fieldset-card'];
  if (node.containerClass) classes.push(node.containerClass);
  const out = ['<fieldset class="' + classes.join(' ') + '"' +
    attr('id', node.local ? node.local + '-card' : '') +
    pathAttr(node.path) + handlerAttrs(node) + '>'];
  if (node.title) out.push('<legend>' + escText(node.title) + '</legend>');
  out.push(itemsMarkup(node.items, { nested: true }));
  out.push('</fieldset>');
  return out.filter(Boolean).join('\n');
}

/** Плашка «подпись — значение»; вложенная в карточку получает отступ. */
function plateMarkup(node, ctx) {
  const out = ['<div class="order-card"' +
    (ctx.nested ? ' style="margin-top: 1rem;"' : '') +
    pathAttr(node.path) + handlerAttrs(node) + '>'];
  if (node.title) out.push('<h3>' + escText(node.title) + '</h3>');
  // В карточке значение жирное, в самостоятельной плашке — обычное: так в эталоне.
  const tag = ctx.nested ? 'strong' : 'span';
  (node.rows || []).forEach(row => {
    const label = row.label ? '<span>' + escText(row.label) + '</span>' : '<span></span>';
    if (row.total) {
      out.push('<div class="total-row">' + label +
        '<span>' + escText(row.value) + '</span></div>');
    } else {
      out.push('<div class="info-row">' + label +
        '<' + tag + '>' + escText(row.value) + '</' + tag + '></div>');
    }
  });
  out.push('</div>');
  return out.join('\n');
}

/**
 * Строки списка: чётные слоты играют роль подписи, нечётные — значения.
 * Слот с явной подписью даёт пару «подпись + значение» на своём месте.
 */
function listMarkup(node, ctx) {
  const rows = (node.rows || []).map(row => {
    const cells = (row.slots || []).map((slot, index) => {
      const value = '<span class="item-value"' + attr('data-field', slot.local) + '>' +
        escText(slot.value || '—') + '</span>';
      if (slot.label) {
        return '<span class="item-label">' + escText(slot.label) + '</span>' + value;
      }
      const cellClass = index % 2 === 0 ? 'item-label' : 'item-value';
      return '<span class="' + cellClass + '"' + attr('data-field', slot.local) + '>' +
        escText(slot.value || '—') + '</span>';
    }).join('');
    return '<div class="list-item">' + cells + '</div>';
  });
  return '<div class="items-list"' + pathAttr(node.path) + handlerAttrs(node) + '>' +
    rows.join('\n') + '</div>';
}

/* -------------------------- редактируемая таблица ---------------------- */

function tableRowMarkup(columns) {
  const cells = columns.map(col => '<td><input' + attr('type', col.inputType) +
    attr('name', col.local) + attr('data-field', col.local) + attr('value', col.value) +
    '></td>').join('');
  return '<tr>' + cells + '<td class="ui-table-actions">' +
    '<button type="button" class="remove-table-row" title="Удалить строку">×</button>' +
    '</td></tr>';
}

function tableMarkup(node, ctx) {
  const columns = node.columns || [];
  const head = columns.map(col => '<th>' + escText(col.label) +
    (col.postfix ? ' <span class="field-postfix">' + escText(col.postfix) + '</span>' : '') +
    '</th>');
  head.push('<th class="ui-table-actions"></th>');
  const row = tableRowMarkup(columns);

  return [
    '<div class="ui-table-wrap"' + attr('data-ui-table', node.tableId) + pathAttr(node.path) +
      handlerAttrs(node) + '>',
    node.title ? '<div class="ui-table-title">' + escText(node.title) + '</div>' : '',
    '<table class="ui-table">',
    '<thead><tr>' + head.join('') + '</tr></thead>',
    '<tbody>' + row + '</tbody>',
    '</table>',
    '<template class="ui-table-row-template">' + row + '</template>',
    '<button type="button" class="btn-secondary add-table-row">+ Строка</button>',
    '</div>',
  ].filter(Boolean).join('\n');
}

/* ----------------------- два представления (табы) ---------------------- */

/**
 * `табы` — это два состояния одной карточки: список и форма добавления.
 * Переключаются кнопками `.навигация`, как в эталоне; пилюль-табов нет.
 */
function viewsMarkup(node, ctx) {
  const viewsId = node.local || 'views';
  return (node.items || []).map(tab => tab.kind === 'list'
    ? listViewMarkup(tab, viewsId)
    : formViewMarkup(tab, viewsId)).join('\n');
}

function listViewMarkup(tab, viewsId) {
  const out = ['<div class="list-view"' + attr('id', viewsId + '-list-view') +
    attr('data-views', viewsId) + attr('data-view', 'list') +
    pathAttr(tab.path) + handlerAttrs(tab) + '>'];
  out.push(itemsMarkup(tab.items, { nested: true }));
  out.push('</div>');
  return out.filter(Boolean).join('\n');
}

/** Пары полей в `.two-columns`; одиночное поле идёт своим `.input-group`. */
function chunkPairs(items) {
  const rows = [];
  let row = [];
  items.forEach(item => {
    row.push(item);
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  });
  if (row.length) rows.push(row);
  return rows;
}

function formViewMarkup(tab, viewsId) {
  const items = tab.items || [];
  const fields = items.filter(item => item.type !== 'button');
  const buttons = items.filter(item => item.type === 'button');
  const rows = chunkPairs(fields);

  const body = [];
  body.push('<div class="repeatable-item">');
  body.push('<div class="repeatable-header"><span>' +
    escText(tab.title ? tab.title + ' 1' : '') + '</span>' +
    (tab.clear
      ? '<button type="button" class="btn-secondary remove-item"' +
        ' style="padding: 0.3rem 0.8rem;">✖</button>'
      : '') + '</div>');
  rows.forEach(rowFields => {
    if (rowFields.length === 2) {
      body.push('<div class="two-columns">' + rowFields
        .map(field => nodeMarkup(field, { repeat: viewsId })).join('') + '</div>');
      return;
    }
    body.push(nodeMarkup(rowFields[0], { repeat: viewsId }));
  });
  body.push('</div>');

  return ['<div class="form-view"' + attr('id', viewsId + '-form-view') +
    attr('data-views', viewsId) + attr('data-view', 'form') +
    pathAttr(tab.path) + handlerAttrs(tab) + '>',
  '<div' + attr('id', viewsId + '-form-list') + '>' + body.join('\n') + '</div>',
  buttons.map(button => buttonMarkup(button, {})).join('\n'),
  '</div>'].filter(Boolean).join('\n');
}

/* -------------------------------- поля --------------------------------- */

/** id поля: в форме добавления — с префиксом представления. */
function fieldId(node, ctx) {
  return ctx && ctx.repeat ? ctx.repeat + '-' + node.local : node.local;
}

/** name поля: в форме добавления — `operations[0][type]`. */
function fieldName(node, ctx) {
  if (ctx && ctx.repeat) return ctx.repeat + '[0][' + node.local + ']';
  return node.name || node.local;
}

/** Подпись поля; постфикс живёт в скобках подписи, как в эталоне. */
function fieldLabel(node) {
  if (!node.label) return '';
  const postfix = String(node.postfix || '').trim();
  return postfix ? node.label + ' (' + postfix + ')' : node.label;
}

function labelMarkup(node, id) {
  if (!node.label) return '';
  return '<label' + (node.required ? ' class="required-star"' : '') +
    attr('for', id) + '>' + escText(fieldLabel(node)) + '</label>';
}

function inputGroupClasses(node) {
  return 'input-group' + (node.full ? ' full-width' : '');
}

function fieldMarkup(node, ctx) {
  const id = fieldId(node, ctx);
  const control = '<input' + attr('type', node.inputType) + attr('id', id) +
    attr('name', fieldName(node, ctx)) + attr('placeholder', node.hint) +
    flag('required', node.required) + attr('value', node.value) +
    attr('data-field', node.local) + attr('data-mask', node.mask) +
    pathAttr(node.path) + '>';

  const body = node.clear
    ? '<div style="display: flex; gap: 0.5rem;">' + control +
      '<button type="button" class="btn-secondary" data-clear="' + escAttr(id) +
      '">Очистить</button></div>'
    : control;

  return '<div class="' + inputGroupClasses(node) + '"' + pathAttr(node.path) +
    handlerAttrs(node) + '>' + labelMarkup(node, id) + body + '</div>';
}

function selectMarkup(node, ctx) {
  const id = fieldId(node, ctx);
  const options = (node.options || []).map(option =>
    '<option' + attr('value', option.value) +
    (option.selected ? ' selected' : '') + '>' + escText(option.label) + '</option>');
  if (!options.length) options.push('<option value=""></option>');

  const body = '<select' + attr('id', id) + attr('name', fieldName(node, ctx)) +
    flag('required', node.required) + attr('data-field', node.local) +
    pathAttr(node.path) + '>' + options.join('') + '</select>';

  return '<div class="' + inputGroupClasses(node) + '"' + pathAttr(node.path) +
    handlerAttrs(node) + '>' + labelMarkup(node, id) + body + '</div>';
}

function radioMarkup(node, ctx) {
  const options = (node.options || []).map(option => {
    const value = option.value || option.label;
    const id = node.local + '-' + slugClass(value);
    return '<label class="radio-option"><input type="radio"' +
      attr('name', node.name || node.local) + attr('value', option.value) +
      attr('id', id) + flag('checked', option.checked) +
      attr('data-choice', node.local) + '><span>' + escText(option.label) +
      '</span></label>';
  });
  return '<div class="radio-group"' + pathAttr(node.path) + handlerAttrs(node) + '>' +
    options.join('') + '</div>';
}

function checkboxMarkup(node, ctx) {
  const id = node.local;
  return '<div class="checkbox-group"' + pathAttr(node.path) + handlerAttrs(node) + '>' +
    '<input type="checkbox"' + attr('id', id) + attr('name', node.name) +
    flag('required', node.required) + flag('checked', node.checked) +
    attr('data-field', node.local) + '>' +
    '<label' + attr('for', id) + '>' + escText(node.label) + '</label>' +
    '</div>';
}

/** Блок, который показывается при выбранном значении переключателя. */
function blockMarkup(node, ctx) {
  const when = node.when || {};
  return '<div class="conditional-' + slugClass(when.value) + ' dynamic-block"' +
    attr('data-show-name', when.name) + attr('data-show-value', when.value) +
    attr('data-conditional', when.value) + '>' +
    itemsMarkup(node.items, ctx) + '</div>';
}

/* ------------------------------- надписи ------------------------------- */

function noteMarkup(node, ctx) {
  if (node.variant === 'heading') return '<h3>' + escText(node.text) + '</h3>';
  if (node.variant === 'hint') {
    return '<small class="mt-1" style="display: block; text-align: center;">' +
      escText(node.text) + '</small>';
  }
  return '<div class="form-caption">' + escText(node.text) + '</div>';
}

/* ------------------------------- кнопки -------------------------------- */

/**
 * Роль кнопки задаёт её класс и поведение рантайма:
 * `show-form-btn`, `back-to-list`, `add-copy`.
 */
function buttonRole(node) {
  if (node.auto === 'show-form-btn' || node.role === 'show-form') return 'show-form-btn';
  if (node.auto === 'back-to-list' || node.role === 'back-to-list') return 'back-to-list';
  if (node.role === 'add-copy') return 'add-copy';
  return '';
}

function buttonMarkup(node, ctx) {
  const role = buttonRole(node);
  const classes = ['btn-' + (node.kind === 'primary' || node.submit ? 'primary' : 'secondary')];
  if (role) classes.push(role);
  if (node.action) classes.push('ui-action');

  let style = '';
  if (role === 'show-form-btn') style = 'width: 100%;';
  if (role === 'back-to-list' || role === 'add-copy') {
    style = 'width: 100%; margin-top: 0.5rem;';
  }

  const checks = node.checks || [];
  return '<button type="' + (node.submit ? 'submit' : 'button') + '"' +
    ' class="' + classes.join(' ') + '"' + attr('style', style) +
    attr('data-navigate', stripHash(node.navigation)) +
    attr('data-source', stripHash(node.source)) +
    attr('data-target', stripHash(node.target)) +
    attr('data-check', checks.join(' ')) +
    attr('data-check-type', checks.length ? node.checkType : '') +
    attr('data-check-goal', checks.length ? node.checkGoal : '') +
    attr('data-dialog', node.dialog ? node.dialog.message : '') +
    attr('data-dialog-ok', node.dialog ? node.dialog.ok : '') +
    pathAttr(node.path) + handlerAttrs(node) + '>' +
    escText(node.label) + '</button>';
}
