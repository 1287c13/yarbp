# Визуальный просмотр раскладки BPMN (bpmn-io)

Dev-инструмент для работы над **автораскладкой**: он берёт кейс ЯРБП, прогоняет
его через наш конвертер и **рисует результат настоящим bpmn-io**. Нужен, чтобы
массово смотреть схемы глазами, а не только по счётчикам в тестах.

Это не тест: ничего не сравнивается, код возврата 0, если страницы отрисовались.
Предупреждения печатаются, но не валят прогон (если не добавить `--strict`).

## Что коммитится, а что нет

| Файл / папка | В git |
| --- | --- |
| `render.html`, `render.py`, `fetch-vendor.ps1`, этот README | **да** |
| `vendor/` — сборка bpmn-js (≈190 КБ js + css) | **нет** (`.gitignore`) |
| `out/` — скриншоты `*.png` | **нет** (`.gitignore`) |

## Подготовка (один раз)

Node в проекте не используется, поэтому bpmn-io не собираем — берём готовый
dist (viewer):

```powershell
powershell -ExecutionPolicy Bypass -File tests/bpmn-io/fetch-vendor.ps1
```

Скрипт тянет `bpmn-js@17.11.1` с unpkg в `tests/bpmn-io/vendor/`. Версия — в
самом скрипте, менять там.

## Запуск

```powershell
python tests/bpmn-io/render.py                      # все кейсы из tests/converters/cases.json
python tests/bpmn-io/render.py --case bpmn_features # один кейс
python tests/bpmn-io/render.py --strict             # предупреждения → код 1
```

Скриншоты: `tests/bpmn-io/out/<кейс>.png` (1400×900, схема вписана по размеру
окна). В консоль печатается:

- `xml N chars` — размер собранного BPMN;
- `elements M (nodes K, flows L)` — сколько bpmn-io увидел на канве;
- `converter warnings` — наши предупреждения сборки (B-1);
- `bpmn-io warnings` — предупреждения самого bpmn-io (элемент без DI, битая
  ссылка и т.п.). Именно они первыми кричат, что раскладка сломала схему.

## Как этим пользоваться в автораскладке

1. Меняете раскладку (`BpmnLayoutGenerator` / `BpmnDiGenerator`).
2. `python tests/converters/run_tests.py` — golden-снимки покажут, что именно
   поменялось в XML.
3. `python tests/bpmn-io/render.py` — глазами: связи не пересекают узлы,
   подписи читаемы, нет «лестниц» и наложений.
4. Открыть `out/<кейс>.png` — это и есть картинка, которую можно показать.

Добавить свой кейс: положить `.yarbp` в `tests/converters/cases/` и вписать имя
в `tests/converters/cases.json` — он попадёт и в golden-снимки, и сюда.
