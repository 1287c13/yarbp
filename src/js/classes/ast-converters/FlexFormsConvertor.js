/* Порт в редактор ЯРБП: редизайн/задача-замена-целевого-формата/target-ast-converter.js.
   Алгоритм перенесён дословно: изменены только имя класса (YarbpFlexFormsConverter),
   строка подключения в примере и это пояснение. Описание формата ниже — из первоисточника. */
/* ============================================================================
 * target-ast-converter.js — конвертер AST ЯРБП → целевой IR формы (JSON).
 *
 * Чистый JS-модуль, без зависимостей, без I/O и без данных:
 *   вход  — строка с JSON-представлением AST (или уже готовый объект AST);
 *   выход — строка с JSON-представлением целевого конфига формы.
 * Класс не знает ничего о файлах, сети и окружении.
 *
 * Подключение — обычный ES-модуль:
 *   import { YarbpFlexFormsConverter } from 'yarbp/src/js/classes/ast-converters/FlexFormsConvertor.js';
 *
 * Использование:
 *   const json = new YarbpFlexFormsConverter(astString).toJSON(2);
 *
 * Формат входа (то, что отдаёт парсер ЯРБП, см. YarbpParser/nodeTypes):
 *   { nodeType:'ROOT', directives:[{nodeType:'DIRECTIVE', value:'как аст'}],
 *     children:[ { nodeType:'MEANING', key:'форма', valueType:'OBJECT', prefix:'',
 *                  children:[ {nodeType:'MEANING', key:'операция', valueType:'OBJECT',
 *                              value:'Подобрать товар / a_1', children:[ … ]}, … ]} ] }
 * Данные конвертации берутся только из полей AST: nodeType, key, type, prefix,
 * valueType, value, children. Поля «position» и «directives» игнорируются.
 *
 * Смысл ключа (две роли, как в самом DSL):
 *   - ключ БЕЗ суффикса-двоеточия задаёт структуру: `форма` → `type:'форма'`,
 *     `операция` → `type:'операция'`, `таблица` → `type:'таблица'`, `группа` —
 *     анонимный контейнер, `поле` → `type:'поле'` (если вид в суффиксе не задан);
 *   - ключ С суффиксом-двоеточием задаёт ВИД узла: `поле:штрихкод` →
 *     `type:'поле', вид:'штрихкод'`, `поле:выбор` → `type:'поле', вид:'выбор'`.
 *     Исключение — суффикс, совпадающий с ключом (`поле:поле`): вид не пишется.
 *   Без суффикса вид не появляется вовсе: `таблица` — это `type:'таблица'`,
 *   а не «вид таблица».
 *
 * Правила конвертации (без хардкода данных — только имена полей DSL и значения
 * вроде 'да'/'нет', которыми оперирует рантайм формы):
 *
 *   1. Значение объектного узла разбирается как «имя / идентификатор»:
 *      «Подобрать товар / a_1» → имя='Подобрать товар', ид='a_1'.
 *      Если разделителя нет — всё уходит в имя (ид не появляется),
 *      если левая часть пуста — остаётся только ид.
 *
 *   2. Объектный узел (valueType OBJECT) становится узлом вывода:
 *      { type: <ключ узла>, …вид и свойства из его детей…, children: [ … ] }.
 *
 *   3. Узел со скалярным значением становится свойством родителя:
 *      имя свойства — его ключ (без пунктуации префикса '.', '..', ':'),
 *      значение — само значение. Повторяющиеся ключи собираются в массив
 *      (единый приём для шапка/типы/измерения/приемник/…).
 *
 *   4. Анонимный контейнер «группа» не создаёт узел: он описывает контейнер
 *      целевого формата — `{ type:'поля', <сетка и прочие свойства>,
 *      children:[ <поля и таблицы> ] }`. Группа — это контейнер, а не
 *      «прозрачная» обёртка: её дети принадлежат контейнеру, а не узлу-владельцу.
 *      Анонимный объект с префиксом «:» (строки-опции, описанные блоками
 *      «: .значение … .имя …») становится элементом массива: значением
 *      массивного свойства, если он лежит среди его детей, иначе — элементом
 *      children родителя.
 *
 *   5. Узел «стили» — первый ребёнок формы (словарь DSL: `форма.children =
 *      ['стили', 'операция']`, см. yarbp/docs/flex-forms-dsl.md §3, §4.2, §8.2).
 *      Если стили описаны в разметке явным узлом — они переносятся как есть;
 *      если их нет, целевой формат всё равно требует этот узел, поэтому он
 *      собирается из ЗНАЧЕНИЙ СХЕМЫ DSL по умолчанию (STYLE_DEFAULTS) — это
 *      словарь языка, а не данные конкретной формы. Значения, заданные в
 *      разметке, перекрывают умолчания.
 *
 *   6. Значения приводятся по значению, а не по имени ключа:
 *      - булевы узлы (valueType BOOL) → 'да'/'нет' (формат флагов рантайма);
 *      - массивы (valueType ARRAY) → массив значений, вложенные структуры
 *        внутри массива сохраняются как объекты (опции выпадающего списка);
 *      - пустой массив детей → пустой массив (а не исчезнувшее свойство).
 *
 *   6. «Стили» в разметке не описаны, но присутствуют в целевом конфиге.
 *      Конвертер не выдумывает данные: узел «стили» собирается из атрибутов
 *      формы, имена которых совпадают с именами атрибутов стилей
 *      (.обводка/.поля/.фон/.фокус/.кнопка/.текст) — так описано в DSL
 *      (yarbp/docs/flex-forms-dsl.md §8.1). Нет таких атрибутов — нет узла.
 *
 * Проверка: см. ast_to_target.py (пример «файл → файл» во внешней обёртке).
 * ==========================================================================*/

export class YarbpFlexFormsConverter {
  /* --- Имена служебных узлов/полей разметки (это словарь DSL, не данные) --- */
  static ROOT_NODE = 'MEANING';      // значимый узел AST
  static ROOT_TYPE = 'ROOT';         // корень AST
  static DIRECTIVE = 'DIRECTIVE';    // директива `! как аст`
  static OBJECT = 'OBJECT';          // составной узел со своими детьми
  static ARRAY = 'ARRAY';            // массивный узел
  static BOOL = 'BOOL';              // булев узел
  static STRING = 'STRING';
  static NUMBER = 'NUMBER';
  static NULL = 'NULL';

  static FORM_KEY = 'форма';         // корневой узел формы
  static GROUP_KEY = 'группа';       // анонимный контейнер: создаёт «поля»
  static OPERATION_KEY = 'операция'; // узел операции (действие с кнопкой)
  static FIELD_KEY = 'поле';         // узел поля ввода
  static FIELDS_KEY = 'поля';        // контейнер полей (значение по умолчанию)
  static CONTAINER_KEY = 'поля';     // тип контейнера, собираемого из «группы»
  static ARRAY_ITEM_PREFIX = ':';    // префикс позиционного элемента массива
  static ARRAY_PREFIX = '..';        // префикс массивного узла (`..имя`, `..опции`)
  static TYPE_KEY = 'type';          // ключ вида узла в целевом формате
  static KIND_KEY = 'вид';           // вид поля (суффикс ключа `поле:<вид>`)
  /**
   * Вид поля, который в целевом формате пишется НЕ в «вид», а в «тип»
   * (с заглавной буквы): `поле:штрихкод` → `"тип":"Штрихкод"`, без «вид».
   * Это словарь DSL: штрихкод — не вид виджета, а тип поля (режим сканирования),
   * поэтому рантайм читает его из свойства «тип».
   */
  static KIND_TO_TYPE = Object.freeze({ 'штрихкод': 'Штрихкод' });
  /**
   * Свойства, значение которых в целевом формате — МАССИВ (даже из одного
   * элемента). Словарь DSL: §4.5 (позиционные массивы сканер-поля), §4.6
   * (измерения/ресурсы/шапка/типы/именаВПриемнике таблицы), §4.3 (приемник и
   * проверятьЗаполнение операции). Значения собираются из «..ключ» узлов
   * разметки; одиночное значение остаётся массивом, а не скаляром.
   */
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
  /**
   * Узел «стили»: имя узла и умолчания его свойств из СЛОВАРЯ DSL
   * (flex-forms-legacy/constructor.html, fpmlEditorGlobals.syntaxTree.стили).
   * Это декларация языка, а не данные формы: разметка может вовсе не писать
   * «стили», но целевой формат требует этот узел первым ребёнком формы.
   */
  static STYLES_KEY = 'стили';
  static STYLE_DEFAULTS = Object.freeze({
    'обводка': 'CECECE',
    'поля': 'FFFFFF',
    'фон': 'EEEEEE',
    'фокус': 'CFEF1A',
    'кнопка': 'CFEF1A',
    'текст': '000000',
  });
  static ID_SEPARATOR = '/';         // разделитель «имя / идентификатор»
  static KEY_SEPARATOR = ':';        // разделитель «ключ / вид» в ключе разметки
  static PREFIX_CHARS = './:';       // пунктуация префиксов AST (не часть ключа)
  static YES = 'да';
  static NO = 'нет';
  // «Команда»-значение: одно слово (латиница или кириллица) — пишется с заглавной.
  // В разметке такая команда пишется строчными (`.имяКнопки отправить`), а
  // целевой формат ждёт вид заголовка (`"Отправить"`), как и исходное слово.
  static SCALAR_UPPER_RE = /^[a-zа-яё][a-zA-Zа-яёА-ЯЁ0-9]*$/;

  constructor(ast) {
    this.ast = this._parseInput(ast);
    this.result = null;
  }

  /** Строка с JSON / готовый AST → объект AST. */
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

  /** AST → целевой конфиг (объект). Основная точка входа. */
  convert() {
    this.result = this._convertRoot(this.ast);
    return this.result;
  }

  /** AST → целевой конфиг (JSON-строка). */
  toJSON(space) {
    const config = this.result === null ? this.convert() : this.result;
    return JSON.stringify(config, null, space === undefined ? 2 : space);
  }

  /* ====================================================================== */
  /* Корень документа                                                       */
  /* ====================================================================== */

  _convertRoot(ast) {
    if (this._nodeTypeOf(ast) === YarbpFlexFormsConverter.ROOT_TYPE) {
      const children = Array.isArray(ast.children) ? ast.children : [];
      const roots = children.filter(child => this._isMeaningNode(child));
      if (roots.length === 1) return this._convertNode(roots[0]);
      // Несколько корней — общий узел без имени; так же ведёт себя JSON-слой ЯРБП.
      return { [YarbpFlexFormsConverter.CHILDREN_KEY]: roots.map(n => this._convertNode(n)) };
    }
    if (this._isMeaningNode(ast)) return this._convertNode(ast);
    throw new Error('YarbpFlexFormsConverter: в AST не найден корневой узел (ROOT/MEANING)');
  }

  /* ====================================================================== */
  /* Узлы                                                                   */
  /* ====================================================================== */

  /** MEANING-узел → целевой узел/значение. */
  _convertNode(node) {
    const key = this._cleanKey(node.key);
    const prefix = node.prefix || '';
    const hasKey = key !== '';

    // «Группа» — анонимный контейнер: узла не создаёт, содержимое едет вместе,
    // чтобы родитель собрал из него подходящий контейнер («поля»/«стили»).
    if (node.valueType === YarbpFlexFormsConverter.OBJECT && !hasKey &&
        prefix !== YarbpFlexFormsConverter.ARRAY_ITEM_PREFIX) {
      return { group: this._objectChildren(node) };
    }

    if (node.valueType === YarbpFlexFormsConverter.OBJECT) {
      return this._buildNode(this._headOf(node, key), this._objectChildren(node));
    }

    if (node.valueType === YarbpFlexFormsConverter.ARRAY) {
      const value = { [YarbpFlexFormsConverter.VALUE_KEY]: this._convertArrayNode(node) };
      return hasKey ? { name: key, value: value } : { value: value };
    }

    // Скалярное свойство. Имя свойства — ключ без пунктуации префикса.
    return { name: key, value: this._scalar(node) };
  }

  /**
   * «Паспорт» объектного узла: ключ разметки → {type, вид} целевого узла.
   * Вид берётся из поля `type` узла AST (его туда кладёт парсер из суффикса
   * ключа разметки: `поле:надпись` → `key:'поле', type:'надпись'`). Если AST
   * вида не задал, он берётся из суффикса самого ключа. Суффикс, совпадающий
   * с именем ключа (`поле:поле`), вида не создаёт.
   */
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

  /**
   * ARRAY-узел → массив значений:
   *   - скалярные элементы («..шапка Товар …», «..ресурсы Кол‑во») — строки,
   *     включая числа (`1` → `"1"`: целевой формат держит элементы строками);
   *   - объектные элементы-опции (блок `: .значение … .имя …`) — объекты
   *     `{значение, имя}` БЕЗ собственного «type»: опция в целевом формате —
   *     это элемент children родителя, а не узел со своим типом.
   */
  _convertArrayNode(node) {
    const children = Array.isArray(node.children) ? node.children : [];
    return children
      .filter(child => this._isMeaningNode(child))
      .map(child => this._arrayItem(child));
  }

  /** Элемент массива: скаляр → строка; объект-опция → `{значение, имя}`. */
  _arrayItem(child) {
    if (child.valueType !== YarbpFlexFormsConverter.OBJECT) return this._scalar(child);
    const option = {};
    this._objectChildren(child).forEach(prop => {
      if (prop.name !== undefined) option[prop.name] = prop.value;
    });
    return option;
  }

  /**
   * Узел «форма».
   * Собственные свойства формы идут после `type` в порядке разметки; группы
   * формы становятся контейнерами «поля» (сетка + поля формы).
   * Первым ребёнком формы всегда идёт узел «стили» (словарь DSL:
   * `форма.children = ['стили', 'операция']`). Если в разметке есть явный узел
   * «стили» — берутся его значения; если нет — умолчания схемы DSL, потому что
   * целевой формат требует этот узел, а разметка вправе его не писать.
   */
  _buildFormNode(node, head, plan) {
    node[YarbpFlexFormsConverter.TYPE_KEY] = head.type;
    if (head.kind) node[YarbpFlexFormsConverter.KIND_KEY] = head.kind;

    this._resolveName(node, plan.nameProp);
    this._resolveName(node, plan.pendingName);
    this._mergeArrayProps(node, plan.rest);

    const children = [this._stylesNode(plan)];

    // Группы формы — контейнеры «поля».
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

  /**
   * Узел «стили»: значения из авторского узла «стили» (если он есть в разметке)
   * поверх умолчаний схемы DSL. Это словарь языка — целевой формат требует
   * узел «стили» первым ребёнком формы даже когда разметка его не пишет.
   */
  _stylesNode(plan) {
    const styles = { [YarbpFlexFormsConverter.TYPE_KEY]: YarbpFlexFormsConverter.STYLES_KEY };
    Object.keys(YarbpFlexFormsConverter.STYLE_DEFAULTS).forEach(name => {
      styles[name] = YarbpFlexFormsConverter.STYLE_DEFAULTS[name];
    });

    const authored = (plan.childNodes || []).concat(plan.directNodes || [])
      .filter(item => this._isStylesChild(item))[0];
    if (authored) {
      Object.keys(YarbpFlexFormsConverter.STYLE_DEFAULTS).forEach(name => {
        if (authored[name] !== undefined) styles[name] = authored[name];
      });
      (authored[YarbpFlexFormsConverter.CHILDREN_KEY] || []).forEach(child => {
        // Прочие свойства авторского узла «стили» сохраняются как есть.
        Object.keys(child).forEach(key => {
          if (key !== YarbpFlexFormsConverter.TYPE_KEY) styles[key] = child[key];
        });
      });
    }
    return styles;
  }

  /** Узел «стили» (авторский либо контейнер) — этот узел строится первым. */
  _isStylesChild(item) {
    const type = item && (item[YarbpFlexFormsConverter.TYPE_KEY] ||
      item[YarbpFlexFormsConverter.KIND_KEY]);
    return type === YarbpFlexFormsConverter.STYLES_KEY;
  }


  /** Собирает целевой узел из «паспорта» узла и «сырых» свойств (key/value).
   *  head = { type: <ключ разметки до ':'>, kind: <вид из суффикса ':'>,
   *           value: <значение объектного узла, «имя / ид»> } */
  _buildNode(head, rawProps) {
    const plan = this._planProps(head, rawProps);
    const node = {};

    // Узел «форма»: собственные свойства + контейнеры «поля» из групп.
    if (head.typeKey === YarbpFlexFormsConverter.FORM_KEY) {
      return this._buildFormNode(node, head, plan);
    }

    // «Группа» — контейнер полей: сам узлом не является, но её ключ в разметке
    // задаёт тип контейнера «поля» (DSL: `группа .сетка …` → `{type:'поля', …}`).
    if (head.typeKey === YarbpFlexFormsConverter.GROUP_KEY) {
      return this._containerNode(null, this._splitGroup(rawProps));
    }

    node[YarbpFlexFormsConverter.TYPE_KEY] = head.type;

    // Вид: обычные виды («надпись», «число», «выбор») пишутся в «вид»; особые
    // («штрихкод») — в «тип» с заглавной буквы и без «вид» (словарь DSL).
    const kindProp = this._kindProp(head.kind);
    Object.keys(kindProp).forEach(key => { node[key] = kindProp[key]; });

    // Группа-контейнер узла («операция» → «поля»): её свойства (сетка) уже
    // подняты в plan.rest, дети собираются здесь в контейнер «поля».
    const children = [];
    plan.groupProps.forEach(prop => {
      (prop.group || []).forEach(group => {
        const parts = this._splitGroup(group);
        children.push(this._containerNode(group, parts));
      });
    });

    // Имя узла: из «имя / ид» (для объектных узлов) либо из свойства «ключ значение».
    this._resolveName(node, plan.nameProp);
    this._resolveName(node, plan.pendingName);

    // Опции («..опции») — не свойство узла, а его дети без собственного «type».
    this._takeOptions(plan, node);

    // Дети: контейнеры групп, массивные узлы с объектами и явные дети.
    plan.childNodes.forEach(item => children.push(item));
    this._mergeArrayProps(node, plan.rest);
    this._mergeOwnChildren(node, children);

    return this._finishNode(node, head);
  }

  /**
   * Замыкание узла (порядок ключей как в образце целевой разметки):
   *   - «type» — первым;
   *   - «вид» — перед `ид`/`имя`, если у узла есть авторские свойства (схема:
   *     `вид` раньше `тип`), иначе — в конце, за `ид`/`имя` (`поле:надпись`);
   *   - «ид», «имя» — сразу за «type»;
   *   - авторские свойства — в порядке разметки; синтезированный «тип» встаёт
   *     по схемному якорю (для сканер-поля — сразу за «хук»);
   *   - «children» — последним (у таблицы пустой массив сохраняется).
   */
  _finishNode(node, head) {
    if (head && head.typeKey === YarbpFlexFormsConverter.TABLE_KEY &&
        node[YarbpFlexFormsConverter.CHILDREN_KEY] === undefined) {
      node[YarbpFlexFormsConverter.CHILDREN_KEY] = [];
    }
    // Операция: «имя», «имяКнопки», массивы-свойства, «ид», прочее по разметке.
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
    // «Вид» встаёт перед «ид»/«имя», если у узла есть авторские свойства помимо
    // «ид»/«имя»/«тип» (`поле:выбор` с `.тип`) — иначе уходит за «ид»/«имя».
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
      // Синтезированный «тип» сканер-поля — сразу за схемным якорем («хук»).
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

  /**
   * Делит свойства узла на «массивы-свойства» (keyed: `..проверятьЗаполнение`,
   * `..приемник`, `..шапка`, …) и прочие, сохраняя порядок разметки. Массивным
   * свойством считается массив значений; массив объектов — это дети (опции).
   */
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

  /** «Вид» узла из суффикса ключа → пара целевых свойств («вид» либо «тип»). */
  _kindProp(kind) {
    if (!kind) return {};
    const mapped = YarbpFlexFormsConverter.KIND_TO_TYPE[kind];
    if (mapped !== undefined) return { [YarbpFlexFormsConverter.TYPE_PROP_KEY]: mapped };
    return { [YarbpFlexFormsConverter.KIND_KEY]: kind };
  }

  /**
   * «..опции» — не свойство узла, а его дети: целевой формат пишет опции
   * элементами `children` без собственного «type» (`{значение, имя}`).
   * Поэтому свойство-массив вынимается из свойств и кладётся в детей.
   */
  _takeOptions(plan, node) {
    const opts = plan.rest[YarbpFlexFormsConverter.OPTIONS_KEY];
    if (opts === undefined) return;
    delete plan.rest[YarbpFlexFormsConverter.OPTIONS_KEY];
    const items = this._asArray(opts);
    node[YarbpFlexFormsConverter.CHILDREN_KEY] = items.concat(
      this._asArray(node[YarbpFlexFormsConverter.CHILDREN_KEY]));
  }

  /**
   * Канонический порядок свойств узла из схемы языка
   * (`fpmlEditorGlobals.syntaxTree`, flex-forms-legacy/constructor.html).
   * Задаёт место СИНТЕЗИРОВАННОГО конвертером свойства (`вид`/`тип` из суффикса
   * ключа разметки) среди свойств, написанных автором:
   *   - если в узле есть авторские свойства, синтезированное встаёт ПЕРЕД первым
   *     из них, которое в схеме идёт после него (`поле:выбор` → `вид` перед
   *     `.тип`, потому что `вид` в схеме раньше `тип`);
   *   - если авторских свойств нет — синтезированное уходит в конец, за `ид`/`имя`
   *     (`поле:надпись` → `ид, имя, вид`).
   * «Хук» (`поле:штрихкод`) — исключение схемы: рантайм читает `тип` штрихкода
   * ПОСЛЕ хука, поэтому место «тип» для сканер-поля задано якорем SCANNER_TYPE_AFTER.
   */
  static SCHEMA_ORDER = Object.freeze({
    'поле': [
      'вид', 'ид', 'имя', 'тип', 'кнопкаОчистки', 'автофокус', 'приемник',
      'хук', 'значенияПриемниковПоУмолчанию', 'именаВИсточнике', 'поискПо',
      'вызывать', 'режимСканирования',
    ],
    'операция': [
      'имя', 'имяКнопки', 'очиститьФорму', 'приемник', 'заголовокФормы', 'ид',
      'проверятьЗаполнение', 'урл', 'перезагрузить',
    ],
    'таблица': [
      'ид', 'имя', 'редактируемая', 'измерения', 'ресурсы', 'шапка',
      'именаВПриемнике', 'типы',
    ],
    'стили': ['обводка', 'поля', 'фон', 'фокус', 'кнопка', 'текст'],
  });

  /**
   * Свойство схемы, ПОСЛЕ которого рантайм ждёт «тип» сканер-поля: синтезированный
   * «тип» (`поле:штрихкод`) встаёт сразу за «хук», как в образце целевой разметки.
   */
  static SCANNER_TYPE_AFTER = 'хук';

  /**
   * Порядок свойств операции в целевом формате (эмпирический, из образца):
   *   type, имя, имяКнопки, <массивы-свойства>, ид, <прочие свойства по разметке>
   * Если массивов-свойств нет, «ид» уходит в конец списка свойств — поэтому
   * образец с «..проверятьЗаполнение» ставит «ид» сразу за массивом, а образец
   * без массивов (только скаляры и «.приемник») — последним.
   * «children» всегда замыкает узел.
   */
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

  /** Ключ «children» — сразу после прочих свойств узла, перед прочим видом. */
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

  /** Копия набора свойств без перечисленных (по ссылке на «сырое» свойство). */
  _minusProps(rest, props) {
    const out = {};
    Object.keys(rest).forEach(key => { out[key] = rest[key]; });
    (props || []).forEach(prop => { delete out[prop.key]; });
    return out;
  }

  /**
   * Имя узла. Источники по приоритету:
   *   1) явное свойство «имя» (блок-строка массива «: .значение … .имя …»);
   *   2) пара «имя / ид» из значения объектного узла
   *      («поле:штрихкод = Штрихкод / a_1_f_1» → имя='Штрихкод', ид='a_1_f_1').
   *
   * Ключ узла именем не является: `поле:штрихкод = Штрихкод / a_1_f_1` — это
   * «вид поля штрихкод по имени Штрихкод», а не поле с именем «поле».
   */
  _resolveName(node, nameProp) {
    if (!nameProp || nameProp.key === null) return;
    node[nameProp.key] = nameProp.value;
  }

  /**
   * «Сырые» свойства узла → план сборки:
   *   rest — собственные свойства узла, ещё не разложенные по местам;
   *   props — те же свойства списком (чтобы вычесть их из `rest`);
   *   childNodes — узлы-дети узла;
   *   container / containerNodes — контейнер группы и его дети;
   *   nameProp / pendingName — имя узла и «висячее» имя-опция.
   */
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
    // Группа (анонимный контейнер) — её содержимое разбирает владелец.
    if (prop.group) {
      plan.groupProps.push(prop);
      this._planGroupProp(plan, head, prop.group);
      return;
    }
    // Объектный узел-ребёнок («операция», «поле», «таблица») — не свойство.
    if (prop.node) {
      plan.childNodes.push(prop.node);
      return;
    }
    // Массивный узел-ребёнок: массив С ИМЕНЕМ («..приемник», «..шапка») — это
    // свойство-массив узла; массив БЕЗ имени («..опции»-блок) — его дети.
    if (prop.array === true) {
      const items = prop.value[YarbpFlexFormsConverter.VALUE_KEY];
      if (prop.name !== undefined) {
        // Значения массивного узла (`..ключ`) остаются массивом даже из одного
        // элемента: массивность задана разметкой, а не количеством значений.
        items.multi = true;
        this._addProp(plan.rest, prop.name, items);
        plan.props.push({ name: prop.name, value: items });
        return;
      }
      items.forEach(item => plan.childNodes.push(item));
      return;
    }
    // Узел без имени — ребёнок (объект/массив), а не свойство узла.
    if (prop.name === undefined) {
      if (prop.value !== undefined) plan.childNodes.push(prop.value);
      return;
    }
    if (prop.name === YarbpFlexFormsConverter.NAME_KEY) {
      this._planNameProp(plan, prop.value);
      return;
    }
    // «Команда»-значение подписи кнопки: в разметке строчными (`.имяКнопки
    // отправить`), в целевом формате — заголовком (`"Отправить"`).
    if (prop.name === YarbpFlexFormsConverter.BUTTON_NAME_KEY) {
      const value = this._command(prop.value);
      this._addProp(plan.rest, prop.name, value);
      plan.props.push({ name: prop.name, value: value });
      return;
    }
    this._addProp(plan.rest, prop.name, prop.value);
    plan.props.push({ name: prop.name, value: prop.value });
  }

  /**
   * Значение-«команда» (одно слово — латиница или кириллица, целиком строчными):
   * пишется с заглавной буквы, как заголовок (`отправить` → `Отправить`).
   * Слова с заглавными внутри (`суммироватьДоПереноса`) — не «команды».
   */
  _command(value) {
    if (typeof value !== 'string') return value;
    if (!YarbpFlexFormsConverter.SCALAR_UPPER_RE.test(value)) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * «Группа» в детях узла.
   * Дети группы принадлежат контейнеру («поля»/«стили»), а не узлу-владельцу:
   * так целевой формат отделяет сетку контейнера от свойств самой формы или
   * операции. Группа-контейнер собирается владельцем (_buildFormNode /
   * _containerChildren) из plan.groupProps, здесь копятся сами группы.
   */
  _planGroupProp(plan, head, group) {
    // Свойства группы («сетка») остаются свойствами узла-владельца.
    this._splitGroup(group).props.forEach(prop => {
      this._addProp(plan.rest, prop.name, prop.value);
    });
  }

  /** Дети «группы» → узлы её контейнера (порядок разметки сохраняется). */
  _containerChildren(parts) {
    const nodes = [];
    parts.children.forEach(node => nodes.push(node));
    parts.direct.forEach(items => items.forEach(item => nodes.push(item)));
    parts.groups.forEach(group => {
      nodes.push(this._containerNode(group, this._splitGroup(group)));
    });
    return nodes;
  }

  /** Контейнер группы: { type:'поля', …свойства группы…, children:[ … ] }. */
  _containerNode(group, parts, override) {
    const type = override && override.type
      ? override.type : YarbpFlexFormsConverter.CONTAINER_KEY;
    const node = { [YarbpFlexFormsConverter.TYPE_KEY]: type };
    this._mergeArrayProps(node, this._containerProps(parts.props));
    const children = this._containerChildren(parts);
    // Контейнер группы целевой формат пишет как `{type, сетка, children}` —
    // «children» есть всегда, даже пустой: это сетка с полями.
    node[YarbpFlexFormsConverter.CHILDREN_KEY] = children;
    return node;
  }

  /** «имя»: имя узла из разметки; «..имя» — ещё и имя в опциях. */
  _planNameProp(plan, value) {
    if (plan.nameProp.key === null) {
      plan.nameProp = { key: YarbpFlexFormsConverter.NAME_KEY, value: value };
    } else {
      this._addProp(plan.rest, YarbpFlexFormsConverter.NAME_KEY, value);
    }
    this._addProp(plan.arrayProps, YarbpFlexFormsConverter.NAME_KEY, [value]);
    plan.props.push({ name: YarbpFlexFormsConverter.NAME_KEY, value: value });
  }

  /** Пара «имя / ид» из значения объектного узла (если имя не задано свойством). */
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

  /** Присваивает свойство; повторение ключа превращает свойство в массив. */
  _addProp(target, name, value) {
    if (target[name] === undefined) {
      target[name] = Array.isArray(value) ? value : [value];
      return;
    }
    if (Array.isArray(value)) target[name] = target[name].concat(value);
    else target[name].push(value);
  }

  /**
   * Значение свойства узла.
   * Массивность задаёт ПРЕФИКС КЛЮЧА разметки (`..` — массивный узел, `.` —
   * скаляр), а не имя свойства: `..приемник a b c` — `приемник: [a,b,c]` у
   * сканер-поля, а `.приемник a_2_t_1` — скаляр `приемник: "a_2_t_1"` у операции.
   * Поэтому все значения, собранные из массивных узлов, остаются массивами даже
   * из одного элемента (`..ресурсы Кол‑во` → `["Кол‑во"]`); скаляры из одного
   * значения остаются скалярами. Повторение ключа склеивает значения.
   */
  _mergeArrayProps(node, arrayProps) {
    Object.keys(arrayProps).forEach(key => {
      const list = arrayProps[key];
      const single = list.length === 1 && !Array.isArray(list[0]);
      if (single && node[key] !== undefined) return;   // имя узла уже записано
      if (node[key] === undefined) {
        node[key] = single && !list.multi ? list[0] : list;
        return;
      }
      // «имя» бывает и опцией (..имя), и именем узла: одноимённые значения
      // собираются в один массив.
      const was = Array.isArray(node[key]) ? node[key] : [node[key]];
      node[key] = was.concat(list);
    });
  }

  /** Свойство «children» узла: массив может быть и детьми, и обычным значением. */
  _mergeOwnChildren(node, children) {
    const key = YarbpFlexFormsConverter.CHILDREN_KEY;
    if (!children.length) return;
    if (node[key] === undefined) {
      node[key] = children;
      return;
    }
    node[key] = this._asArray(node[key]).concat(children);
  }

  /** Значение как массив (одиночное — из одного элемента, пустое — пустой). */
  _asArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  /* ====================================================================== */
  /* Контейнеры (группа → поля/стили)                                       */
  /* ====================================================================== */

  /**
   * Разбивает содержимое «группы»: свойства, узлы-дети и вложенные группы.
   * Узлы-дети приходят двумя видами: `{node}` (объектный узел с ключом —
   * «поле»/«таблица») и `{value}` (безымянный объект/массив) — оба становятся
   * детьми контейнера; `{direct}` — элементы массивных узлов группы.
   */
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

  /** Значение массивного свойства-«контейнера» (сетка может повторяться). */
  _containerProps(props) {
    const out = {};
    (props || []).forEach(prop => this._addProp(out, prop.name, prop.value));
    return out;
  }

  /** Вид узла — самым первым ключом, как в образце целевой разметки. */
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

  /* ====================================================================== */
  /* Дети узла                                                              */
  /* ====================================================================== */

  /**
   * Дети AST-узла → список «сырых свойств»:
   *   { name, value }              — свойство родителя (ключ без пунктуации);
   *   { array: true, value: [...] } — массивный узел (свойство-массив значений);
   *   { group: [ ... ] }           — анонимная «группа»: её содержимое едет
   *                                  вместе, чтобы родитель собрал контейнер;
   *   { value }                    — объект, который становится ребёнком узла.
   * Дети массивного узла собираются самим массивом (_convertArrayNode).
   */
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

  /**
   * «Сырое свойство» из узла AST: ключ — уже без префикса, значение — по виду.
   * Скалярные узлы разворачиваются в значение, объектные остаются узлами,
   * массивные помечаются флагом `array`.
   */
  _asProp(key, child, converted) {
    if (converted.group) return converted;                      // «группа» — как есть
    if (child.valueType === YarbpFlexFormsConverter.ARRAY) {
      return { name: key === '' ? undefined : key, value: converted.value, array: true };
    }
    if (key === '') return converted;                           // узел без имени → children
    // Скалярный узел: `_convertNode` вернул { name, value } — берём значение.
    if (child.valueType !== YarbpFlexFormsConverter.OBJECT) {
      return { name: key, value: converted.value };
    }
    // Объектный узел с ключом — узел-ребёнок («операция», «поле», «таблица»):
    // ключ задаёт вид узла, а не свойство родителя.
    return { node: converted };
  }

  /* ====================================================================== */
  /* Значения                                                               */
  /* ====================================================================== */

  /**
   * Значение скалярного узла (bool → 'да'/'нет', число/строка — как есть).
   * Значения-«команды» (одно слово латиницей, как `отправить`) в целевом
   * формате пишутся с заглавной буквы: так же, как исходное «Отправить».
   */
  _scalar(node) {
    if (node.valueType === YarbpFlexFormsConverter.BOOL) {
      return node.value ? YarbpFlexFormsConverter.YES : YarbpFlexFormsConverter.NO;
    }
    if (node.valueType === YarbpFlexFormsConverter.NULL) return '';
    const value = node.value === undefined ? '' : node.value;
    // Числа в целевом формате тоже строки: `..значенияПриемниковПоУмолчанию 1`
    // даёт элемент `"1"` (рантайм клеит массив через `|` строкой).
    return typeof value === 'number' ? String(value) : value;
  }

  /** Значение узла любого вида (для элементов массивов и анонимных объектов). */
  _value(node) {
    switch (node.valueType) {
      case YarbpFlexFormsConverter.OBJECT:
        return this._buildNode(this._headOf(node, this._cleanKey(node.key)),
                               this._objectChildren(node));
      case YarbpFlexFormsConverter.ARRAY:
        return this._convertArrayNode(node);
      default:
        return this._scalar(node);
    }
  }

  /* ====================================================================== */
  /* Утилиты                                                                */
  /* ====================================================================== */

  _isMeaningNode(node) {
    return !!node && typeof node === 'object' &&
      (!node.nodeType || node.nodeType === YarbpFlexFormsConverter.ROOT_NODE);
  }

  /** Элемент-строка массива: без ключа и с префиксом «:». */
  _isArrayItemNode(node) {
    return this._cleanKey(node.key) === '' &&
      (node.prefix || '') === YarbpFlexFormsConverter.ARRAY_ITEM_PREFIX;
  }

  _nodeTypeOf(node) {
    return node && typeof node === 'object' ? node.nodeType : undefined;
  }

  /** Ключ без пунктуации префикса ('.', '..', ':') — она не часть имени. */
  _cleanKey(key) {
    if (key === undefined || key === null) return '';
    return String(key).replace(/^[.:]+/, '');
  }

  /** «Подобрать товар / a_1» → { name, id }; без разделителя id пуст. */
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
