# -*- coding: utf-8 -*-
"""Импорт JSON Schema в разметку ЯРБП (обратный конвертер для `! как схема`).

Зачем: схемы данных часто живут отдельно от документации — их отдают бэкенд,
генераторы типов, редакторы JSON. Инструмент превращает такую схему в разметку,
чтобы её можно было открыть в редакторе и вести дальше текстом.

Поддерживается ровно то, что умеет наш конвертер в обратную сторону: `$defs`
(и старое `definitions`), `properties`, `required`, `type`, `format`, `enum`,
`items`, `$ref`, `description`, плюс `title`/`$id`/`description` корня и
`$ref` на схему по умолчанию (`.корень`). Всё остальное (`oneOf`/`anyOf`/`allOf`,
`pattern`, границы чисел, `if/then/else`, ...) не теряется молча — пишется
предупреждением в stderr.

Запуск:
    python tools/schema2yarbp.py schema.json                 # в stdout
    python tools/schema2yarbp.py schema.json -o case.yarbp    # в файл
    python tools/schema2yarbp.py schema.json --check case.yarbp  # только сверить

Код возврата: 0 — ок, 1 — файл не читается/не JSON, 2 — нечего импортировать.
"""

from __future__ import print_function

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from yarbp_text import (  # noqa: E402
    INDENT, Warnings, attr, compare_with_file, configure_streams, quote, read_json,
    schema_lines, write_output,
)

REF_PREFIX = '#/$defs/'


def definitions_of(spec):
    """Схемы документа: `$defs` (2020-12) или `definitions` (черновик-07)."""
    defs = spec.get('$defs')
    if isinstance(defs, dict):
        return defs, '$defs'

    defs = spec.get('definitions')
    if isinstance(defs, dict):
        return defs, 'definitions'

    return {}, None


def convert(spec, warnings):
    """JSON Schema (dict) → текст разметки."""
    lines = ['! как схема', '']

    title = spec.get('title') or 'Схема'
    description = spec.get('description')
    schema_id = spec.get('$id') or spec.get('id')

    defs, origin = definitions_of(spec)
    if origin and origin != '$defs':
        warnings.add('корень', 'раздел «%s» прочитан как $defs' % origin)

    if not defs:
        # Корень сам является схемой: одна схема, имя — из заголовка.
        name = title
        api = 'api = ' + quote(name)
        if schema_id:
            api += ' ' + attr('ид', quote(schema_id))
        if description:
            api += ' ' + attr('описание', quote(description))
        lines.append(api)
        lines.extend(schema_lines(name, spec, warnings, REF_PREFIX, INDENT))
        return '\n'.join(lines) + '\n'

    root_ref = spec.get('$ref')
    root_name = None
    if isinstance(root_ref, str):
        if root_ref.startswith(REF_PREFIX):
            root_name = root_ref[len(REF_PREFIX):]
        else:
            warnings.add('корень', 'ссылка «%s» не на $defs — .корень не задан' % root_ref)

    api = 'api = ' + quote(title)
    if schema_id:
        api += ' ' + attr('ид', quote(schema_id))
    if description:
        api += ' ' + attr('описание', quote(description))
    if root_name:
        api += ' ' + attr('корень', quote(root_name))
    lines.append(api)

    lines.append(INDENT + '..схемы')
    for name, schema in defs.items():
        if not isinstance(schema, dict):
            warnings.add('схема «%s»' % name, 'описание не объектом — пропущена')
            continue
        lines.extend(schema_lines(name, schema, warnings, REF_PREFIX, INDENT * 2))

    if root_name and root_name not in defs:
        warnings.add('корень', '.корень «%s» не объявлен в $defs' % root_name)

    for key in ('type', 'properties', 'required'):
        if key in spec:
            warnings.add('корень', 'поля корня («%s») пропущены: схемы берутся из $defs' % key)

    for key in spec:
        if key in ('$schema', 'title', 'description', '$id', 'id', '$defs',
                   'definitions', '$ref', 'type', 'properties', 'required'):
            continue
        warnings.add('корень', 'раздел «%s» не поддерживается — пропущен' % key)

    return '\n'.join(lines) + '\n'


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
        print('Запуск: python tools/schema2yarbp.py schema.json [-o out.yarbp] [--check case.yarbp]')
        return 1

    try:
        spec = read_json(source)
    except (IOError, OSError) as error:
        print('FAIL не читается «%s»: %s' % (source, error))
        return 1
    except ValueError as error:
        print('FAIL «%s» — не JSON: %s' % (source, error))
        return 1

    if not isinstance(spec, dict):
        print('FAIL «%s» — не объект JSON Schema' % source)
        return 1

    warnings = Warnings()
    text = convert(spec, warnings)
    warnings.print_all(sys.stderr)

    if check:
        return compare_with_file(text, check)

    write_output(text, output)

    defs, _ = definitions_of(spec)
    has_fields = bool(spec.get('properties')) or any(
        isinstance(schema, dict) and schema.get('properties')
        for schema in defs.values())

    if not has_fields:
        print('FAIL импортировать нечего: ни у одной схемы нет properties')
        return 2

    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
