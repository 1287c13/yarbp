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
  SuggestionProvider.js  выбор подсказок по контексту и ранжирование по префиксу
  SuggestionUI.js        DOM-меню: Idle/Hint/List, шапка-контекст и описание
                         варианта, Tab/Alt/Escape, вставка с $0
  contextResolver.js     контекст AST: parentKey, анонимные объекты, valueStart
  commonDirectives.js    общие директивы и стартовый список документа
  xpmSuggestions.js      словарь XPM
  bpmnSuggestions.js     словарь BPMN
  flexFormsSuggestions.js словарь «форма-ТСД» (+ containers для строк ':')
  uiFormSuggestions.js   словарь генератора форм: `группа:<вид>`, `поле:<вид>`,
                         сахар и действия кнопок

classes/
  YarbpFlavor.js         реестр «директива → конвертер/рендерер»
  YarbpBasicRenderer.js  базовый рендерер
  UIGenerator.js         генератор UI-макета из AST (обёртка: IR → HTML → стили)
  ui/UIFormConvertor.js  AST → IR: формы, колонки, поля, кнопки, диагностика
  ui/UIFormMarkup.js     IR → HTML (классы как в notes/design/target.html)
  ui/UIFormStyles.js     стили формы: один источник для предпросмотра и выгрузки
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
