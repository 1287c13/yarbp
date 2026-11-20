# `tests`

Все наборы запускаются из каталога, содержащего папку `yarbp`, и используют
только Python 3 + Chrome/Edge; внешних пакетов нет.

Один запуск всех наборов:

```powershell
python tests/run_all.py
python tests/run_all.py --suite converters
python tests/run_all.py --list
python tests/run_all.py --json report.json --junit report.xml
```

Браузер ищется в `YARBP_BROWSER`, затем в `PATH` (`google-chrome`,
`chromium`, `chrome`, `msedge`), затем в стандартных путях Windows.
Общая обвязка браузерных наборов — `tests/_harness.py`: поиск браузера,
локальный `http.server`, `--dump-dom`, разбор результата и заголовка.
`security`, `files` и `features` уже используют её; остальные наборы
подключаются постепенно.

`--json` и `--junit` пишут сводку по наборам (имя, статус, время) для
локальных отчётов и CI.

| Папка | Что проверяет | Запуск |
| --- | --- | --- |
| `lexer/` | golden-снимки токенов, AST и рендера на кейсах из `notes/cases` | `python yarbp/tests/lexer/run_tests.py` |
| `converters/` | smoke-тесты конвертеров и golden BPMN | `python yarbp/tests/converters/run_tests.py` |
| `features/` | новые возможности DSL, `! типизация-сахара`, `! импорт`, подсветка и подсказки | `python yarbp/tests/features/run_tests.py` |
| `autocomplete/` | сценарный UI-тест подсказок: Tab/Alt/Escape, ранжирование, доки, полная разметка ТСД | `python yarbp/tests/autocomplete/run_tests.py` |
| `files/` | файлы, резолвер импорта, localStorage, ошибки редактора, паритет предпросмотра | `python yarbp/tests/files/run_tests.py` |
| `security/` | экранирование, CSP, изоляция iframe-предпросмотра | `python yarbp/tests/security/run_tests.py` |
| `flexforms/` | флейвор «форма-ТСД», пример и браузерный дым | `python yarbp/tests/flexforms/run_tests.py` |
| `openapi2yarbp/` | обратный импорт OpenAPI → ЯРБП | `python yarbp/tests/openapi2yarbp/run_tests.py` |
| `schema2yarbp/` | обратный импорт JSON Schema → ЯРБП | `python yarbp/tests/schema2yarbp/run_tests.py` |
| `perf/` | диагностические замеры startup и ввода (не входит в `run_all.py`) | `python yarbp/tests/perf/run_tests.py` |

Подробности и список проверок — в `README.md` соответствующей папки.
