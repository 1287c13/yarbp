# Конвертеры ЯРБП: структура и контракт

Этот каталог — единственное место, где живёт код конкретных конвертеров.
Правило простое:

> Всё, что относится к одному конвертеру и не переиспользуется другими,
> лежит в `converters/<id>/`. Всё, что переиспользуется двумя и более
> конвертерами, лежит в `converters/shared/`.

Ядро (`core/`), общие утилиты (`utils/`) и редакторские подсветки
(`classes/highlighters/`) остаются вне каталога конвертеров: они не являются
реализацией конкретного формата.

## Дерево

```text
src/js/converters/
  README.md                 этот контракт
  contract.js               defineConverter(): валидация описания
  registry.js               карта «имя директивы → конвертер»
  shared/                   только код, общий для 2+ конвертеров
    renderer.js             базовый класс рендерера панели
    DiagnosticsStatusRenderer.js
    JsonDocumentRenderer.js OpenAPI + JSON Schema
    XMLHighlighter.js       XML + BPMN
    schemaFields.js         OpenAPI + JSON Schema
    bpmnModel/              модель BPMN: BPMN + Mermaid
  lexer/                    лёгкий отладочный конвертер
    index.js
    renderer.js
  ast/                      лёгкий отладочный конвертер
    index.js
    renderer.js
  json/                     типовой лёгкий конвертер
    index.js
    converter.js
    renderer.js
  xml/
  protobuf/
  ui/                       UI-макет формы (не ТСД)
    index.js
    converter.js            AST → IR
    markup.js               IR → HTML
    styles.js
    runtime.js
    generator.js
    exporter.js
    renderer.js
    suggestions.js
    README.md
  xpm/
  bpmn/
    index.js
    converter.js
    renderer.js
    suggestions.js
    serializeBpmn.js
    BpmnDiGenerator.js
    BpmnLayoutGenerator.js
    layoutConfig.js
    layoutUtils.js
  openapi/
  json-schema/
  mermaid/
  flexforms/                форма ТСД
    index.js
    converter.js
    renderer.js
    page.js
    markup.js
    runtime.js
    styles.js
    mock-server.js
    suggestions.js
    tools/                  конвертер-специфичные утилиты (Python-мок)
    README.md
```

## Обязательный контракт

### 1. `index.js` — паспорт конвертера

```js
import { defineConverter } from '../contract.js';
import { JSONRenderer } from './renderer.js';

export const jsonConverter = defineConverter({
  id: 'json',                       // стабильный id, kebab-case
  names: ['json', 'джейсон'],       // алиасы после `! как`
  title: 'JSON',
  description: 'AST → JSON-документ.',
  renderer: JSONRenderer,           // лёгкий: класс сразу
});
```

Для тяжёлого рендерера вместо `renderer` задаётся ленивый загрузчик:

```js
loadRenderer: () => import('./renderer.js').then(module => module.BPMNRenderer),
```

Правила:

- `id` уникален и совпадает с именем каталога;
- `names` — именно то, что пользователь пишет после `! как`; реестр сам
  нормализует регистр, пробелы, дефисы, подчёркивания и скобки;
- ровно одно из `renderer` / `loadRenderer`;
- `suggestions` — необязательный словарь подсказок;
- тяжёлый конвертер (BPMN, OpenAPI, Schema, Mermaid, FlexForms, UI, XPM)
  обязан быть ленивым, иначе он попадёт в первый экран редактора.

### 2. `converter.js` — AST → целевой формат

Минимальный контракт:

```js
export class MyConverter {
  constructor(ast, options = {}) { ... }
  convert() { ... }               // строка или объект
  // необязательно:
  warnings = [];                  // [{ line?, message }]
}
```

Требования:

- вход — AST ЯРБП; `converter.js` **не мутирует** AST;
- никакого DOM, `document`, `window`, `innerHTML`;
- диагностика — в `warnings`/`diagnostics`, а не `console.log`;
- конвертер не знает о других конвертерах;
- если двум конвертерам нужна одна логика (например, `schemaFields`),
  она выносится в `shared/`, а не импортируется из соседнего каталога.

### 3. `renderer.js` — вывод в панель результата

```js
import { YarbpBasicRenderer } from '../shared/renderer.js';

export class JSONRenderer extends YarbpBasicRenderer {
  render() {
    const ast = this.parser.getAST();
    ...
  }
}
```

Требования:

- наследует `shared/renderer.js` или общий `shared/*Renderer`;
- конструктор не переопределяется без причины (база принимает
  `lexer, parser, renderTextarea, renderHighlightDiv, syncRenderScroll`);
- `render()` идемпотентен: тот же вход не должен переписывать DOM;
- пользовательские данные экранируются (`escText`/`escAttr`), сырой
  `innerHTML` с ними запрещён;
- `destroy()` нужен, если рендерер создаёт свои панели/таймеры;
- тяжёлый рендерер не должен импортироваться статически из `index.js`.

### 4. `suggestions.js` — словарь подсказок (необязательно)

Формат — как у `SuggestionProvider`:

```js
export const mySuggestions = {
  root:    { blockDoc: 'С чего начать', variants: [...] },
  nodes:   { 'ключ': { blockDoc, variants, values } },
  containers: { 'ключ': { ... } },
};
```

Словарь относится только к этому конвертеру. Общий движок подсказок живёт в
`src/js/suggestions/` и не меняется при добавлении конвертера.

### 5. `README.md` конвертера (желательно)

Коротко: что за формат, какие узлы поддержаны, ограничения, как проверить.
Большая пользовательская документация может оставаться в корневом `readme.md`.

## Реестр

`registry.js` импортирует **только** `index.js` конвертеров. Новый конвертер
добавляется двумя шагами:

1. создать `converters/<id>/` по контракту;
2. добавить его `index.js` в `CONVERTER_DEFINITIONS` в `registry.js`.

`YarbpFlavor` и `prefetchFlavors` — публичный API для `app.js` и тестов;
ломать его сигнатуры нельзя. `flavorData` — это замороженное описание из
`index.js` (`renderer`, `loadRenderer`, `suggestions`, `names`, `id`).

## `shared/`: когда код переезжает туда

`shared/` — не свалка «общего». Туда попадает модуль только при выполнении
одного из условий:

1. его импортируют **два и более** конвертера;
2. это инфраструктура контракта (базовый рендерер, `defineConverter`).

Примеры текущего среза:

| Модуль | Кто использует | Почему shared |
| --- | --- | --- |
| `shared/renderer.js` | все рендереры | база контракта |
| `shared/DiagnosticsStatusRenderer.js` | OpenAPI, JSON Schema, Mermaid | строка диагностики |
| `shared/JsonDocumentRenderer.js` | OpenAPI, JSON Schema | JSON + warnings |
| `shared/XMLHighlighter.js` | XML, BPMN | подсветка XML |
| `shared/schemaFields.js` | OpenAPI, JSON Schema | общая схема полей |
| `shared/bpmnModel/` | BPMN, Mermaid | общая модель процесса |

Если модуль используется одним конвертером — он обязан лежать в его каталоге,
даже если кажется «общим по смыслу». При появлении второго потребителя модуль
переносится в `shared/` и импорты обновляются.

Запрещено:

- импортировать файлы из `converters/<другой-id>/`;
- складывать новые конвертеры в `classes/`, `renderers/`, `suggestions/`;
- дублировать `schemaFields`/`bpmnModel` в своём каталоге.

## Тесты и примеры

Контракт тестов:

- собственный набор — `tests/<id>/run_tests.py` (как `tests/flexforms`);
- общий smoke всех конвертеров — `tests/converters`;
- UI-паритет — `tests/ui-parity`;
- сценарные/сквозные проверки — `tests/features`, `tests/security`, `tests/files`;
- набор добавляется в `SUITES` в `tests/run_all.py` (если это отдельный runner).

Минимум для нового конвертера:

1. `converter()` на пустом AST/на примере не падает;
2. `renderer` создаётся и `render()` даёт ожидаемый текст/DOM;
3. `! как <алиас>` находит конвертер через `YarbpFlavor`;
4. подсказки (если есть) проходят `parse-after-apply`;
5. экспорт/скачивание (если есть) не содержит пользовательский payload как HTML.

## Чек-лист нового конвертера

- [ ] `converters/<id>/index.js` с `defineConverter`.
- [ ] `converter.js`: AST → результат, без DOM и мутации AST.
- [ ] `renderer.js`: наследует shared-базу, идемпотентен, экранирует данные.
- [ ] `suggestions.js` (если нужен словарь) и `suggestions` в `index.js`.
- [ ] Тяжёлый рендерер — через `loadRenderer: () => import(...)`.
- [ ] `index.js` добавлен в `CONVERTER_DEFINITIONS` (`registry.js`).
- [ ] `converters/<id>/README.md` с ограничениями.
- [ ] Набор тестов; общий smoke обновлён.
- [ ] `readme.md` (раздел конвертеров) и `src/js/README.md` обновлены.
- [ ] `git diff --check` чист; все наборы тестов зелёные.

## Куда переехало старое

| Было | Стало |
| --- | --- |
| `classes/ast-converters/JSONConvertor.js` | `converters/json/converter.js` |
| `classes/ast-converters/XMLConvertor.js` | `converters/xml/converter.js` |
| `classes/ast-converters/ProtobufConvertor.js` | `converters/protobuf/converter.js` |
| `classes/ast-converters/XPMConverter.js` | `converters/xpm/converter.js` |
| `classes/ast-converters/OpenAPIConvertor.js` | `converters/openapi/converter.js` |
| `classes/ast-converters/JsonSchemaConvertor.js` | `converters/json-schema/converter.js` |
| `classes/ast-converters/MermaidConvertor.js` | `converters/mermaid/converter.js` |
| `classes/ast-converters/FlexFormsConvertor.js` | `converters/flexforms/converter.js` |
| `classes/ast-converters/schemaFields.js` | `converters/shared/schemaFields.js` |
| `classes/ast-converters/bpmn/*` | `converters/{bpmn,shared/bpmnModel}/` |
| `classes/renderers/*Renderer.js` | `converters/<id>/renderer.js` |
| `classes/renderers/flexforms/*` | `converters/flexforms/*` |
| `classes/ui/*` | `converters/ui/*` |
| `classes/UIGenerator.js`, `HTMLExporter.js` | `converters/ui/{generator,exporter}.js` |
| `classes/YarbpBasicRenderer.js` | `converters/shared/renderer.js` |
| `classes/YarbpFlavor.js` | `converters/registry.js` |
| `classes/highlighters/XMLHighlighter.js` | `converters/shared/XMLHighlighter.js` |
| `suggestions/{uiForm,bpmn,xpm,flexForms}Suggestions.js` | `converters/<id>/suggestions.js` |

Общие подсказки (`SuggestionProvider`, `SuggestionUI`, `contextResolver`,
`commonDirectives`) остались в `src/js/suggestions/`: это движок, а не
конвертер.
