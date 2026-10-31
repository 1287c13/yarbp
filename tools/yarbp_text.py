# -*- coding: utf-8 -*-
"""Общие помощники инструментов «JSON → разметка ЯРБП».

Сейчас их два: `openapi2yarbp.py` и `schema2yarbp.py`. Оба пишут одно и то же —
`.ключ значение` и кавычки по правилам разметки, — поэтому правила живут здесь:
иначе два инструмента разъедутся в трактовке кавычек, а это ровно тот класс
ошибок, который потом ищут глазами.

Модуль без зависимостей: только стандартная библиотека.
"""

from __future__ import print_function

import sys

# Значения, которые лексер разметки превращает в литералы: их нельзя писать
# «как есть», иначе вместо строки получится boolean/null.
LITERALS = ('да', 'нет', 'yes', 'no', 'null', 'true', 'false')

INDENT = '  '


class Warnings(object):
    """Копилка предупреждений: печатаются в stderr, в разметку не попадают."""

    def __init__(self):
        self.items = []

    def add(self, where, message):
        self.items.append('%s: %s' % (where, message))

    def print_all(self, stream):
        for item in self.items:
            print('warning: ' + item, file=stream)


def configure_streams():
    """stdout/stderr в UTF-8: иначе на Windows кириллица приходит в cp866."""
    for name in ('stdout', 'stderr'):
        stream = getattr(sys, name, None)
        if stream is not None and hasattr(stream, 'reconfigure'):
            try:
                stream.reconfigure(encoding='utf-8', errors='replace')
            except (ValueError, OSError):
                pass


def quote(value):
    """Значение для разметки: простое — как есть, иначе в кавычках.

    Разметка не умеет экранировать `"`, поэтому кавычки внутри заменяются на
    апостроф: молча сломанная строка хуже неточной кавычки.
    """
    text = str(value)
    text = text.replace('\r', ' ').replace('\n', ' ').strip()
    if not text:
        return '""'

    safe = all(ch not in text for ch in ' \t"\'') and not text.startswith('.')
    if safe and text.lower() not in LITERALS:
        return text

    return '"' + text.replace('"', "'") + '"'


def attr(name, value):
    """Атрибут с точкой: `.тип строка`."""
    return '.' + name + ' ' + value


def write_output(text, output):
    """Куда положить результат: в файл или в stdout."""
    if output:
        import io
        with io.open(output, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(text)
        print('записан «%s» (%d строк)' % (output, len(text.splitlines())))
        return

    print(text, end='')


def compare_with_file(text, path):
    """`--check`: сверка с закоммиченным кейсом. Возвращает 0/1."""
    import io
    try:
        with io.open(path, 'r', encoding='utf-8') as handle:
            expected = handle.read()
    except (IOError, OSError) as error:
        print('FAIL не читается «%s»: %s' % (path, error))
        return 1

    if expected.replace('\r\n', '\n') != text:
        print('FAIL «%s» не совпадает с импортом: переснимите через -o' % path)
        return 1

    print('ok   «%s» совпадает с импортом' % path)
    return 0


def read_json(path):
    """Чтение JSON: файл (`-` — stdin), UTF-8 с BOM допускается."""
    import io
    import json

    if path == '-':
        raw = sys.stdin.read()
    else:
        with io.open(path, 'r', encoding='utf-8-sig') as handle:
            raw = handle.read()
    return json.loads(raw)


# Типы JSON Schema → типы разметки (обратная таблица к schemaFields.js).
TYPES_TO_DSL = {
    'string':  'строка',
    'integer': 'целое',
    'number':  'число',
    'boolean': 'логическое',
    'array':   'массив',
    'object':  'объект',
}

# Поля JSON Schema, которых разметка не знает: о них предупреждаем, а не молчим.
UNSUPPORTED_FIELD_KEYS = ('oneOf', 'anyOf', 'allOf', 'additionalProperties',
                          'pattern', 'patternProperties', 'properties',
                          'minimum', 'maximum', 'minLength', 'maxLength',
                          'minItems', 'maxItems', 'uniqueItems', 'const',
                          'default', 'examples', 'deprecated', '$comment')


def field_line(field, name, required, warnings, where, ref_prefix):
    """Одно поле схемы → строка разметки `поле = …`.

    Общая часть обоих импортёров: у OpenAPI и JSON Schema поля описываются
    одинаково, отличается только префикс ссылки (`#/components/schemas/` против
    `#/$defs/`).
    """
    parts = ['поле = ' + quote(name)]

    ref = field.get('$ref')
    if isinstance(ref, str):
        if not ref.startswith(ref_prefix):
            warnings.add(where, 'ссылка «%s» не на %s — пропущена' % (ref, ref_prefix))
            return None
        parts.append(attr('тип', 'ссылка:' + ref[len(ref_prefix):]))
    else:
        raw_type = field.get('type')
        if raw_type is None:
            parts.append(attr('тип', 'строка'))
        elif raw_type in TYPES_TO_DSL:
            parts.append(attr('тип', TYPES_TO_DSL[raw_type]))
        else:
            warnings.add(where, 'тип «%s» не поддерживается — подставлена строка' % raw_type)
            parts.append(attr('тип', 'строка'))

        items = field.get('items')
        if isinstance(items, dict):
            item_type = items.get('type')
            if item_type in TYPES_TO_DSL:
                parts.append(attr('элемент', TYPES_TO_DSL[item_type]))
            else:
                warnings.add(where, 'элемент массива без типа — подставлена строка')

    if field.get('format'):
        parts.append(attr('формат', quote(field['format'])))
    if field.get('description'):
        parts.append(attr('описание', quote(field['description'])))

    for value in field.get('enum') or []:
        parts.append(attr('значение', quote(value)))

    if required:
        parts.append(attr('обязательное', 'да'))

    for unsupported in UNSUPPORTED_FIELD_KEYS:
        if unsupported in field:
            hint = ''
            if unsupported in ('properties', 'patternProperties'):
                hint = ' — вложенный объект поднимите в отдельную схему'
            warnings.add(where, '«%s» в поле «%s» не поддерживается%s'
                         % (unsupported, name, hint))

    return ' '.join(parts)


def schema_lines(name, schema, warnings, ref_prefix, indent):
    """`схема = Имя` + её поля (для OpenAPI и JSON Schema одинаково)."""
    where = 'схема «%s»' % name
    lines = [indent + 'схема = ' + quote(name)]

    if schema.get('description'):
        lines[0] += ' ' + attr('описание', quote(schema['description']))

    properties = schema.get('properties') or {}
    required = set(schema.get('required') or [])

    if not properties:
        warnings.add(where, 'нет properties — схема получится пустой')

    for field_name, field in properties.items():
        if not isinstance(field, dict):
            warnings.add(where, 'поле «%s» описано не объектом — пропущено' % field_name)
            continue
        line = field_line(field, field_name, field_name in required, warnings,
                          where + ', поле «%s»' % field_name, ref_prefix)
        if line:
            lines.append(indent + INDENT + line)

    return lines
