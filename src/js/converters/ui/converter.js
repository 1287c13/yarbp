// Конвертер UI-макета ЯРБП в промежуточное представление (IR).

const MEANING = 'MEANING';

const ELEM = {
  form: 'форма',
  group: 'группа',
  field: 'поле',
  button: 'кнопка',
  note: 'надпись',
  tabs: 'табы',
  tab: 'таб',
  option: 'опция',
  choice: 'выбор',
};

const ELEM_ALIAS = {
  'форма': ELEM.form,
  'form': ELEM.form,
  'группа': ELEM.group,
  'group': ELEM.group,
  'поле': ELEM.field,
  'field': ELEM.field,
  'кнопка': ELEM.button,
  'button': ELEM.button,
  'надпись': ELEM.note,
  'note': ELEM.note,
  'табы': ELEM.tabs,
  'tabs': ELEM.tabs,
  'таб': ELEM.tab,
  'tab': ELEM.tab,
  'опция': ELEM.option,
  'вариант': ELEM.option,
  'option': ELEM.option,
  'выбор': ELEM.choice,
  'choice': ELEM.choice,
};

const COLUMN_SIDE = {
  'левая': 'left',
  'левый': 'left',
  'лево': 'left',
  'left': 'left',
  'правая': 'right',
  'правый': 'right',
  'право': 'right',
  'right': 'right',
  'боковая': 'side',
  'боковой': 'side',
  'side': 'side',
  'центральная': 'center',
  'центральный': 'center',
  'center': 'center',
};

const COLUMN_NAME = {
  left: 'левая',
  right: 'правая',
  side: 'боковая',
  center: 'центральная',
};

const GROUP_KIND = {
  'плитка': 'card',
  'карточка': 'card',
  'card': 'card',
  'таблицасоответствий': 'plate',
  'плашка': 'plate',
  'plate': 'plate',
  'наборсоответствий': 'list',
  'list': 'list',
  'таблица': 'table',
  'table': 'table',
};

const CONTROL_BY_TYPE = {
  'текст': 'text',
  'строка': 'text',
  'text': 'text',
  'число': 'number',
  'дробное': 'number',
  'number': 'number',
  'целое': 'integer',
  'integer': 'integer',
  'дата': 'date',
  'date': 'date',
  'время': 'time',
  'time': 'time',
  'месяц': 'month',
  'почта': 'email',
  'email': 'email',
  'телефон': 'tel',
  'тел': 'tel',
  'tel': 'tel',
  'ссылка': 'url',
  'url': 'url',
  'пароль': 'password',
  'многострочный': 'textarea',
  'область': 'textarea',
  'textarea': 'textarea',
  'штрихкод': 'barcode',
  'barcode': 'barcode',
  'выбор': 'select',
  'селект': 'select',
  'select': 'select',
  'радио': 'radio',
  'radio': 'radio',
  'флаг': 'checkbox',
  'признак': 'checkbox',
  'checkbox': 'checkbox',
  'скрытый': 'hidden',
  'hidden': 'hidden',
};

const INPUT_BY_CONTROL = {
  text: 'text',
  number: 'number',
  integer: 'number',
  date: 'date',
  time: 'time',
  month: 'month',
  email: 'email',
  tel: 'tel',
  url: 'url',
  password: 'password',
  barcode: 'text',
  hidden: 'hidden',
};

const NOTE_VARIANT = {
  'заголовок': 'heading',
  'heading': 'heading',
  'подсказка': 'hint',
  'совет': 'hint',
  'hint': 'hint',
};

// Маска ввода/проверки поля.
const MASK_BY_CONTROL = {
  tel: 'tel',
  email: 'email',
  url: 'url',
  number: 'number',
  integer: 'integer',
  barcode: 'barcode',
  date: 'date',
  time: 'time',
  month: 'month',
};

const SCRIPT_LANGS = ['js', 'javascript', 'ecmascript', 'mjs'];

const EVENT_BY_TYPE = {
  form: 'submit',
  button: 'click',
  field: 'input',
  select: 'input',
  radio: 'input',
  checkbox: 'input',
  note: 'click',
  card: 'click',
  group: 'click',
  plate: 'click',
  list: 'click',
  table: 'click',
  tabs: 'click',
  tab: 'click',
};

const EVENT_ALIAS = {
  'клик': 'click',
  'нажатие': 'click',
  'click': 'click',
  'ввод': 'input',
  'input': 'input',
  'изменение': 'change',
  'change': 'change',
  'отправка': 'submit',
  'submit': 'submit',
  'загрузка': 'load',
  'load': 'load',
  'фокус': 'focus',
  'focus': 'focus',
  'потеряфокуса': 'blur',
  'блюр': 'blur',
  'blur': 'blur',
};

export function norm(word) {
  return String(word === undefined || word === null ? '' : word)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/g, '');
}

export function propValue(props, ...names) {
  if (!props) return undefined;
  for (const name of names) {
    const key = norm(name);
    if (Object.prototype.hasOwnProperty.call(props, key)) return props[key];
  }
  return undefined;
}

export function propFlags(props, names) {
  const value = propValue(props, ...names);
  return isTruthy(value);
}

export function isTruthy(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  if (String(value).trim() === '*') return true;
  const text = norm(value);
  if (!text) return false;
  return text === 'да' || text === 'истина' || text === 'true' || text === '1' ||
    text === 'on';
}

export function textOf(node) {
  if (!node || typeof node !== 'object') {
    return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  }
  if (node.value === undefined || node.value === null) return '';
  return String(node.value).replace(/^=\s*/, '')
    .replace(/\s+--\s.*$/s, '')
    .trim();
}

export function isMeaning(node) {
  return !!node && node.nodeType === MEANING;
}

export function markerTail(text) {
  const value = text === undefined || text === null ? '' : String(text);
  const match = value.match(/\s+--\s*(.+)$/s);
  return match ? match[1] : '';
}

export function elementOf(node) {
  if (!isMeaning(node)) return '';
  const raw = String(node.key || '').split('#')[0].split(':')[0];
  return ELEM_ALIAS[norm(markerTail(raw) ? raw.replace(/\s+--\s.*$/s, '') : raw)] || '';
}

export function flagList(value) {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
  return items.map(item => norm(item)).filter(Boolean);
}

export function hasFlag(props, names, flag) {
  return flagList(propValue(props, ...names)).indexOf(norm(flag)) >= 0;
}

const TOTAL_KINDS = ['итог', 'всего', 'к-оплате', 'коплате'];

export function isTotalLabel(text) {
  const value = norm(text);
  if (!value) return false;
  return value.indexOf('итог') === 0 || value.indexOf('всего') === 0 ||
    TOTAL_KINDS.indexOf(value) >= 0;
}

export function slug(text) {
  const base = String(text === undefined || text === null ? '' : text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

export class IdRegistry {
  constructor() {
    this.scopes = Object.create(null);
  }

  take(scope, local) {
    const base = local || 'item';
    const key = scope || '';
    if (!this.scopes[key]) this.scopes[key] = Object.create(null);
    const bag = this.scopes[key];
    const used = bag[base] || 0;
    bag[base] = used + 1;
    return used === 0 ? base : base + '-' + (used + 1);
  }
}

/**
 * AST → IR. Публичный контракт: `convert(ast)` возвращает объект формы
 * (или null, если формы в дереве нет). Ни AST, ни узлы не изменяются.
 */
export class UIFormConvertor {
  constructor(options = {}) {
    this.idPrefix = options.idPrefix || 'ui';
    this.maxDepth = options.maxDepth || 40;
    this.ir = null;
    this.ids = new IdRegistry();
    this.fields = Object.create(null);
  }


  convert(rootAst) {
    this.fields = Object.create(null);
    this.ids = new IdRegistry();
    this.uidCounter = 0;
    this.tableCounter = 0;
    this.unknownKeys = Object.create(null);

    const formNode = this.findForm(rootAst);
    if (!formNode) return null;

    const props = this.readProps(formNode);
    const ir = {
      type: 'form',
      id: 'форма',
      path: 'форма',
      title: textOf(formNode) || propValue(props, 'заголовок', 'название') || '',
      action: propValue(props, 'адрес', 'action') || '',
      method: norm(propValue(props, 'метод', 'method')) === 'get' ? 'get' : 'post',
      columns: [],
      actions: [],
      fields: [],
      handlers: [],
      diagnostics: [],
      meta: { idPrefix: this.idPrefix },
    };
    this.ir = ir;
    this.handlerIds = Object.create(null);
    this.fieldDefs = this.indexFields(formNode);

    const formHandler = this.handlerOf(formNode, 'submit', 'форма');
    if (formHandler) {
      ir.handler = formHandler;
      ir.handlers.push(formHandler);
    }

    const ctx = { path: 'форма', scope: 'форма', depth: 0 };
    const children = this.meaningChildren(formNode).filter(node => !this.isPropNode(node));
    const hasSides = children.some(node => this.columnOf(node));
    let column = null;

    // Колонка по имени: «левая/правая/боковая» — канонические классы, любое другое имя (`материалы`, `первая`) — своя колонка.
    const columnFor = spec => {
      let found = ir.columns.find(item => item.side === spec.side);
      if (!found) {
        found = {
          type: 'column',
          index: ir.columns.length,
          side: spec.side,
          name: spec.name,
          share: spec.share || 1,
          items: [],
        };
        ir.columns.push(found);
      } else if (spec.share && spec.share > (found.share || 1)) {
        found.share = spec.share;
      }
      return found;
    };

    // Без явных маркеров: первые две группы — две колонки, дальше — своя на каждую следующую группу (раньше всё лишнее…
    const autoColumn = () => {
      const used = ir.columns.map(item => item.side);
      const free = ['left', 'right'].find(side => used.indexOf(side) < 0);
      if (free) return columnFor({ side: free, name: COLUMN_NAME[free] });
      const index = ir.columns.length + 1;
      return columnFor({ side: 'auto-' + index, name: 'колонка ' + index });
    };

    children.forEach(node => {
      const elem = elementOf(node);

      if (elem === ELEM.option || elem === ELEM.tab) {
        this.diagnose('warn', 'orphan',
          'Узел «' + (node.key || '?') + '» вне своего родителя — пропущен', ctx.path);
        return;
      }

      const spec = this.columnOf(node);
      if (spec) column = columnFor(spec);
      else if (!column) column = autoColumn();
      else if (!hasSides && (elem === ELEM.group || elem === ELEM.tabs)) column = autoColumn();

      if (elem === ELEM.button) {
        const button = this.button(node, ctx);
        if (!button) return;
        column.items.push(...this.withHandler(node, [button], ctx));
        return;
      }

      const nodeCtx = Object.assign({}, ctx, { column: column.side });
      column.items.push(...this.convertNode(node, nodeCtx));
    });

    const listed = [];
    Object.keys(this.fieldDefs).forEach(key => {
      const def = this.fieldDefs[key];
      if (def.kind !== 'field' || listed.indexOf(def) >= 0) return;
      listed.push(def);
      ir.fields.push(def.meta);
    });

    if (!ir.columns.length && !ir.actions.length) {
      this.diagnose('warn', 'empty-form', 'В форме нет отображаемых узлов', 'форма');
    }
    return ir;
  }

  findForm(node) {
    const named = this.findNamedForm(node);
    if (named) return named;
    if (!isMeaning(node)) {
      const roots = (node && node.children) || [];
      return roots.find(isMeaning) || null;
    }
    return node;
  }

  findNamedForm(node) {
    if (!isMeaning(node)) {
      for (const child of (node && node.children) || []) {
        const found = this.findNamedForm(child);
        if (found) return found;
      }
      return null;
    }
    if (elementOf(node) === ELEM.form) return node;
    for (const child of node.children || []) {
      const found = this.findNamedForm(child);
      if (found) return found;
    }
    return null;
  }

  depthGuard(ctx) {
    if (ctx.depth <= this.maxDepth) return false;
    this.diagnose('warn', 'depth', 'Слишком глубокая вложенность — ветка пропущена', ctx.path);
    return true;
  }

  diagnose(level, code, text, path) {
    if (!this.ir) return;
    this.ir.diagnostics.push({ level, code, text, path: path || '' });
  }


  /** Язык фрагмента совместим с браузером (```` ```js ````, `javascript`). */
  isScriptLang(language) {
    const value = norm(language);
    return !value || SCRIPT_LANGS.indexOf(value) >= 0;
  }

  // `.код` узла: сырой текст фрагмента (` ```js `) или скалярное значение.
  codeOf(node, path) {
    for (const child of this.meaningChildren(node)) {
      const key = norm(child && child.key);
      if (key !== 'код' && key !== 'code') continue;
      if (child.prefix !== '.' && child.prefix !== '..') continue;

      if (child.valueType === 'CODE') {
        const language = String(child.language || '').trim();
        if (!this.isScriptLang(language)) {
          this.diagnose('warn', 'code-language',
            'Фрагмент .код на «' + language + '» не исполнится: нужен ```js', path);
          continue;
        }
        const code = String(child.value === undefined || child.value === null
          ? '' : child.value).trim();
        if (!code) {
          this.diagnose('warn', 'empty-code',
            'Пустой фрагмент .код — обработчик не создан', path);
          continue;
        }
        return { code, language: language || 'js' };
      }

      const text = textOf(child).trim();
      if (text) return { code: text, language: 'js' };
    }
    return null;
  }

  eventOf(props, fallback) {
    const raw = propValue(props, 'событие', 'event');
    const value = String(raw === undefined || raw === null ? '' : raw)
      .trim().toLowerCase();
    if (!value) return fallback;
    const alias = EVENT_ALIAS[norm(value)];
    if (alias) return alias;
    return /^[a-z]+$/.test(value) ? value : fallback;
  }

  handlerId(path, event) {
    if (!this.handlerIds) this.handlerIds = Object.create(null);
    const base = 'h-' + slug(String(path || 'код').replace(/\./g, '-')) + '-' + event;
    const used = this.handlerIds[base] || 0;
    this.handlerIds[base] = used + 1;
    return used === 0 ? base : base + '-' + (used + 1);
  }

  handlerOf(node, fallbackEvent, path) {
    const code = this.codeOf(node, path);
    if (!code) return null;
    const props = this.readProps(node);
    const event = this.eventOf(props, fallbackEvent || 'click');
    return {
      id: this.handlerId(path, event),
      event,
      code: code.code,
      language: code.language,
      path: path || '',
    };
  }

  withHandler(node, items, ctx) {
    if (!items || !items.length) return items;
    const target = items[0];
    const fallback = EVENT_BY_TYPE[target.type] || 'click';
    const handler = this.handlerOf(node, fallback, target.path || ctx.path);
    if (!handler) return items;
    target.handler = handler;
    if (this.ir) this.ir.handlers.push(handler);
    return items;
  }


  meaningChildren(node) {
    return ((node && node.children) || []).filter(isMeaning);
  }

  isPropNode(node) {
    const prefix = node.prefix || '';
    if (prefix !== '.' && prefix !== '..') return false;
    return !elementOf(node);
  }

  // `поле#итог:целое` → { key: 'поле', type: 'целое', id: 'итог', ref: false }.
  splitKey(node) {
    const raw = String((node && node.key) || '').trim();
    const hash = raw.indexOf('#');
    const head = hash >= 0 ? raw.slice(0, hash) : raw;
    const tailId = hash >= 0 ? raw.slice(hash + 1).trim() : '';
    const id = String((node && node.id) || tailId).trim();
    const colon = head.indexOf(':');
    const key = colon >= 0 ? head.slice(0, colon) : head;
    const inline = colon >= 0 ? head.slice(colon + 1) : '';
    return {
      key: key.trim(),
      type: (inline || (node && node.type) || '').toString().trim(),
      id,
      ref: !!(node && node.prefix === ':'),
    };
  }

  readProps(node) {
    const props = Object.create(null);
    this.meaningChildren(node).forEach(child => {
      if (!this.isPropNode(child)) return;
      if (!child.key) return;
      const key = norm(child.key);
      if (child.prefix === '..' || child.valueType === 'ARRAY') {
        const items = (child.children || []).map(item => textOf(item)).filter(Boolean);
        props[key] = items;
        return;
      }
      props[key] = textOf(child);
    });
    return props;
  }

  contentChildren(node) {
    return this.meaningChildren(node).filter(child => !this.isPropNode(child) && !!child.key);
  }

  // Опции выбора: `опция = Представление / значение` (сахар разворачивает директива `! разбор-сахара(опция)`), либо…
  readOptions(node) {
    const options = [];
    this.meaningChildren(node).forEach(child => {
      if (!child.key) {
        const plain = textOf(child);
        if (plain) options.push({ label: plain, value: '', checked: false });
        return;
      }
      if (elementOf(child) !== ELEM.option) return;
      const props = this.readProps(child);
      const labelProp = propValue(props, 'представление', 'лэйбл', 'подпись');
      const label = labelProp === undefined ? textOf(child) : labelProp;
      if (!label) return;
      const valueProp = propValue(props, 'значение', 'value');
      options.push({
        label,
        value: valueProp === undefined ? '' : valueProp,
        checked: isTruthy(propValue(props, 'выбрано', 'checked')),
      });
    });
    return options;
  }

  // Индекс полей и табов: локальное имя и полный путь → описание.
  indexFields(formNode) {
    const index = Object.create(null);
    const walk = (node, parentPath) => {
      const elem = elementOf(node);
      const split = this.splitKey(node);
      const props = this.readProps(node);
      let local = '';
      let path = parentPath;

      if (elem === ELEM.field || elem === ELEM.choice) {
        const def = this.describeField(node, props, split);
        local = def.local;
        path = parentPath ? parentPath + '.' + local : local;
        def.path = path;
        def.meta.path = path;
        if (!index[local]) index[local] = def;
        if (!index[path]) index[path] = def;
        this.fields[local] = def;
      } else if (elem === ELEM.tab || elem === ELEM.tabs) {
        local = split.id || propValue(props, 'ид', 'id') || '';
        if (local) {
          path = parentPath ? parentPath + '.' + local : local;
          const entry = { kind: 'tab', path };
          if (!index[path]) index[path] = entry;
          if (!index[local]) index[local] = entry;
        }
      } else if (elem === ELEM.group) {
        local = split.id;
        if (local) path = parentPath ? parentPath + '.' + local : local;
      }

      this.meaningChildren(node).forEach(child => walk(child, path));
    };
    this.meaningChildren(formNode).forEach(child => walk(child, 'форма'));
    return index;
  }

  describeField(node, props, split) {
    const control = this.controlOf(split);
    const labelProp = propValue(props, 'лэйбл', 'подпись', 'метка');
    const label = String(labelProp === undefined ? textOf(node) : labelProp).trim();
    const local = split.id || propValue(props, 'ид', 'имя', 'name') || slug(label || 'поле');
    const dataType = propValue(props, 'тип-данных', 'тип') || '';
    const postfix = propValue(props, 'постфикс', 'единица') || '';
    return {
      kind: 'field',
      local,
      label,
      control,
      dataType,
      postfix,
      path: '',
      meta: {
        type: 'field',
        local,
        label,
        control,
        dataType,
        postfix,
        path: '',
      },
    };
  }

  controlOf(split) {
    const type = norm(String(split.type).replace(/\([^)]*\)/g, ''));
    if (CONTROL_BY_TYPE[type]) return CONTROL_BY_TYPE[type];
    const key = norm(split.key);
    if (key === 'выбор' || key === 'choice') return 'select';
    if (key === 'радио') return 'radio';
    if (key === 'флаг') return 'checkbox';
    return 'text';
  }

  controlOfNode(node) {
    return this.controlOf(this.splitKey(node));
  }


  nextUid() {
    this.uidCounter = (this.uidCounter || 0) + 1;
    return this.idPrefix + '-' + this.uidCounter;
  }

  place(ctx, local) {
    const scope = ctx.path || 'форма';
    const name = this.ids.take(scope, local || 'item');
    const segments = scope.split('.');
    if (segments[segments.length - 1] === name) {
      return { name, path: scope, uid: this.nextUid() };
    }
    return {
      name,
      path: scope === 'форма' ? name : scope + '.' + name,
      uid: this.nextUid(),
    };
  }

  localOf(node, split, props) {
    if (split.id) return split.id;
    const named = propValue(props, 'ид', 'имя', 'name');
    if (named) return slug(named);
    const label = propValue(props, 'лэйбл', 'подпись', 'метка');
    const text = label === undefined ? textOf(node) : label;
    if (text) return slug(text);
    if (split.key) return slug(split.key);
    return 'узел';
  }

  // Колонка узла: `.колонка правая` / `-- правая колонка` / `группа -- материалы`.
  columnOf(node) {
    const props = this.readProps(node);
    let raw = propValue(props, 'колонка', 'column');
    if (raw === undefined || raw === '') raw = markerTail(node && node.key);
    if (!raw) raw = markerTail(node && node.value);
    if (!raw) raw = ((node && node.comments) || []).map(item => String((item && item.value) || '')).join(' ');
    const name = String(raw || '').replace(/\s+--\s.*$/s, '').trim();
    if (!name) return null;

    const key = norm(name);
    let side = COLUMN_SIDE[key] || '';
    if (!side && /прав/.test(key)) side = 'right';
    if (!side && /лев/.test(key)) side = 'left';
    if (!side && /боков|side/.test(key)) side = 'side';
    if (!side && /центр|center/.test(key)) side = 'center';

    return {
      side: side || 'custom:' + slug(name),
      name: side ? COLUMN_NAME[side] : name,
      share: this.columnShareOf(node),
    };
  }

  columnShareOf(node) {
    const props = this.readProps(node);
    const raw = Number(propValue(props, 'доля', 'share'));
    if (!Number.isFinite(raw)) return 1;
    return Math.min(4, Math.max(1, Math.round(raw)));
  }


  convertNode(node, ctx) {
    const next = Object.assign({}, ctx, { depth: (ctx.depth || 0) + 1 });
    if (this.depthGuard(next)) return [];
    const elem = elementOf(node);

    let items;
    if (elem === ELEM.group) items = this.group(node, next);
    else if (elem === ELEM.field || elem === ELEM.choice) items = this.fieldNode(node, next);
    else if (elem === ELEM.note) items = this.note(node, next);
    else if (elem === ELEM.tabs) items = [this.tabs(node, next)];
    else if (elem === ELEM.button) {
      const button = this.button(node, next);
      items = button ? [button] : [];
    } else if (elem === ELEM.tab || elem === ELEM.option) {
      this.diagnose('warn', 'orphan',
        'Узел «' + (node.key || '?') + '» вне своего родителя — пропущен', next.path);
      items = [];
    } else {
      items = this.wrapper(node, next);
    }

    // `.код` узла — обработчик его DOM-события (см. `withHandler`).
    return this.withHandler(node, items, next);
  }

  wrapper(node, ctx) {
    const children = this.contentChildren(node);
    if (children.length) return this.convertListOf(children, ctx);

    const text = textOf(node);
    if (!text) return [];
    if (!this.unknownKeys) this.unknownKeys = Object.create(null);
    const key = norm(node.key);
    if (!this.unknownKeys[key]) {
      this.unknownKeys[key] = true;
      this.diagnose('info', 'unknown-element',
        'Неизвестный узел «' + (node.key || '?') + '» показан как надпись', ctx.path);
    }
    return [{ type: 'note', id: this.nextUid(), path: ctx.path, variant: 'text', text }];
  }

  convertChildren(node, ctx) {
    return this.convertListOf(this.contentChildren(node), ctx);
  }

  convertListOf(children, ctx) {
    const out = [];
    children.forEach(child => {
      this.convertNode(child, ctx).forEach(item => {
        const prev = out[out.length - 1];
        if (item.type === 'list' && prev && prev.type === 'list' &&
            prev.mergeKey && prev.mergeKey === item.mergeKey) {
          prev.rows = prev.rows.concat(item.rows);
          return;
        }
        out.push(item);
      });
    });
    return out;
  }


  group(node, ctx) {
    const split = this.splitKey(node);
    const props = this.readProps(node);
    const kind = GROUP_KIND[norm(String(split.type).replace(/\([^)]*\)/g, ''))] || '';
    if (kind === 'card') return [this.card(node, ctx, props, split)];
    if (kind === 'plate') return [this.plate(node, ctx, props, split)];
    if (kind === 'list') return [this.list(node, ctx, props, split)];
    if (kind === 'table') return [this.table(node, ctx, props, split)];
    return [this.plainGroup(node, ctx, props, split)];
  }

  card(node, ctx, props, split) {
    const place = this.place(ctx, this.localOf(node, split, props));
    const items = this.convertChildren(node, Object.assign({}, ctx, { path: place.path }));
    const dir = this.directionOf(props, items);
    const title = textOf(node) || propValue(props, 'заголовок', 'название') || '';
    const cls = String(propValue(props, 'класс', 'class') || '').trim()
      .replace(/[^a-zа-я0-9_\-\s]/gi, '');
    return {
      type: 'card',
      id: place.uid,
      local: place.name,
      path: place.path,
      title,
      containerClass: cls,
      direction: dir.direction,
      cols: dir.cols,
      items,
      actions: [],
    };
  }

  plainGroup(node, ctx, props, split) {
    const place = this.place(ctx, this.localOf(node, split, props, null));
    const items = this.convertChildren(node, Object.assign({}, ctx, { path: place.path }));
    const dir = this.directionOf(props, items);
    return {
      type: 'group',
      id: place.uid,
      path: place.path,
      title: textOf(node) || propValue(props, 'заголовок') || '',
      direction: dir.direction,
      cols: dir.cols,
      items,
    };
  }

  directionOf(props, items) {
    const raw = norm(propValue(props, 'направление', 'направление-вывода'));
    const flags = flagList(propValue(props, 'доп-функционал', 'флаги'));
    let direction = '';

    if (raw.indexOf('горизонт') >= 0 || raw === 'ряд' || flags.indexOf('ряд') >= 0) {
      direction = 'horizontal';
    } else if (raw.indexOf('вертик') >= 0 || raw === 'столбец' || raw === 'колонка') {
      direction = 'vertical';
    }

    if (!direction) {
      const dense = items.length > 1 && items.every(item =>
        item.type === 'field' || item.type === 'checkbox' || item.type === 'radio' ||
        item.type === 'select');
      direction = dense ? 'horizontal' : 'vertical';
    }

    const cols = Number(propValue(props, 'колонки', 'колонок', 'cols')) || 0;
    return { direction, cols };
  }

  /**
   * Плашка соответствий: пара «подпись — значение», только чтение.
   * Пустые значения не отражаются (см. notes/design/markup.txt).
   */
  plate(node, ctx, props, split) {
    const place = this.place(ctx, this.localOf(node, split, props, null));
    const rows = [];

    this.contentChildren(node).forEach(child => {
      const childSplit = this.splitKey(child);
      const childProps = this.readProps(child);
      const kind = norm(String(childSplit.type).replace(/\([^)]*\)/g, ''));
      const pair = this.pairOf(child, childProps);
      const total = TOTAL_KINDS.indexOf(kind) >= 0 || isTotalLabel(pair.label) ||
        hasFlag(childProps, ['флаги', 'доп-функционал'], 'итог');
      if (!pair.label && !pair.value) return;
      rows.push({ label: pair.label, value: pair.value, total });
    });

    return {
      type: 'plate',
      id: place.uid,
      path: place.path,
      title: textOf(node) || propValue(props, 'заголовок') || '',
      rows,
    };
  }

  list(node, ctx, props, split) {
    const place = this.place(ctx, this.localOf(node, split, props, null));
    const slots = [];

    this.contentChildren(node).forEach(child => {
      const childSplit = this.splitKey(child);
      const childProps = this.readProps(child);
      const pair = this.pairOf(child, childProps);
      if (!pair.label && !pair.value) return;
      slots.push({
        local: childSplit.id ||
          this.localOf(child, childSplit, childProps),
        label: pair.label,
        value: pair.value,
        ref: childSplit.ref || !pair.hasValue,
      });
    });

    return {
      type: 'list',
      id: place.uid,
      path: place.path,
      mergeKey: (ctx.path || '') + '#' + (split.id || ''),
      rows: slots.length ? [{ slots }] : [],
      template: null,
    };
  }

  // Редактируемая таблица: колонки из полей, строки добавляет рантайм.
  table(node, ctx, props, split) {
    const place = this.place(ctx, this.localOf(node, split, props, null));
    this.tableCounter = (this.tableCounter || 0) + 1;

    const columns = this.contentChildren(node).map(child => {
      const childSplit = this.splitKey(child);
      const childProps = this.readProps(child);
      const parts = this.fieldParts(child, childSplit, childProps);
      const control = this.controlOf(childSplit);
      const label = parts.label;
      return {
        local: childSplit.id || label ||
          this.localOf(child, childSplit, childProps),
        label,
        postfix: parts.postfix,
        control,
        inputType: INPUT_BY_CONTROL[control] || 'text',
        value: this.formatValue(parts.value, ''),
        mask: parts.mask,
        options: (control === 'select' || control === 'radio')
          ? this.readOptions(child)
          : [],
        checked: control === 'checkbox' ? isTruthy(parts.value) : false,
      };
    });

    return {
      type: 'table',
      id: place.uid,
      tableId: 'corr-' + this.tableCounter,
      path: place.path,
      title: textOf(node) || propValue(props, 'заголовок') || '',
      columns,
      rows: [],
    };
  }

  // Пара «подпись — значение» для плашки и списка.
  pairOf(node, props) {
    const labelProp = propValue(props, 'лэйбл', 'подпись', 'метка');
    const label = String(labelProp === undefined ? textOf(node) : labelProp).trim();
    const valueProp = propValue(props, 'значение', 'value');
    const postfixProp = propValue(props, 'постфикс', 'единица');
    return {
      label,
      value: this.formatValue(valueProp, postfixProp),
      hasValue: valueProp !== undefined,
    };
  }

  formatValue(value, postfix) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    if (!text || this.isMacro(text)) return '';
    const tail = String(postfix === undefined || postfix === null ? '' : postfix).trim();
    return tail ? text + ' ' + tail : text;
  }

  isMacro(text) {
    return /^\s*\(\(.*\)\)\s*$/.test(String(text || ''));
  }


  fieldNode(node, ctx) {
    const split = this.splitKey(node);
    const props = this.readProps(node);
    const control = this.controlOf(split);
    if (control === 'radio') return this.radio(node, ctx, split, props);
    if (control === 'checkbox') return [this.checkbox(node, ctx, split, props)];
    if (control === 'select') return [this.select(node, ctx, split, props)];
    return [this.input(node, ctx, split, props, control)];
  }

  // Общие части поля.
  fieldParts(node, split, props) {
    const labelProp = propValue(props, 'лэйбл', 'подпись', 'метка');
    const hintProp = propValue(props, 'плейсхолдер', 'подсказка', 'hint');
    const postfixProp = propValue(props, 'постфикс', 'единица');
    const control = this.controlOf(split);
    return {
      local: split.id || propValue(props, 'ид', 'имя', 'name') ||
        slug(labelProp === undefined ? (textOf(node) || 'поле') : labelProp),
      label: String(labelProp === undefined ? textOf(node) : labelProp).trim(),
      hint: hintProp === undefined ? '' : hintProp,
      postfix: postfixProp === undefined ? '' : postfixProp,
      required: propFlags(props, ['обязательный', 'обязательно', 'обяз', 'required']),
      value: propValue(props, 'значение', 'value'),
      dataType: propValue(props, 'тип-данных', 'тип') || '',
      clear: hasFlag(props, ['доп-функционал', 'флаги'], 'очистить'),
      full: hasFlag(props, ['доп-функционал', 'флаги'], 'полностью') ||
        /^(полностью|полная|full|100%)$/.test(norm(propValue(props, 'ширина', 'width'))),
      hook: propValue(props, 'хук', 'hook') || '',
      mask: MASK_BY_CONTROL[control] || '',
    };
  }

  input(node, ctx, split, props, control) {
    const parts = this.fieldParts(node, split, props);
    const place = this.place(ctx, parts.local);
    return {
      type: 'field',
      id: place.uid,
      path: place.path,
      name: this.nameOf(place.path),
      local: place.name,
      control,
      inputType: INPUT_BY_CONTROL[control] || 'text',
      label: parts.label,
      hint: parts.hint,
      postfix: parts.postfix,
      required: parts.required,
      value: parts.value === undefined ? '' : String(parts.value),
      dataType: parts.dataType,
      clear: parts.clear,
      full: parts.full,
      hook: parts.hook,
      mask: parts.mask,
    };
  }

  select(node, ctx, split, props) {
    const parts = this.fieldParts(node, split, props);
    const place = this.place(ctx, parts.local);
    return {
      type: 'select',
      id: place.uid,
      path: place.path,
      name: this.nameOf(place.path),
      local: place.name,
      label: parts.label,
      hint: parts.hint,
      required: parts.required,
      value: parts.value === undefined ? '' : String(parts.value),
      dataType: parts.dataType,
      clear: parts.clear,
      full: parts.full,
      options: this.readOptions(node),
    };
  }

  radio(node, ctx, split, props) {
    const parts = this.fieldParts(node, split, props);
    if (parts.local === 'поле' && !split.id) {
      const segments = String(ctx.path || '').split('.');
      const tail = segments[segments.length - 1];
      if (tail) parts.local = tail;
    }
    const place = this.place(ctx, parts.local);
    const name = this.nameOf(place.path);
    const options = this.readOptions(node);
    if (options.length && !options.some(option => option.checked)) options[0].checked = true;

    const control = {
      type: 'radio',
      id: place.uid,
      path: place.path,
      name,
      local: place.name,
      legend: parts.label,
      required: parts.required,
      options,
    };

    const blocks = [];
    this.contentChildren(node).forEach(child => {
      if (elementOf(child) !== ELEM.option) return;
      const kids = this.contentChildren(child);
      if (!kids.length) return;
      const childProps = this.readProps(child);
      const labelProp = propValue(childProps, 'представление', 'лэйбл', 'подпись');
      const label = labelProp === undefined ? textOf(child) : labelProp;
      const valueProp = propValue(childProps, 'значение', 'value');
      const value = valueProp === undefined ? label : valueProp;
      const items = this.convertListOf(kids, Object.assign({}, ctx, { path: place.path }));
      if (!items.length) return;
      blocks.push({
        type: 'block',
        id: this.nextUid(),
        path: place.path,
        when: { name, value: value || '' },
        items,
      });
    });

    return [control].concat(blocks);
  }

  checkbox(node, ctx, split, props) {
    const parts = this.fieldParts(node, split, props);
    const place = this.place(ctx, parts.local);
    return {
      type: 'checkbox',
      id: place.uid,
      path: place.path,
      name: this.nameOf(place.path),
      local: place.name,
      label: parts.label,
      required: parts.required,
      full: parts.full,
      value: parts.value === undefined || parts.value === '' ? 'да' : String(parts.value),
      checked: isTruthy(parts.value),
    };
  }

  nameOf(path) {
    return slug(String(path || '').replace(/\./g, '-'));
  }


  // Роль кнопки по свойствам: перенос `..источник`→`..приемник` — копирование записи, `.навигация` — переключение…
  buttonRoleOf(props) {
    const source = propValue(props, 'источник', 'откуда');
    const target = propValue(props, 'приемник', 'куда');
    if (source && target) return 'add-copy';
    const navigation = String(propValue(props, 'навигация', 'переход') || '');
    const tail = norm(navigation.split('.').pop());
    if (tail === 'добавить' || tail === 'форма' || tail === 'add' || tail === 'form') {
      return 'show-form';
    }
    if (tail === 'список' || tail === 'list') return 'back-to-list';
    return '';
  }

  button(node, ctx) {
    const split = this.splitKey(node);
    if (split.ref) return null;
    const props = this.readProps(node);

    const labelProp = propValue(props, 'подпись', 'лэйбл', 'текст');
    const label = String(labelProp === undefined ? textOf(node) : labelProp).trim();
    const navigation = propValue(props, 'навигация', 'переход') || '';
    const source = propValue(props, 'источник', 'откуда') || '';
    const target = propValue(props, 'приемник', 'куда') || '';
    const checks = this.refList(propValue(props, 'проверить', 'проверка'));
    const dialog = this.parseDialog(propValue(props, 'неуспех') ??
      propValue(props, 'диалог', 'сообщение'));
    const submit = propFlags(props, ['отправить', 'submit']) ||
      norm(split.type) === 'отправить' || norm(split.type) === 'submit' ||
      norm(propValue(props, 'вид', 'вид-кнопки')) === 'основная';
    const place = this.place(ctx, split.id || slug(label || 'кнопка'));

    return {
      type: 'button',
      id: place.uid,
      path: place.path,
      local: place.name,
      label: label || 'Кнопка',
      role: this.buttonRoleOf(props),
      kind: submit ? 'primary' : 'secondary',
      submit,
      navigation,
      source,
      target,
      checks,
      checkType: norm(propValue(props, 'тип-проверки', 'типпроверки')) || 'пусто',
      checkGoal: norm(propValue(props, 'цель-проверки', 'цельпроверки')) || '',
      dialog,
      clear: hasFlag(props, ['доп-функционал', 'флаги'], 'очистить'),
      // `.ui-action` нужен только проверкам и диалогам: навигацию и перенос разбирают роли (`show-form-btn`, `add-copy`,…
      action: !!(checks.length || dialog),
    };
  }

  autoButton(mode, label, path) {
    const role = mode === 'show-form-btn' ? 'show-form'
      : (mode === 'back-to-list' ? 'back-to-list' : (mode === 'add-copy' ? 'add-copy' : ''));
    return {
      type: 'button',
      id: this.nextUid(),
      path: path + '.' + mode,
      local: mode,
      label,
      role,
      kind: 'secondary',
      submit: false,
      auto: mode,
      navigation: '',
      source: '',
      target: '',
      checks: [],
      checkType: 'пусто',
      checkGoal: '',
      dialog: null,
      clear: false,
      action: false,
    };
  }

  parseDialog(raw) {
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const cut = text.lastIndexOf('/');
    if (cut < 0) return { message: text, ok: 'Ок' };
    const message = text.slice(0, cut).trim();
    const ok = text.slice(cut + 1).trim() || 'Ок';
    return message ? { message, ok } : null;
  }

  refList(value) {
    if (value === undefined || value === null) return [];
    const items = Array.isArray(value) ? value : String(value).split(/[,\s]+/);
    return items
      .map(item => String(item).trim().replace(/^#/, ''))
      .filter(Boolean);
  }


  note(node, ctx) {
    const split = this.splitKey(node);
    const props = this.readProps(node);
    const text = textOf(node) || propValue(props, 'текст', 'text', 'подпись') || '';
    if (!text) return [];
    return [{
      type: 'note',
      id: this.nextUid(),
      path: ctx.path,
      local: split.id || 'надпись',
      variant: NOTE_VARIANT[norm(split.type)] || 'text',
      text,
    }];
  }


  // `табы` — это два состояния одной карточки: список и форма добавления.
  tabs(node, ctx) {
    const split = this.splitKey(node);
    const props = this.readProps(node);
    const tabsId = split.id || propValue(props, 'ид', 'id') || 'табы';
    const place = this.place(ctx, slug(tabsId));
    const inner = Object.assign({}, ctx, { path: place.path });
    const items = [];

    this.contentChildren(node).forEach(child => {
      if (elementOf(child) !== ELEM.tab) return;
      // `.код` таба — обработчик его представления (см. `withHandler`).
      items.push(...this.withHandler(
        child, [this.tab(child, inner, items.length)], inner));
    });

    if (!items.length) {
      this.diagnose('warn', 'empty-tabs', 'В «табы» нет ни одного «таб»', place.path);
    }

    return { type: 'views', id: place.uid, path: place.path, local: place.name, items };
  }

  // Поля формы добавления плоские: контейнеры-группы разворачиваются, самостоятельные блоки (плашка, список, таблица)…
  flattenFields(children) {
    const out = [];
    const visit = list => list.forEach(child => {
      if (elementOf(child) !== ELEM.group) {
        out.push(child);
        return;
      }
      const split = this.splitKey(child);
      const kind = GROUP_KIND[norm(String(split.type).replace(/\([^)]*\)/g, ''))] || '';
      if (kind === 'plate' || kind === 'list' || kind === 'table') {
        out.push(child);
        return;
      }
      visit(this.contentChildren(child));
    });
    visit(children);
    return out;
  }

  // Таб: список (есть строки-соответствия), форма добавления (есть перенос `..источник` → `..приемник`) или панель по…
  tab(node, ctx, index) {
    const split = this.splitKey(node);
    const props = this.readProps(node);
    const local = split.id || propValue(props, 'ид', 'id') || 'таб-' + (index + 1);
    const place = this.place(ctx, slug(local));
    const children = this.contentChildren(node);
    const propsOf = child => this.readProps(child);

    const hasTransfer = children.some(child => elementOf(child) === ELEM.button &&
      this.buttonRoleOf(propsOf(child)) === 'add-copy');
    const hasList = children.some(child => elementOf(child) === ELEM.group &&
      GROUP_KIND[norm(String(this.splitKey(child).type).replace(/\([^)]*\)/g, ''))] === 'list');
    const kind = hasTransfer ? 'form' : (hasList ? 'list' : (index === 0 ? 'list' : 'form'));

    const inner = Object.assign({}, ctx, { path: place.path });
    const flat = kind === 'form' ? this.flattenFields(children) : children;

    let title = String(propValue(props, 'заголовок', 'заголовок-таба') || '');
    let noteIndex = -1;
    if (kind === 'form') {
      noteIndex = flat.findIndex(child => elementOf(child) === ELEM.note);
      if (noteIndex >= 0 && !title) title = textOf(flat[noteIndex]);
    }

    const hasClearFlag = node => hasFlag(this.readProps(node),
      ['доп-функционал', 'флаги'], 'очистить') ||
      this.contentChildren(node).some(hasClearFlag);
    const clear = hasClearFlag(node);

    const items = this.convertListOf(flat.filter((child, i) => i !== noteIndex), inner);

    if (kind === 'list') {
      const hasNav = flat.some(child => elementOf(child) === ELEM.button &&
        this.buttonRoleOf(propsOf(child)) === 'show-form');
      if (!hasNav) items.push(this.autoButton('show-form-btn', '+ Добавить', place.path));
    }

    if (kind === 'form') {
      const buttons = flat.filter(child => elementOf(child) === ELEM.button);
      const hasSubmit = buttons.some(child =>
        this.buttonRoleOf(propsOf(child)) === 'add-copy');
      const hasBack = buttons.some(child =>
        this.buttonRoleOf(propsOf(child)) === 'back-to-list');
      if (!hasSubmit) items.push(this.autoButton('add-copy', '+ Добавить ещё', place.path));
      if (!hasBack) items.push(this.autoButton('back-to-list', '← Назад к списку', place.path));
    }

    return {
      type: 'tab',
      id: place.uid,
      path: place.path,
      local: place.name,
      kind,
      title,
      clear,
      items,
    };
  }

  capitalize(text) {
    const value = String(text === undefined || text === null ? '' : text);
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  }
}
