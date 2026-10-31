# -*- coding: utf-8 -*-
"""Тесты обратного импорта OpenAPI → ЯРБП (`tools/openapi2yarbp.py`).

Проверяется три вещи:

1. инструмент собирает разметку из спецификации и она не «съехала» — сверка с
   закоммиченным кейсом `tests/converters/cases/openapi_imported.yarbp`;
2. неподдерживаемое не теряется молча: parameters, тело ответа, oneOf и прочее
   попадают в stderr предупреждениями;
3. пустая спецификация даёт код 2 и понятное сообщение.

Вторую половину круга (ЯРБП → OpenAPI → сверка с `spec.json`) проверяет
браузерный набор `tests/converters` — там настоящий конвертер редактора.

Запуск: python yarbp/tests/openapi2yarbp/run_tests.py
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
TOOL = os.path.join(ROOT, 'tools', 'openapi2yarbp.py')
SPEC = os.path.join(HERE, 'spec.json')
CASE = os.path.join(ROOT, 'tests', 'converters', 'cases', 'openapi_imported.yarbp')


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
        if isinstance(payload, str):
            handle.write(payload)
        else:
            handle.write(json.dumps(payload, ensure_ascii=False))
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
        lines.append(('ok   ' if ok else 'FAIL ') + name + ('' if ok or not detail else ' — ' + detail))

    print('1. импорт OpenAPI → ЯРБП')

    code, out, err = run_tool([SPEC, '--check', CASE])
    check('импорт совпадает с закоммиченным кейсом', code == 0,
          (out + err).strip().splitlines()[-1] if (out + err).strip() else 'код %d' % code)
    check('на поддерживаемой спеке предупреждений нет', err.strip() == '', err.strip())

    with io.open(CASE, encoding='utf-8') as handle:
        case_text = handle.read()

    for expected in ('! как openapi', 'api = Заказы .версия 1.0.0',
                     '..пути', 'путь = /orders', 'метод = get .операция "Список заказов"',
                     '.запрос Заказ', '..схемы', 'поле = id .тип целое .формат int64',
                     '.тип ссылка:Клиент', '.значение new .значение paid'):
        check('в разметке есть «%s»' % expected, expected in case_text)

    print('')
    print('2. предупреждения о неподдерживаемом')

    noisy = {
        'openapi': '3.0.3',
        'info': {'title': 'Прочее', 'version': '2.0.0'},
        'security': [{'apiKey': []}],
        'paths': {
            '/x': {
                'parameters': [{'name': 'id', 'in': 'path'}],
                'get': {
                    'summary': 'Тест',
                    'deprecated': True,
                    'responses': {'200': {'description': 'OK',
                                          'content': {'application/json': {'schema': {}}}}},
                },
            },
        },
        'components': {
            'schemas': {
                'A': {
                    'type': 'object',
                    'properties': {
                        'one': {'oneOf': [{'type': 'string'}, {'type': 'integer'}]},
                        'bad': {'type': 'сторинг'},
                    },
                },
            },
        },
    }
    path = write_temp(noisy)
    try:
        code, out, err = run_tool([path])
    finally:
        os.unlink(path)

    check('код возврата 0 (импорт возможен)', code == 0, 'код %d' % code)
    for expected in ('раздел «security» не поддерживается',
                     'parameters не поддерживаются',
                     'поле «deprecated» не поддерживается',
                     'тело ответа 200 не поддерживается',
                     '«oneOf» в поле «one» не поддерживается',
                     'тип «сторинг» не поддерживается'):
        check('предупреждение: %s' % expected, expected in err, err.strip())

    check('непонятый тип подменён строкой, а не потерян', '.тип строка' in out, out.strip())

    print('')
    print('3. пустая спецификация')

    empty = write_temp({'openapi': '3.0.3', 'info': {'title': 'Пусто', 'version': '1'}})
    try:
        code, out, err = run_tool([empty])
    finally:
        os.unlink(empty)

    check('код возврата 2', code == 2, 'код %d' % code)
    check('сообщение «импортировать нечего»', 'импортировать нечего' in out, out.strip())

    print('')
    print('4. битый вход')

    broken = write_temp('{ "openapi": ')
    try:
        code, out, err = run_tool([broken])
    finally:
        os.unlink(broken)
    check('не JSON — код 1 и сообщение', code == 1 and 'не JSON' in out, out.strip())

    code, out, err = run_tool([os.path.join(HERE, 'нет-такого.json')])
    check('нет файла — код 1 и сообщение', code == 1 and 'не читается' in out, out.strip())

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
