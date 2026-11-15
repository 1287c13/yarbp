# -*- coding: utf-8 -*-
"""Запуск всех наборов тестов ЯРБП одной командой.

Запуск из любого каталога:
    python tests/run_all.py
    python tests/run_all.py --suite converters
    python tests/run_all.py --list

Раннеры остаются самостоятельными: run_all.py — это единая точка входа для
локальной проверки и CI, а не замена их внутренностям.
"""

from __future__ import print_function

import io
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SUITES = [
    ('lexer', 'lexer'),
    ('security', 'security'),
    ('files', 'files'),
    ('features', 'features'),
    ('converters', 'converters'),
    ('flexforms', 'flexforms'),
    ('openapi2yarbp', 'openapi2yarbp'),
    ('schema2yarbp', 'schema2yarbp'),
]


def prepare_stdout():
    stream = getattr(sys, 'stdout', None)
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass


def parse_args(argv):
    selected = None
    list_only = False
    passthrough = []
    json_path = None
    junit_path = None

    for index, arg in enumerate(argv):
        if arg == '--list':
            list_only = True
        elif arg in ('--json', '--junit'):
            if index + 1 >= len(argv):
                raise SystemExit('%s требует путь к файлу' % arg)
            if arg == '--json':
                json_path = argv[index + 1]
            else:
                junit_path = argv[index + 1]
        elif arg == '--suite':
            if index + 1 >= len(argv):
                raise SystemExit('--suite требует имя набора')
            selected = argv[index + 1]
        elif arg == '--':
            passthrough = argv[index + 1:]
            break

    return selected, list_only, passthrough, json_path, junit_path


def write_json(path, results, total_time):
    payload = {
        'ok': all(ok for _, ok, _ in results),
        'time': round(total_time, 3),
        'suites': [
            {'name': name, 'ok': ok, 'time': round(elapsed, 3)}
            for name, ok, elapsed in results
        ],
    }
    with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')


def write_junit(path, results, total_time):
    root = ET.Element('testsuites', {
        'tests': str(len(results)),
        'failures': str(sum(1 for _, ok, _ in results if not ok)),
        'time': '%.3f' % total_time,
    })
    for name, ok, elapsed in results:
        suite = ET.SubElement(root, 'testsuite', {
            'name': name,
            'tests': '1',
            'failures': '0' if ok else '1',
            'time': '%.3f' % elapsed,
        })
        case = ET.SubElement(suite, 'testcase', {
            'classname': 'yarbp.tests.' + name,
            'name': name,
            'time': '%.3f' % elapsed,
        })
        if not ok:
            ET.SubElement(case, 'failure', {'message': 'набор завершился с ошибкой'})
    tree = ET.ElementTree(root)
    tree.write(path, encoding='utf-8', xml_declaration=True)


def main(argv):
    prepare_stdout()
    selected, list_only, passthrough, json_path, junit_path = parse_args(argv)

    if list_only:
        for name, _ in SUITES:
            print(name)
        return 0

    suites = SUITES
    if selected:
        suites = [item for item in SUITES if item[0] == selected]
        if not suites:
            print('Неизвестный набор: %s' % selected)
            print('Доступные: %s' % ', '.join(name for name, _ in SUITES))
            return 2

    results = []
    started_all = time.time()

    for name, folder in suites:
        script = os.path.join(HERE, folder, 'run_tests.py')
        print('')
        print('=' * 72)
        print('НАБОР: %s' % name)
        print('=' * 72)

        if not os.path.isfile(script):
            print('FAIL: нет раннера %s' % script)
            results.append((name, False, 0.0))
            continue

        started = time.time()
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        command = [sys.executable, script] + passthrough
        code = subprocess.call(command, cwd=ROOT, env=env)
        elapsed = time.time() - started
        results.append((name, code == 0, elapsed))

    print('')
    print('=' * 72)
    print('ИТОГ')
    print('=' * 72)

    failed = 0
    for name, ok, elapsed in results:
        print('%-18s %s  %5.1f c' % (name, 'OK' if ok else 'FAIL', elapsed))
        if not ok:
            failed += 1

    total_time = time.time() - started_all
    print('-' * 72)
    print('Всего: %d, успешно: %d, провалов: %d, время: %.1f c'
          % (len(results), len(results) - failed, failed, total_time))

    if json_path:
        write_json(json_path, results, total_time)
        print('JSON: %s' % json_path)
    if junit_path:
        write_junit(junit_path, results, total_time)
        print('JUnit: %s' % junit_path)

    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
