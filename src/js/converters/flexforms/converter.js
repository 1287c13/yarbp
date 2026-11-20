// Порт конвертера формы-ТСД в редактор ЯРБП.
// target-ast-converter.js — конвертер AST ЯРБП → целевой IR формы (JSON).

export class YarbpFlexFormsConverter {
  static ROOT_NODE = 'MEANING';      // значимый узел AST
  static ROOT_TYPE = 'ROOT';         // корень AST
  static DIRECTIVE = 'DIRECTIVE';    // директива `! как аст`
  static OBJECT = 'OBJECT';          // составной узел со своими детьми
  static ARRAY = 'ARRAY';            // массивный узел
  static BOOL = 'BOOL';              // булев узел
  static STRING = 'STRING';
  static NUMBER = 'NUMBER';
  static NULL = 'NULL';
  static CODE = 'CODE';              // фрагмент кода: value — текст, language — язык

  static FORM_KEY = 'форма';         // корневой узел формы
  static GROUP_KEY = 'группа';       // анонимный контейнер: создаёт «поля»
  static OPERATION_KEY = 'операция'; // узел операции (действие с кнопкой)
  static FIELD_KEY = 'поле';         // узел поля ввода
  static FIELDS_KEY = 'поля';        // контейнер полей (значение по умолчанию)
  static CONTAINER_KEY = 'поля';     // тип контейнера, собираемого из «группы»
  static ARRAY_ITEM_PREFIX = ':';    // префикс позиционного элемента массива
  static ARRAY_PREFIX = '..';        // префикс массивного узла (`..имя`, `..опции`)
  static TYPE_KEY = 'type';          // ключ вида узла в целевом формате
  /**
   * Язык фрагмента кода (`valueType: CODE`) — второе свойство рядом с `код`.
   * Контракт расширения 1С (`kpp/docs/11-tsd-config.md`): `код` + `язык`, язык
   * в нижнем регистре (`bsl`). Ключ пишется только для фрагментов кода.
   */
  static LANGUAGE_KEY = 'язык';
  // Объектные узлы, которые остаются СВОЙСТВОМ родителя, а не его ребёнком.
  static OBJECT_PROPS = new Set(['обработчики']);
  static KIND_KEY = 'вид';           // вид поля (суффикс ключа `поле:<вид>`)
  // Вид поля, который в целевом формате пишется НЕ в «вид», а в «тип» (с заглавной буквы): `поле:штрихкод` →…
  static KIND_TO_TYPE = Object.freeze({ 'штрихкод': 'Штрихкод' });
  // Свойства, значение которых в целевом формате — МАССИВ (даже из одного элемента).
  static ARRAY_PROP_KEYS = Object.freeze([
    'приемник', 'значенияПриемниковПоУмолчанию', 'именаВИсточнике',
    'измерения', 'ресурсы', 'шапка', 'типы', 'именаВПриемнике',
    'проверятьЗаполнение',
  ]);
  static CHILDREN_KEY = 'children';  // ключ детей в целевом формате
  static VALUE_KEY = 'value';        // значение массивного узла разметки
  static NAME_KEY = 'имя';           // имя узла по умолчанию (вход и выход)
  static ID_KEY = 'ид';              // идентификатор узла по умолчанию
  static BUTTON_NAME_KEY = 'имяКнопки'; // подпись кнопки операции (2-е свойство)
  static TYPE_PROP_KEY = 'тип';      // «тип» поля (данные/вид) — не путать с `type`
  static OPTIONS_KEY = 'опции';      // массивный узел опций поля-«выбор»
  static TABLE_KEY = 'таблица';      // узел таблицы
  static OPERATION_TYPE = 'операция'; // тип узла операции (порядок свойств особый)
  // Узел «стили».
  static STYLES_KEY = 'стили';
  static ID_SEPARATOR = '/';         // разделитель «имя / идентификатор»
  static KEY_SEPARATOR = ':';        // разделитель «ключ / вид» в ключе разметки
  static PREFIX_CHARS = './:';       // пунктуация префиксов AST (не часть ключа)
  static YES = 'да';
  static NO = 'нет';
  // «Команда»-значение: одно слово (латиница или кириллица) — пишется с заглавной.
  static SCALAR_UPPER_RE = /^[a-zа-яё][a-zA-Zа-яёА-ЯЁ0-9]*$/;

  constructor(ast) {
    this.ast = this._parseInput(ast);
    this.result = null;
  }

  _parseInput(ast) {
    if (typeof ast === 'string') {
      const source = ast.replace(/^\uFEFF/, '').trim();
      if (!source) {
        throw new Error('YarbpFlexFormsConverter: пустой вход — ожидается AST в виде JSON-строки');
      }
      try {
        return JSON.parse(source);
      } catch (e) {
        throw new Error('YarbpFlexFormsConverter: вход не является корректным JSON — ' + e.message);
      }
    }
    if (ast && typeof ast === 'object') return ast;
    throw new Error('YarbpFlexFormsConverter: вход должен быть JSON-строкой или объектом AST');
  }

  convert() {
    this.result = this._applyDefaults(this._convertRoot(this.ast));
    return this.result;
  }

  // Значения по умолчанию для полей и операций.
  _applyDefaults(root) {
    const fields = new Map();
    const collect = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (node.type === 'поле' && node['ид'] !== undefined) {
        fields.set(String(node['ид']), node);
      }
      if (Array.isArray(node.children)) node.children.forEach(collect);
    };
    collect(root);

    const visit = (node) => {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map(visit);

      if (Array.isArray(node.children)) node.children = node.children.map(visit);

      if (node.type === 'операция') {
        if (node['имяКнопки'] === undefined) node['имяКнопки'] = node['имя'] || '';
        // В движке эти два флага проверяются через truthy, поэтому строковое «нет» означает то же, что и «да».
        if (node['очиститьФорму'] === undefined) node['очиститьФорму'] = YarbpFlexFormsConverter.YES;
        else if (node['очиститьФорму'] === YarbpFlexFormsConverter.NO) node['очиститьФорму'] = false;
        if (node['заголовокФормы'] === undefined) node['заголовокФормы'] = '';
        // «Перезагрузить» по умолчанию НЕ пишется: рантайм сам сбрасывает данные после действия с непустым `урл`, а ключ нужен…
        if (node['перезагрузить'] === YarbpFlexFormsConverter.NO) node['перезагрузить'] = false;
        // Табло «Позиций / Кол-во / Статус». По умолчанию включено (true в IR),
        // явное `.отображатьСтатистику нет` — false. Показывается всё равно
        // только у действий с внешним приёмником (непустой `урл`).
        if (node['отображатьСтатистику'] === undefined) node['отображатьСтатистику'] = true;
        else if (node['отображатьСтатистику'] === YarbpFlexFormsConverter.NO) {
          node['отображатьСтатистику'] = false;
        } else if (node['отображатьСтатистику'] === YarbpFlexFormsConverter.YES) {
          node['отображатьСтатистику'] = true;
        }
        return this._finishNode(node, { typeKey: YarbpFlexFormsConverter.OPERATION_TYPE });
      }

      if (node.type === 'поле') {
        const scanner = node['тип'] === 'Штрихкод' || node['вид'] === 'штрихкод';
        if (scanner) {
          if (node['кнопкаОчистки'] === undefined) node['кнопкаОчистки'] = YarbpFlexFormsConverter.YES;
          if (node['автофокус'] === undefined) node['автофокус'] = YarbpFlexFormsConverter.YES;
          if (node['режимСканирования'] === undefined) node['режимСканирования'] = 'суммироватьДоПереноса';
          if (node['значенияПриемниковПоУмолчанию'] === undefined && node['приемник'] !== undefined) {
            node['значенияПриемниковПоУмолчанию'] = this._asArray(node['приемник']).map(id => {
              const receiver = fields.get(String(id));
              return receiver && this._isNumericField(receiver)
                ? '1'
                : '';
            });
          }
        }
        return this._finishNode(node, { typeKey: node.type });
      }

      if (node.type === 'таблица') return this._finishNode(node, { typeKey: node.type });
      return node;
    };

    return visit(root);
  }

  _isNumericField(field) {
    return this._isNumericType(field && (field['вид'] || field['тип'] || ''));
  }

  toJSON(space) {
    const config = this.result === null ? this.convert() : this.result;
    return JSON.stringify(config, null, space === undefined ? 2 : space);
  }


  _convertRoot(ast) {
    if (this._nodeTypeOf(ast) === YarbpFlexFormsConverter.ROOT_TYPE) {
      const children = Array.isArray(ast.children) ? ast.children : [];
      const roots = children.filter(child => this._isMeaningNode(child));
      if (roots.length === 1) return this._convertNode(roots[0]);
      return { [YarbpFlexFormsConverter.CHILDREN_KEY]: roots.map(n => this._convertNode(n)) };
    }
    if (this._isMeaningNode(ast)) return this._convertNode(ast);
    throw new Error('YarbpFlexFormsConverter: в AST не найден корневой узел (ROOT/MEANING)');
  }


  _convertNode(node) {
    const key = this._cleanKey(node.key);
    const prefix = node.prefix || '';
    const hasKey = key !== '';

    // «Группа» — анонимный контейнер: узла не создаёт, содержимое едет вместе, чтобы родитель собрал из него подходящий…
    if (node.valueType === YarbpFlexFormsConverter.OBJECT && !hasKey &&
        prefix !== YarbpFlexFormsConverter.ARRAY_ITEM_PREFIX) {
      return { group: this._objectChildren(node) };
    }

    if (node.valueType === YarbpFlexFormsConverter.OBJECT) {
      return this._buildNode(this._headOf(node, key), this._objectChildren(node), node);
    }

    if (node.valueType === YarbpFlexFormsConverter.ARRAY) {
      const value = { [YarbpFlexFormsConverter.VALUE_KEY]: this._convertArrayNode(node) };
      return hasKey ? { name: key, value: value } : { value: value };
    }

    return { name: key, value: this._scalar(node) };
  }

  // «Паспорт» объектного узла: ключ разметки → {type, вид} целевого узла.
  _headOf(node, key) {
    const at = key.indexOf(YarbpFlexFormsConverter.KEY_SEPARATOR);
    const typeKey = at === -1 ? key : key.slice(0, at);
    const suffix = at === -1 ? null : key.slice(at + 1);
    const declared = node.type === undefined || node.type === null ? null : node.type;
    const kind = declared !== null ? declared : suffix;
    return {
      typeKey: typeKey,
      type: typeKey,
      kind: kind === null || kind === typeKey ? null : kind,
      value: node.value,
    };
  }

  // ARRAY-узел → массив значений: - скалярные элементы («..шапка Товар …», «..ресурсы Кол‑во») — строки, включая числа…
  _convertArrayNode(node) {
    const children = Array.isArray(node.children) ? node.children : [];
    return children
      .filter(child => this._isMeaningNode(child))
      .map(child => this._arrayItem(child));
  }

  _arrayItem(child) {
    if (child.valueType !== YarbpFlexFormsConverter.OBJECT) return this._scalar(child);
    const option = {};
    this._objectChildren(child).forEach(prop => {
      if (prop.name !== undefined) option[prop.name] = prop.value;
      // Фрагмент кода в строке-обработчике (`: .имяТипа … .код ```bsl …`): `язык` пишется сразу за `код`, иначе в…
      if (prop.code !== undefined) option[YarbpFlexFormsConverter.LANGUAGE_KEY] = prop.code;
    });
    return option;
  }

  // Узел «форма».
  _buildFormNode(node, head, plan) {
    node[YarbpFlexFormsConverter.TYPE_KEY] = head.type;
    if (head.kind) node[YarbpFlexFormsConverter.KIND_KEY] = head.kind;

    this._resolveName(node, plan.nameProp);
    this._resolveName(node, plan.pendingName);
    this._mergeArrayProps(node, plan.rest);

    const styles = this._stylesNode(plan);
    const children = styles ? [styles] : [];

    plan.groupProps.forEach(prop => {
      (prop.group || []).forEach(group => {
        children.push(this._containerNode(group, this._splitGroup(group)));
      });
    });

    plan.directNodes.forEach(item => {
      if (this._isStylesChild(item)) return;      // уже добавлен первым
      children.push(item);
    });
    plan.childNodes.forEach(item => {
      if (this._isStylesChild(item)) return;      // уже добавлен первым
      children.push(item);
    });
    this._mergeOwnChildren(node, children);
    return this._withTypeFirst(node);
  }

  // Узел «стили»: только если он явно описан в разметке.
  _stylesNode(plan) {
    const authored = (plan.childNodes || []).concat(plan.directNodes || [])
      .filter(item => this._isStylesChild(item))[0];
    if (!authored) return null;

    const styles = { [YarbpFlexFormsConverter.TYPE_KEY]: YarbpFlexFormsConverter.STYLES_KEY };
    Object.keys(authored).forEach(key => {
      if (key !== YarbpFlexFormsConverter.TYPE_KEY) styles[key] = authored[key];
    });
    return styles;
  }

  _isStylesChild(item) {
    const type = item && (item[YarbpFlexFormsConverter.TYPE_KEY] ||
      item[YarbpFlexFormsConverter.KIND_KEY]);
    return type === YarbpFlexFormsConverter.STYLES_KEY;
  }


  // Собирает целевой узел из «паспорта» узла и «сырых» свойств (key/value).
  _buildNode(head, rawProps, rawNode = null) {
    const plan = this._planProps(head, rawProps);
    const node = {};

    // Контейнер-свойство (`обработчики`): не узел IR, а значение ключа родителя.
    if (YarbpFlexFormsConverter.OBJECT_PROPS.has(head.typeKey)) {
      const children = [];
      plan.childNodes.forEach(item => children.push(item));
      this._mergeArrayProps(node, plan.rest);
      this._mergeOwnChildren(node, children);
      return node;
    }

    if (head.typeKey === YarbpFlexFormsConverter.FORM_KEY) {
      return this._buildFormNode(node, head, plan);
    }

    // «Группа» — контейнер полей: сам узлом не является, но её ключ в разметке задаёт тип контейнера «поля» (DSL: `группа…
    if (head.typeKey === YarbpFlexFormsConverter.GROUP_KEY) {
      return this._containerNode(null, this._splitGroup(rawProps));
    }

    if (head.typeKey === YarbpFlexFormsConverter.TABLE_KEY) {
      return this._buildTableNode(rawNode, head, plan);
    }

    node[YarbpFlexFormsConverter.TYPE_KEY] = head.type;

    // Вид: обычные виды («надпись», «число», «выбор») пишутся в «вид»; особые («штрихкод») — в «тип» с заглавной буквы и…
    const kindProp = this._kindProp(head.kind);
    Object.keys(kindProp).forEach(key => { node[key] = kindProp[key]; });

    // Группа-контейнер узла («операция» → «поля»): её свойства (сетка) уже подняты в plan.rest, дети собираются здесь в…
    const children = [];
    plan.groupProps.forEach(prop => {
      (prop.group || []).forEach(group => {
        const parts = this._splitGroup(group);
        children.push(this._containerNode(group, parts));
      });
    });

    this._resolveName(node, plan.nameProp);
    this._resolveName(node, plan.pendingName);

    this._takeOptions(plan, node);

    plan.childNodes.forEach(item => children.push(item));
    this._mergeArrayProps(node, plan.rest);
    this._mergeOwnChildren(node, children);

    return this._finishNode(node, head);
  }

  // Таблица в новом колоночном синтаксисе: таблица = Товары в заказе / a2_t1 .редактируемая да : .имя Товар .измерение…
  _buildTableNode(astNode, head, plan) {
    const table = { [YarbpFlexFormsConverter.TYPE_KEY]: YarbpFlexFormsConverter.TABLE_KEY };
    this._resolveName(table, plan.nameProp);
    this._resolveName(table, plan.pendingName);
    this._mergeArrayProps(table, plan.rest);

    const columns = this._tableColumns(astNode);
    if (columns.length) {
      ['измерения', 'ресурсы', 'шапка', 'именаВПриемнике', 'типы'].forEach(key => {
        delete table[key];
      });

      table['измерения'] = columns
        .filter(column => column.dimension)
        .map(column => column.label);
      table['ресурсы'] = columns
        .filter(column => !column.dimension)
        .map(column => column.label);
      table['шапка'] = columns.map(column => column.label);
      table['именаВПриемнике'] = columns.map(column => column.receiverName);
      table['типы'] = columns.map(column => column.type);
    } else {
      this._mergeOwnChildren(table, (plan.childNodes || []).slice());
    }

    return this._finishNode(table, head);
  }

  _tableColumns(astNode) {
    const children = Array.isArray(astNode && astNode.children) ? astNode.children : [];
    return children
      .filter(child => this._isMeaningNode(child) && this._isColumnNode(child))
      .map(child => {
        const props = {};
        (child.children || []).forEach(item => {
          if (this._isMeaningNode(item)) props[this._cleanKey(item.key)] = item;
        });

        const receiver = props['приемник'];
        const type = receiver && receiver.type ? String(receiver.type) : '';
        const receiverValue = receiver ? String(this._scalar(receiver)).trim() : '';
        const receiverName = receiverValue.replace(/^=\s*/, '');
        const label = props['имя'] ? String(this._scalar(props['имя'])) : receiverName;
        const explicitDimension = props['измерение']
          ? this._scalar(props['измерение']) === YarbpFlexFormsConverter.YES
          : null;

        return {
          label: label || receiverName,
          receiverName: receiverName || label,
          type,
          dimension: explicitDimension === null
            ? !this._isNumericType(type)
            : explicitDimension,
        };
      })
      .filter(column => column.label || column.receiverName || column.type);
  }

  _isColumnNode(node) {
    return this._isArrayItemNode(node);
  }

  _isNumericType(type) {
    return /^(число|целое|number|int|float|double|decimal)/i.test(String(type || '').trim());
  }

  // Замыкание узла (порядок ключей как в образце целевой разметки): - «type» — первым; - «вид» — перед `ид`/`имя`, если…
  _finishNode(node, head) {
    if (head && head.typeKey === YarbpFlexFormsConverter.TABLE_KEY &&
        node[YarbpFlexFormsConverter.CHILDREN_KEY] === undefined) {
      node[YarbpFlexFormsConverter.CHILDREN_KEY] = [];
    }
    if (head && head.typeKey === YarbpFlexFormsConverter.OPERATION_TYPE) {
      const { planned, keyed } = this._pickKeyedProps(node);
      return this._orderOperation(node, planned, keyed);
    }

    const reserved = [YarbpFlexFormsConverter.TYPE_KEY, YarbpFlexFormsConverter.KIND_KEY,
      YarbpFlexFormsConverter.ID_KEY, YarbpFlexFormsConverter.NAME_KEY];
    const authored = Object.keys(node).filter(key =>
      reserved.indexOf(key) === -1 && key !== YarbpFlexFormsConverter.CHILDREN_KEY &&
      key !== YarbpFlexFormsConverter.TYPE_PROP_KEY);

    const kind = node[YarbpFlexFormsConverter.KIND_KEY];
    const typeProp = node[YarbpFlexFormsConverter.TYPE_PROP_KEY];
    // «Вид» встаёт перед «ид»/«имя», если у узла есть авторские свойства помимо «ид»/«имя»/«тип» (`поле:выбор` с `.тип`) —…
    const kindFirst = kind !== undefined &&
      (authored.length > 0 || typeProp !== undefined);

    const out = {};
    const put = (key) => {
      if (node[key] === undefined) return;
      if (out[key] === undefined) out[key] = node[key];
    };

    put(YarbpFlexFormsConverter.TYPE_KEY);
    if (kindFirst) put(YarbpFlexFormsConverter.KIND_KEY);
    put(YarbpFlexFormsConverter.ID_KEY);
    put(YarbpFlexFormsConverter.NAME_KEY);
    authored.forEach(key => {
      put(key);
      if (typeProp !== undefined && key === YarbpFlexFormsConverter.SCANNER_TYPE_AFTER) {
        put(YarbpFlexFormsConverter.TYPE_PROP_KEY);
      }
    });
    put(YarbpFlexFormsConverter.TYPE_PROP_KEY);
    put(YarbpFlexFormsConverter.KIND_KEY);
    if (node[YarbpFlexFormsConverter.CHILDREN_KEY] !== undefined) {
      out[YarbpFlexFormsConverter.CHILDREN_KEY] = node[YarbpFlexFormsConverter.CHILDREN_KEY];
    }
    return out;
  }

  // Делит свойства узла на «массивы-свойства» (keyed: `..проверятьЗаполнение`, `..приемник`, `..шапка`, …) и прочие,…
  _pickKeyedProps(node) {
    const planned = {};
    const keyed = [];
    Object.keys(node).forEach(key => {
      const value = node[key];
      if (key === YarbpFlexFormsConverter.CHILDREN_KEY) return;
      if (Array.isArray(value) && !value.some(item => item && typeof item === 'object')) {
        keyed.push(key);
        return;
      }
      planned[key] = value;
    });
    return { planned: planned, keyed: keyed };
  }

  _kindProp(kind) {
    if (!kind) return {};
    const mapped = YarbpFlexFormsConverter.KIND_TO_TYPE[kind];
    if (mapped !== undefined) return { [YarbpFlexFormsConverter.TYPE_PROP_KEY]: mapped };
    return { [YarbpFlexFormsConverter.KIND_KEY]: kind };
  }

  // «..опции» — не свойство узла, а его дети: целевой формат пишет опции элементами `children` без собственного «type»…
  _takeOptions(plan, node) {
    const opts = plan.rest[YarbpFlexFormsConverter.OPTIONS_KEY];
    if (opts === undefined) return;
    delete plan.rest[YarbpFlexFormsConverter.OPTIONS_KEY];
    const items = this._asArray(opts);
    node[YarbpFlexFormsConverter.CHILDREN_KEY] = items.concat(
      this._asArray(node[YarbpFlexFormsConverter.CHILDREN_KEY]));
  }

  // Канонический порядок свойств узла из схемы языка (`fpmlEditorGlobals.syntaxTree`).
  static SCHEMA_ORDER = Object.freeze({
    'поле': [
      'вид', 'ид', 'имя', 'тип', 'кнопкаОчистки', 'автофокус', 'приемник',
      'хук', 'значенияПриемниковПоУмолчанию', 'именаВИсточнике', 'поискПо',
      'объектДляПоиска', 'вызывать', 'режимСканирования',
    ],
    'операция': [
      'имя', 'имяКнопки', 'очиститьФорму', 'приемник', 'заголовокФормы', 'ид',
      'проверятьЗаполнение', 'урл', 'перезагрузить', 'отображатьСтатистику',
    ],
    'таблица': [
      'ид', 'имя', 'редактируемая', 'измерения', 'ресурсы', 'шапка',
      'именаВПриемнике', 'типы',
    ],
    'стили': ['обводка', 'поля', 'фон', 'фокус', 'кнопка', 'текст'],
  });

  // Свойство схемы, ПОСЛЕ которого рантайм ждёт «тип» сканер-поля: синтезированный «тип» (`поле:штрихкод`) встаёт сразу…
  static SCANNER_TYPE_AFTER = 'хук';

  // Порядок свойств операции в целевом формате (эмпирический, из образца): type, имя, имяКнопки, <массивы-свойства>, ид,…
  _orderOperation(node, rest, keyed) {
    const out = {};
    const put = (key, value) => {
      if (value === undefined) return;
      if (out[key] === undefined) out[key] = value;
    };

    put(YarbpFlexFormsConverter.TYPE_KEY, node[YarbpFlexFormsConverter.TYPE_KEY]);
    put(YarbpFlexFormsConverter.NAME_KEY, node[YarbpFlexFormsConverter.NAME_KEY]);
    put(YarbpFlexFormsConverter.BUTTON_NAME_KEY, node[YarbpFlexFormsConverter.BUTTON_NAME_KEY]);
    keyed.forEach(key => put(key, rest[key] || node[key]));
    if (keyed.length) put(YarbpFlexFormsConverter.ID_KEY, node[YarbpFlexFormsConverter.ID_KEY]);

    Object.keys(rest).forEach(key => put(key, rest[key]));
    put(YarbpFlexFormsConverter.ID_KEY, node[YarbpFlexFormsConverter.ID_KEY]);
    Object.keys(node).forEach(key => {
      if (key === YarbpFlexFormsConverter.CHILDREN_KEY) return;
      put(key, node[key]);
    });
    if (node[YarbpFlexFormsConverter.CHILDREN_KEY] !== undefined) {
      out[YarbpFlexFormsConverter.CHILDREN_KEY] = node[YarbpFlexFormsConverter.CHILDREN_KEY];
    }
    return out;
  }

  _childrenAfterProps(node) {
    if (node[YarbpFlexFormsConverter.CHILDREN_KEY] === undefined) return node;
    const out = {};
    Object.keys(node).forEach(key => {
      if (key === YarbpFlexFormsConverter.CHILDREN_KEY) return;
      out[key] = node[key];
    });
    out[YarbpFlexFormsConverter.CHILDREN_KEY] = node[YarbpFlexFormsConverter.CHILDREN_KEY];
    return out;
  }

  _minusProps(rest, props) {
    const out = {};
    Object.keys(rest).forEach(key => { out[key] = rest[key]; });
    (props || []).forEach(prop => { delete out[prop.key]; });
    return out;
  }

  // Имя узла. Источники по приоритету: 1) явное свойство «имя» (блок-строка массива «: .значение … .имя …»); 2) пара…
  _resolveName(node, nameProp) {
    if (!nameProp || nameProp.key === null) return;
    node[nameProp.key] = nameProp.value;
  }

  // «Сырые» свойства узла → план сборки: rest — собственные свойства узла, ещё не разложенные по местам; props — те же…
  _planProps(head, rawProps) {
    const plan = {
      rest: {},
      props: [],
      childNodes: [],
      groupProps: [],
      directNodes: [],
      arrayProps: {},
      container: null,
      containerNodes: [],
      containerProps: null,
      nameProp: { key: null, value: undefined },
      pendingName: undefined,
    };
    (rawProps || []).forEach(prop => this._planProp(plan, head, prop));
    this._splitNameProp(plan, head.value);
    return plan;
  }

  _planProp(plan, head, prop) {
    if (prop.group) {
      plan.groupProps.push(prop);
      this._planGroupProp(plan, head, prop.group);
      return;
    }
    if (prop.node) {
      plan.childNodes.push(prop.node);
      return;
    }
    // Массивный узел-ребёнок: массив С ИМЕНЕМ («..приемник», «..шапка») — это свойство-массив узла; массив БЕЗ имени…
    if (prop.array === true) {
      const items = prop.value[YarbpFlexFormsConverter.VALUE_KEY];
      if (prop.name !== undefined) {
        // Значения массивного узла (`..ключ`) остаются массивом даже из одного элемента: массивность задана разметкой, а не…
        items.multi = true;
        this._addProp(plan.rest, prop.name, items);
        plan.props.push({ name: prop.name, value: items });
        return;
      }
      items.forEach(item => plan.childNodes.push(item));
      return;
    }
    if (prop.name === undefined) {
      if (prop.value !== undefined) plan.childNodes.push(prop.value);
      return;
    }
    if (prop.name === YarbpFlexFormsConverter.NAME_KEY) {
      this._planNameProp(plan, prop.value);
      return;
    }
    // «Команда»-значение подписи кнопки: в разметке строчными (`.имяКнопки отправить`), в целевом формате — заголовком…
    if (prop.name === YarbpFlexFormsConverter.BUTTON_NAME_KEY) {
      const value = this._command(prop.value);
      this._addProp(plan.rest, prop.name, value);
      plan.props.push({ name: prop.name, value: value });
      return;
    }
    // Фрагмент кода (`valueType: CODE`) — два свойства подряд: текст и язык.
    // Порядок важен: контракт расширения ждёт `код`, сразу за ним `язык`.
    if (prop.code !== undefined) {
      this._addProp(plan.rest, prop.name, prop.value);
      plan.props.push({ name: prop.name, value: prop.value });
      this._addProp(plan.rest, YarbpFlexFormsConverter.LANGUAGE_KEY, prop.code);
      plan.props.push({ name: YarbpFlexFormsConverter.LANGUAGE_KEY, value: prop.code });
      return;
    }
    this._addProp(plan.rest, prop.name, prop.value);
    plan.props.push({ name: prop.name, value: prop.value });
  }

  // Значение-«команда» (одно слово — латиница или кириллица, целиком строчными): пишется с заглавной буквы, как…
  _command(value) {
    if (typeof value !== 'string') return value;
    if (!YarbpFlexFormsConverter.SCALAR_UPPER_RE.test(value)) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // «Группа» в детях узла.
  _planGroupProp(plan, head, group) {
    this._splitGroup(group).props.forEach(prop => {
      this._addProp(plan.rest, prop.name, prop.value);
    });
  }

  _containerChildren(parts) {
    const nodes = [];
    parts.children.forEach(node => nodes.push(node));
    parts.direct.forEach(items => items.forEach(item => nodes.push(item)));
    parts.groups.forEach(group => {
      nodes.push(this._containerNode(group, this._splitGroup(group)));
    });
    return nodes;
  }

  _containerNode(group, parts, override) {
    const type = override && override.type
      ? override.type : YarbpFlexFormsConverter.CONTAINER_KEY;
    const node = { [YarbpFlexFormsConverter.TYPE_KEY]: type };
    this._mergeArrayProps(node, this._containerProps(parts.props));
    const children = this._containerChildren(parts);
    // Контейнер группы целевой формат пишет как `{type, сетка, children}` — «children» есть всегда, даже пустой: это сетка…
    node[YarbpFlexFormsConverter.CHILDREN_KEY] = children;
    return node;
  }

  _planNameProp(plan, value) {
    if (plan.nameProp.key === null) {
      plan.nameProp = { key: YarbpFlexFormsConverter.NAME_KEY, value: value };
    } else {
      this._addProp(plan.rest, YarbpFlexFormsConverter.NAME_KEY, value);
    }
    this._addProp(plan.arrayProps, YarbpFlexFormsConverter.NAME_KEY, [value]);
    plan.props.push({ name: YarbpFlexFormsConverter.NAME_KEY, value: value });
  }

  _splitNameProp(plan, value) {
    if (plan.nameProp.key !== null || typeof value !== 'string' ||
        value.indexOf(YarbpFlexFormsConverter.ID_SEPARATOR) === -1) {
      if (plan.pendingName !== undefined) {
        this._addProp(plan.rest, YarbpFlexFormsConverter.NAME_KEY, plan.pendingName);
      }
      return;
    }
    const pair = this._splitName(value);
    if (pair.id !== '') this._addProp(plan.rest, YarbpFlexFormsConverter.ID_KEY, pair.id);
    if (pair.name !== '') {
      plan.nameProp = { key: YarbpFlexFormsConverter.NAME_KEY, value: pair.name };
    }
    if (plan.pendingName !== undefined) {
      this._addProp(plan.rest, YarbpFlexFormsConverter.NAME_KEY, plan.pendingName);
    }
  }

  _addProp(target, name, value) {
    if (target[name] === undefined) {
      target[name] = Array.isArray(value) ? value : [value];
      return;
    }
    if (Array.isArray(value)) target[name] = target[name].concat(value);
    else target[name].push(value);
  }

  // Значение свойства узла.
  _mergeArrayProps(node, arrayProps) {
    Object.keys(arrayProps).forEach(key => {
      const list = arrayProps[key];
      const single = list.length === 1 && !Array.isArray(list[0]);
      if (single && node[key] !== undefined) return;   // имя узла уже записано
      if (node[key] === undefined) {
        node[key] = single && !list.multi ? list[0] : list;
        return;
      }
      // «имя» бывает и опцией (..имя), и именем узла: одноимённые значения собираются в один массив.
      const was = Array.isArray(node[key]) ? node[key] : [node[key]];
      node[key] = was.concat(list);
    });
  }

  _mergeOwnChildren(node, children) {
    const key = YarbpFlexFormsConverter.CHILDREN_KEY;
    if (!children.length) return;
    if (node[key] === undefined) {
      node[key] = children;
      return;
    }
    node[key] = this._asArray(node[key]).concat(children);
  }

  _asArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }


  // Разбивает содержимое «группы»: свойства, узлы-дети и вложенные группы.
  _splitGroup(props) {
    const list = props || [];
    return {
      props: list.filter(prop => prop.name !== undefined),
      groups: list.filter(prop => !!prop.group).map(prop => prop.group),
      children: list.filter(prop => prop.name === undefined && prop.node !== undefined)
        .map(prop => prop.node)
        .concat(list.filter(prop => prop.name === undefined && prop.value !== undefined)
          .map(prop => prop.value)),
      direct: list.filter(prop => prop.name === undefined && prop.array === true)
        .map(prop => prop.value[YarbpFlexFormsConverter.VALUE_KEY]),
    };
  }

  _containerProps(props) {
    const out = {};
    (props || []).forEach(prop => this._addProp(out, prop.name, prop.value));
    return out;
  }

  _withTypeFirst(node) {
    const keys = Object.keys(node);
    if (keys.length < 2 || keys[1] === undefined ||
        keys.indexOf(YarbpFlexFormsConverter.TYPE_KEY) === -1) {
      return node;
    }
    const ordered = {};
    ordered[YarbpFlexFormsConverter.TYPE_KEY] = node[YarbpFlexFormsConverter.TYPE_KEY];
    keys.forEach(key => {
      if (key !== YarbpFlexFormsConverter.TYPE_KEY) ordered[key] = node[key];
    });
    return ordered;
  }


  // Дети AST-узла → список «сырых свойств»: { name, value } — свойство родителя (ключ без пунктуации); { array: true,…
  _objectChildren(node) {
    const nodes = Array.isArray(node.children) ? node.children : [];
    return this._collect(nodes);
  }

  _collect(nodes) {
    const result = [];

    nodes.forEach(child => {
      if (!this._isMeaningNode(child)) return;

      const key = this._cleanKey(child.key);
      // Позиционный элемент массива (`:`) описывает не свойство, а строку:
      // его разбирает сам массив (_convertArrayNode), здесь он не нужен.
      if (key === YarbpFlexFormsConverter.ARRAY_ITEM_PREFIX) return;

      const converted = this._convertNode(child);
      if (converted === null) return;
      result.push(this._asProp(key, child, converted));
    });

    return result;
  }

  // «Сырое свойство» из узла AST: ключ — уже без префикса, значение — по виду.
  _asProp(key, child, converted) {
    if (converted.group) return converted;                      // «группа» — как есть
    if (child.valueType === YarbpFlexFormsConverter.ARRAY) {
      return { name: key === '' ? undefined : key, value: converted.value, array: true };
    }
    if (key === '') return converted;                           // узел без имени → children
    // Фрагмент кода (`valueType: CODE`) — свойство плюс язык. Язык по умолчанию
    // `bsl`: контракт расширения ждёт BSL, а fence без языка — это тот же код.
    if (child.valueType === YarbpFlexFormsConverter.CODE) {
      const language = child.language === undefined || child.language === null || child.language === ''
        ? 'bsl'
        : String(child.language).toLowerCase();
      return { name: key, value: converted.value, code: language };
    }
    if (child.valueType !== YarbpFlexFormsConverter.OBJECT) {
      return { name: key, value: converted.value };
    }
    // Объектный узел с ключом: контейнер-свойство (`обработчики`) остаётся свойством родителя, остальные («операция»,…
    if (YarbpFlexFormsConverter.OBJECT_PROPS.has(key)) {
      return { name: key, value: converted };
    }
    return { node: converted };
  }


  // Значение скалярного узла (bool → 'да'/'нет', число/строка — как есть).
  _scalar(node) {
    if (node.valueType === YarbpFlexFormsConverter.BOOL) {
      return node.value ? YarbpFlexFormsConverter.YES : YarbpFlexFormsConverter.NO;
    }
    if (node.valueType === YarbpFlexFormsConverter.NULL) return '';
    const value = node.value === undefined ? '' : node.value;
    // Числа в целевом формате тоже строки: `..значенияПриемниковПоУмолчанию 1` даёт элемент `"1"` (рантайм клеит массив…
    return typeof value === 'number' ? String(value) : value;
  }

  _value(node) {
    switch (node.valueType) {
      case YarbpFlexFormsConverter.OBJECT:
        return this._buildNode(this._headOf(node, this._cleanKey(node.key)),
                               this._objectChildren(node), node);
      case YarbpFlexFormsConverter.ARRAY:
        return this._convertArrayNode(node);
      default:
        return this._scalar(node);
    }
  }


  _isMeaningNode(node) {
    return !!node && typeof node === 'object' &&
      (!node.nodeType || node.nodeType === YarbpFlexFormsConverter.ROOT_NODE);
  }

  _isArrayItemNode(node) {
    return this._cleanKey(node.key) === '' &&
      (node.prefix || '') === YarbpFlexFormsConverter.ARRAY_ITEM_PREFIX;
  }

  _nodeTypeOf(node) {
    return node && typeof node === 'object' ? node.nodeType : undefined;
  }

  _cleanKey(key) {
    if (key === undefined || key === null) return '';
    return String(key).replace(/^[.:]+/, '');
  }

  _splitName(value) {
    if (value === undefined || value === null) return { name: '', id: '' };
    if (typeof value !== 'string') return { name: value, id: '' };
    const at = value.indexOf(YarbpFlexFormsConverter.ID_SEPARATOR);
    if (at === -1) return { name: value.trim(), id: '' };
    return {
      name: value.slice(0, at).trim(),
      id: value.slice(at + 1).trim(),
    };
  }
}



export default YarbpFlexFormsConverter;
