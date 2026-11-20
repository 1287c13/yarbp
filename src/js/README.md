# Структура `src/js`

```text
app.js                 точка входа редактора: события, отрисовка, оркестрация

core/
  YarbpLexer.js        текст → токены
  YarbpParser.js       токены → AST (ключ, `#id` и тип — отдельные поля узла)
  macroPostprocess.js  раскрытие макросов после парсинга
  languageDirectives.js `! разбор-сахара`, `! импорт` и
                       `! отключить идентификаторы` / `! disable ids`
                       (AST до конвертеров)

utils/
  escape.js            escText / escAttr / escJsonForHtml
  utils.js             общие хелперы: отступы, разбор строк, измерение шрифта
  storage.js           безопасная обёртка localStorage
  Ticker.js            отложенный запуск (кулдаун)

suggestions/
  SuggestionProvider.js  подсказки по контексту и ранжирование по префиксу;
                         без словаря — только директивы в начале пустого
                         файла и внутри уже распознанной директивы
  SuggestionUI.js        DOM-меню: Idle/Hint/List, шапка-контекст и описание
                         варианта, Tab/Alt/Escape, вставка с $0
  contextResolver.js     контекст AST: parentKey, анонимные объекты, valueStart
  commonDirectives.js    общие директивы и стартовый список документа

converters/
  README.md              контракт типового конвертера и чек-лист
  contract.js            defineConverter(): паспорт конвертера
  registry.js            реестр «директива → конвертер», YarbpFlavor,
                         prefetchFlavors
  shared/                код, общий для 2+ конвертеров:
                         renderer.js, DiagnosticsStatusRenderer.js,
                         JsonDocumentRenderer.js, XMLHighlighter.js,
                         schemaFields.js, bpmnModel/
  lexer/ ast/            отладочные виды (токены, AST)
  json/ xml/ protobuf/   лёгкие конвертеры: converter.js + renderer.js
  ui/                    UI-макет формы: converter.js (AST → IR),
                         markup.js (IR → HTML), styles.js, runtime.js,
                         generator.js, exporter.js, renderer.js, suggestions.js
  xpm/ bpmn/ openapi/    конвертеры со словарями/раскладкой
  json-schema/ mermaid/
  flexforms/             форма ТСД: converter.js, renderer.js, page.js,
                         markup.js, runtime.js, styles.js, suggestions.js

classes/
  highlighters/          подсветка ЯРБП, XML-помощник вынесен в
                         converters/shared/XMLHighlighter.js

modules/
  FileManager.js         файлы, примеры, localStorage, импорт/экспорт
  CommentToggler.js      Ctrl+/ — комментирование строк
```

Направление зависимостей: `app.js` → `converters/registry.js` /
`suggestions` / `modules`; конвертер → `converters/shared` и `core`;
все могут использовать `utils`. `core` не зависит от конвертеров и DOM.
Конвертер не импортирует чужой каталог `converters/<id>/`; общий код
поднимается в `converters/shared/`. Контракт и порядок добавления нового
конвертера — в [`converters/README.md`](converters/README.md).
Архитектура UI-генератора и действий формы описана в
[гайде](../../readme.md#ui-generator-guide).
