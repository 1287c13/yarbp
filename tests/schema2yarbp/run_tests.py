# -*- coding: utf-8 -*-
"""Тесты обратного импорта JSON Schema → ЯРБП (`tools/schema2yarbp.py`).

Проверяется то же, что у импорта OpenAPI:

1. разметка стабильна — сверка с закоммиченным кейсом
   `tests/converters/cases/schema_imported.yarbp` (`--check`);
2. неподдерживаемое не теряется молча (oneOf, pattern, поля корня и т.п.);
3. пустая схема и битый вход дают понятные коды возврата.

Вторую половину круга (ЯРБП → JSON Schema → сверка с `schema.json`) проверяет
браузерный набор `tests/converters`.

Запуск: python yarbp/tests/schema2yarbp/run_tests.py
"""

from __future__ import print_function

import io
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))      # .../yarbp
TOOL = os.path.join(ROOT, 'tools', 'schema2yarbp.py')
SCHEMA = os.path.join(HERE, 'schema.json')
CASE = os.path.join(ROOT, 'tests', 'converters', 'cases', 'schema_imported.yarbp')


def prepare_stdout():
    stream = getattr(sys, 'stdout', None)
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass


def run_tool(args):
    process = subprocess.Popen(
        [sys.executable, '-B', TOOL] + args,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = process.communicate()
    return (process.returncode,
            out.decode('utf-8', 'replace'),
            err.decode('utf-8', 'replace'))


def write_temp(payload):
    handle = tempfile.NamedTemporaryFile(
        mode='w', suffix='.json', delete=False, encoding='utf-8')
    try:
        handle.write(payload if isinstance(payload, str)
                     else json.dumps(payload, ensure_ascii=False))
    finally:
        handle.close()
    return handle.name


def main(argv):
    prepare_stdout()

    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    lines = []
    failed = 0

    def check(name, ok, detail=''):
        nonlocal failed
        if not ok:
            failed += 1
        lines.append(('ok   ' if ok else 'FAIL ') + name +
                     ('' if ok or not detail else ' — ' + detail))

    print('1. импорт JSON Schema → ЯРБП')

    code, out, err = run_tool([SCHEMA, '--check', CASE])
    check('импорт совпадает с закоммиченным кейсом', code == 0,
          (out + err).strip().splitlines()[-1] if (out + err).strip() else 'код %d' % code)
    check('на поддерживаемой схеме предупреждений нет', err.strip() == '', err.strip())

    with io.open(CASE, encoding='utf-8') as handle:
        case_text = handle.read()

    for expected in ('! как схема', 'api = Заказ', '.корень Заказ',
                     '..схемы', 'схема = Заказ', 'поле = id .тип целое .формат int64',
                     '.тип ссылка:Клиент', '.значение new .значение paid',
                     '.ид https://example.com/order.schema.json'):
        check('в разметке есть «%s»' % expected, expected in case_text)

    print('')
    print('2. предупреждения и коды возврата')

    noisy = {
        '$schema': 'https://json-schema.org/draft/2020-12/schema',
        'title': 'Прочее',
        'type': 'object',
        'properties': {'rootField': {'type': 'string'}},
        'oneOf': [{'type': 'object'}],
        '$defs': {
            'A': {
                'type': 'object',
                'properties': {
                    'x': {'oneOf': [{'type': 'string'}, {'type': 'integer'}]},
                    'y': {'type': 'string', 'pattern': '^a'},
                    'z': {'type': 'сторинг'},
                    'nested': {'type': 'object',
                               'properties': {'inner': {'type': 'string'}}},
                },
            },
        },
    }
    path = write_temp(noisy)
    try:
        code, out, err = run_tool([path])
    finally:
        os.unlink(path)

    check('код возврата 0', code == 0, 'код %d' % code)
    for expected in ('поля корня («type») пропущены',
                     'раздел «oneOf» не поддерживается',
                     '«oneOf» в поле «x» не поддерживается',
                     '«pattern» в поле «y» не поддерживается',
                     'тип «сторинг» не поддерживается',
                     '«properties» в поле «nested» не поддерживается'):
        check('предупреждение: %s' % expected, expected in err, err.strip())

    # корень-схема без $defs
    flat = {'title': 'Точка', 'type': 'object',
            'properties': {'x': {'type': 'number'}}, 'required': ['x']}
    path = write_temp(flat)
    try:
        code, out, err = run_tool([path])
    finally:
        os.unlink(path)
    check('схема без $defs импортируется как одна схема',
          code == 0 and 'схема = Точка' in out and 'поле = x .тип число' in out,
          out.strip()[:120])

    # definitions из черновика-07
    legacy = {'definitions': {'Старое': {'properties': {'a': {'type': 'string'}}}}}
    path = write_temp(legacy)
    try:
        code, out, err = run_tool([path])
    finally:
        os.unlink(path)
    check('определения из «definitions» читаются',
          code == 0 and 'схема = Старое' in out and 'как $defs' in err, err.strip())

    empty = write_temp({'title': 'Пусто', '$defs': {'A': {'type': 'object'}}})
    try:
        code, out, err = run_tool([empty])
    finally:
        os.unlink(empty)
    check('нечего импортировать — код 2', code == 2, 'код %d' % code)
    check('сообщение «импортировать нечего»', 'импортировать нечего' in out, out.strip())

    broken = write_temp('{ "title": ')
    try:
        code, out, err = run_tool([broken])
    finally:
        os.unlink(broken)
    check('не JSON — код 1 и сообщение', code == 1 and 'не JSON' in out, out.strip())

    print('')
    for line in lines:
        print('  ' + line)

    print('')
    if failed:
        print('ЕСТЬ ПРОВАЛЫ: %d из %d' % (failed, len(lines)))
        return 1
    print('ВСЁ ЗЕЛЁНОЕ (проверок: %d)' % len(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
