# -*- coding: utf-8 -*-
"""Импорт контракта OpenAPI в разметку ЯРБП (обратный конвертер).

Зачем: у команд уже есть OpenAPI-спеки (Swagger UI, бэкенд, чужой сервис).
Чтобы посмотреть такой контракт в редакторе — или вести его дальше разметкой —
нужен обратный путь: JSON → `! как openapi`. Прямое направление (ЯРБП → OpenAPI)
живёт в редакторе (`ast-converters/OpenAPIConvertor.js`), обратное — здесь,
отдельным инструментом: редактор по-прежнему принимает только разметку.

Поддерживается ровно то, что умеет наш конвертер в обратную сторону:
`info`, `servers`, `paths` (методы, `summary`, `tags`, `responses` по кодам,
`requestBody` со `$ref`), `components.schemas` (`type`, `format`, `enum`,
`items`, `$ref`, `required`, `description`). Всё остальное (parameters, security,
oneOf/anyOf, content не application/json, ...) не теряется молча — пишется
предупреждением в stderr.

Запуск:
    python tools/openapi2yarbp.py spec.json                 # в stdout
    python tools/openapi2yarbp.py spec.json -o case.yarbp    # в файл
    python tools/openapi2yarbp.py spec.json --check case.yarbp  # только сверить

Код возврата: 0 — ок, 1 — файл не читается/не JSON, 2 — нечего импортировать.
"""

from __future__ import print_function

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from yarbp_text import (  # noqa: E402
    Warnings, attr, compare_with_file, configure_streams, quote, read_json,
    schema_lines, write_output,
)

REF_PREFIX = '#/components/schemas/'
INDENT = '  '

# Что конвертер знает про метод: всё прочее — предупреждение.
KNOWN_OPERATION_KEYS = ('summary', 'tags', 'responses', 'requestBody', 'operationId', 'description')


def schema_block(name, schema, warnings):
    """`схема = Имя` + её поля (общая часть вынесена в yarbp_text)."""
    return schema_lines(name, schema, warnings, REF_PREFIX, INDENT * 2)


def operation_line(verb, operation, warnings, where):
    """`метод = get .операция "…" .ответ 200 …`."""
    parts = ['метод = ' + quote(verb)]

    summary = operation.get('summary') or operation.get('description')
    if summary:
        parts.append(attr('операция', quote(summary)))

    for tag in operation.get('tags') or []:
        parts.append(attr('тег', quote(tag)))

    body = operation.get('requestBody')
    if isinstance(body, dict):
        content = ((body.get('content') or {}).get('application/json') or {})
        schema = content.get('schema') or {}
        ref = schema.get('$ref')
        if isinstance(ref, str) and ref.startswith(REF_PREFIX):
            parts.append(attr('запрос', quote(ref[len(REF_PREFIX):])))
            if body.get('required'):
                parts.append(attr('обязательное', 'да'))
        else:
            warnings.add(where, 'requestBody без $ref на схему — пропущен')

    responses = operation.get('responses') or {}
    if not responses:
        warnings.add(where, 'нет responses — конвертер подставит 200')
    for code, response in responses.items():
        parts.append(attr('ответ', quote(code)))
        if isinstance(response, dict) and response.get('content'):
            warnings.add(where, 'тело ответа %s не поддерживается — пропущено' % code)

    for key in operation:
        if key in KNOWN_OPERATION_KEYS:
            continue
        warnings.add(where, 'поле «%s» не поддерживается — пропущено' % key)

    return ' '.join(parts)


def convert(spec, warnings):
    """OpenAPI (dict) → текст разметки."""
    lines = ['! как openapi', '']

    info = spec.get('info') or {}
    title = info.get('title') or 'API'
    version = info.get('version') or '0.0.0'

    api = 'api = ' + quote(title) + ' ' + attr('версия', quote(version))
    if info.get('description'):
        api += ' ' + attr('описание', quote(info['description']))
    lines.append(api)

    for server in spec.get('servers') or []:
        url = (server or {}).get('url')
        if url:
            lines.append(INDENT + 'сервер = ' + quote(url))

    paths = spec.get('paths') or {}
    if paths:
        lines.append(INDENT + '..пути')
        for path, item in paths.items():
            item = item or {}
            path_line = INDENT * 2 + 'путь = ' + quote(path)
            if item.get('description'):
                path_line += ' ' + attr('описание', quote(item['description']))
            lines.append(path_line)

            for verb, operation in item.items():
                if verb in ('description', 'summary'):
                    continue
                if verb == 'parameters':
                    warnings.add('путь %s' % path,
                                 'parameters не поддерживаются — пропущены')
                    continue
                if not isinstance(operation, dict):
                    continue
                lines.append(INDENT * 3 + operation_line(
                    verb, operation, warnings, 'путь %s, метод %s' % (path, verb)))

    components = spec.get('components') or {}
    schemas = components.get('schemas') or {}
    if schemas:
        lines.append(INDENT + '..схемы')
        for name, schema in schemas.items():
            if not isinstance(schema, dict):
                warnings.add('схема «%s»' % name, 'описание не объектом — пропущена')
                continue
            lines.extend(schema_block(name, schema, warnings))

    for key in spec:
        if key in ('openapi', 'info', 'servers', 'paths', 'components'):
            continue
        warnings.add('контракт', 'раздел «%s» не поддерживается — пропущен' % key)

    return '\n'.join(lines) + '\n'


def read_spec(path):
    """Чтение спецификации: общий `read_json` из yarbp_text."""
    return read_json(path)


def main(argv):
    configure_streams()

    if '--help' in argv or '-h' in argv or not argv:
        print(__doc__)
        return 0

    source = argv[0]
    output = None
    check = None

    index = 1
    while index < len(argv):
        arg = argv[index]
        if arg == '-o' and index + 1 < len(argv):
            output = argv[index + 1]
            index += 2
            continue
        if arg == '--check' and index + 1 < len(argv):
            check = argv[index + 1]
            index += 2
            continue
        print('Неизвестный аргумент: %s' % arg)
        print('Запуск: python tools/openapi2yarbp.py spec.json [-o out.yarbp] [--check case.yarbp]')
        return 1

    try:
        spec = read_spec(source)
    except (IOError, OSError) as error:
        print('FAIL не читается «%s»: %s' % (source, error))
        return 1
    except ValueError as error:
        print('FAIL «%s» — не JSON: %s' % (source, error))
        return 1

    if not isinstance(spec, dict) or not spec.get('openapi'):
        print('FAIL «%s» не похож на OpenAPI: нет поля openapi' % source)
        return 1

    warnings = Warnings()
    text = convert(spec, warnings)
    warnings.print_all(sys.stderr)

    if check:
        return compare_with_file(text, check)

    write_output(text, output)

    if not spec.get('paths') and not (spec.get('components') or {}).get('schemas'):
        print('FAIL импортировать нечего: нет ни paths, ни components.schemas')
        return 2

    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
