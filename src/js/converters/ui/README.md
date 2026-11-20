# UI-конвертер (`! как форма` / `! as ui`)

Этот конвертер — HTML-макет формы, **не** форма ТСД (та живёт в
`../flexforms/`).

Поток:

```text
AST → converter.js (IR формы) → markup.js (HTML) → renderer.js (панель)
                                    ↑ styles.js
UIRuntime (runtime.js) оживляет разметку: табы, поля, таблицы, диалоги,
очистка, проверки и состояние.
generator.js — публичная обёртка `new UIGenerator(isDark).generateHTML(ast)`.
exporter.js — standalone-выгрузка с встроенным runtime.js.
suggestions.js — словарь подсказок (`группа:<вид>`, `поле:<вид>`, сахар).
```

Ключевые правила:

- `converter.js` не трогает DOM и не мутирует AST;
- `markup.js` экранирует все пользовательские строки;
- `runtime.js` не использует `innerHTML` с данными пользователя;
- правки таблицы/полей/табов не должны ломать `getState()`/`restore()`;
- `exporter.js` читает `./runtime.js` через `new URL(..., import.meta.url)` —
  путь менять только вместе с файлом.

Пользовательская документация: корневой `readme.md`, раздел
[«Гайд по генератору форм»](../../../../readme.md#ui-generator-guide).
