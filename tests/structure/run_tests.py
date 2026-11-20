# -*- coding: utf-8 -*-
"""Проверка контракта каталогов конвертеров.

Запуск из корня репозитория:
    python yarbp/tests/structure/run_tests.py

Проверяется не поведение форматов, а организация кода:
  - у каждого зарегистрированного конвертера есть каталог и index.js;
  - конвертер не импортирует чужой каталог `converters/<id>/`;
  - все относительные import/import()/new URL() в src/js резолвятся;
  - старые каталоги (`classes/ast-converters`, `classes/renderers`,
    `classes/ui`, `classes/YarbpFlavor.js`) не вернулись.
"""

from __future__ import print_function

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'src', 'js')
CONVERTERS = os.path.join(SRC, 'converters')

checks = []
failed = 0


def check(name, ok, detail=''):
    global failed
    if not ok:
        failed += 1
    line = ('ok   ' if ok else 'FAIL ') + name
    if detail and not ok:
        line += ' — ' + detail
    checks.append(line)


def read(path):
    return open(path, encoding='utf-8').read()


def relative_modules(start, text):
    patterns = [
        re.compile(r"""from\s+['"]([^'"]+)['"]"""),
        re.compile(r"""import\(\s*['"]([^'"]+)['"]\s*\)"""),
        re.compile(r"""new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url"""),
    ]
    for pattern in patterns:
        for match in pattern.finditer(text):
            spec = match.group(1)
            if not spec.startswith('.'):
                continue
            yield spec, os.path.normpath(os.path.join(start, spec))


def module_path(path):
    return os.path.relpath(path, ROOT).replace('\\', '/')


def main():
    registry = read(os.path.join(CONVERTERS, 'registry.js'))
    ids = sorted(set(re.findall(r"""from\s+['"]\./([a-z0-9-]+)/index\.js['"]""", registry)))
    check('реестр импортирует index.js конвертеров', len(ids) >= 10, ', '.join(ids))

    for converter_id in ids:
        folder = os.path.join(CONVERTERS, converter_id)
        index = os.path.join(folder, 'index.js')
        check('конвертер ' + converter_id + ': есть index.js', os.path.isfile(index))
        if not os.path.isfile(index):
            continue
        source = read(index)
        check('конвертер ' + converter_id + ': определён через defineConverter',
              'defineConverter' in source)
        if converter_id not in ('lexer', 'ast'):
            check('конвертер ' + converter_id + ': есть converter.js',
                  os.path.isfile(os.path.join(folder, 'converter.js')))
        check('конвертер ' + converter_id + ': есть renderer.js',
              os.path.isfile(os.path.join(folder, 'renderer.js')))

    # Конвертер не должен тянуть чужой каталог.
    for converter_id in ids:
        folder = os.path.join(CONVERTERS, converter_id)
        for dirpath, _, filenames in os.walk(folder):
            for filename in filenames:
                if not filename.endswith('.js'):
                    continue
                path = os.path.join(dirpath, filename)
                for spec, target in relative_modules(dirpath, read(path)):
                    rel = module_path(target)
                    match = re.match(r'src/js/converters/([a-z0-9-]+)/', rel)
                    if match and match.group(1) not in (converter_id, 'shared'):
                        check('конвертер ' + converter_id + ': не импортирует чужой каталог',
                              False, module_path(path) + ' -> ' + spec)

    # Все относительные импорты в src/js должны резолвиться.
    broken = []
    total = 0
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [name for name in dirnames if name not in ('__pycache__', '.git')]
        for filename in filenames:
            if not filename.endswith('.js'):
                continue
            path = os.path.join(dirpath, filename)
            for spec, target in relative_modules(dirpath, read(path)):
                total += 1
                if not os.path.exists(target):
                    broken.append(module_path(path) + ' -> ' + spec)
    check('src/js: относительные импорты резолвятся (' + str(total) + ')',
          not broken, '; '.join(broken[:8]))

    legacy = [
        'src/js/classes/ast-converters',
        'src/js/classes/renderers',
        'src/js/classes/ui',
        'src/js/classes/YarbpFlavor.js',
    ]
    for rel in legacy:
        check('нет старого пути ' + rel, not os.path.exists(os.path.join(ROOT, rel)))

    print('\n'.join(checks))
    print('')
    print('ВСЕ ЗЕЛЕНО (проверок: %d)' % len(checks) if not failed else
          'ЕСТЬ ПРОВАЛЕННЫЕ ПРОВЕРКИ (проверок: %d, провалов: %d)' %
          (len(checks), failed))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
