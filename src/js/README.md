# Структура `src/js`

```text
app.js                 точка входа редактора: события, отрисовка, оркестрация

core/
  YarbpLexer.js        текст → токены
  YarbpParser.js       токены → AST
  macroPostprocess.js  раскрытие макросов после парсинга

utils/
  escape.js            escText / escAttr / escJsonForHtml
  utils.js             общие хелперы: отступы, разбор строк, измерение шрифта
  storage.js           безопасная обёртка localStorage
  Ticker.js            отложенный запуск (кулдаун)

suggestions/
  SuggestionProvider.js  выбор подсказок по контексту
  SuggestionUI.js        DOM-меню подсказок
  commonDirectives.js    общие директивы
  xpmSuggestions.js      словарь XPM
  bpmnSuggestions.js     словарь BPMN
  flexFormsSuggestions.js словарь «форма-ТСД»

classes/
  YarbpFlavor.js         реестр «директива → конвертер/рендерер»
  YarbpBasicRenderer.js  базовый рендерер
  UIGenerator.js         генератор UI-макета из AST (только разметка)
  ui/UIRuntime.js        view-model и действия UI-макета
  HTMLExporter.js        выгрузка HTML
  ast-converters/        AST → JSON/XML/Protobuf/BPMN/OpenAPI/…
  highlighters/          подсветка ЯРБП, XML и фрагментов кода
  renderers/             рендереры флейворов (BPMN, ТСД, Mermaid, …)

modules/
  FileManager.js         файлы, примеры, localStorage, импорт/экспорт
  CommentToggler.js      Ctrl+/ — комментирование строк
```

Направление зависимостей: `app.js` → `classes` / `suggestions` / `modules`;
`classes` и `suggestions` → `core`; все могут использовать `utils`.
`core` не зависит от `classes` и DOM. Архитектура UI-генератора и действий
формы описана в [гайде](../../readme.md#ui-generator-guide).
