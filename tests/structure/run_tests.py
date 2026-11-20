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

import functools
import http.server
import os
import re
import sys
import threading
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'src', 'js')
SRC_ROOT = os.path.join(ROOT, 'src')
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


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Статический сервер без строк в консоль."""

    def log_message(self, format, *args):
        pass


HTTP_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def start_static_server(directory):
    handler = functools.partial(QuietHandler, directory=directory)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def stop_static_server(server, thread):
    server.shutdown()
    server.server_close()
    if thread is not None:
        thread.join(timeout=5)


def http_get(port, path):
    with HTTP_OPENER.open('http://127.0.0.1:%d%s' % (port, path),
                          timeout=10) as response:
        return response.status, response.read()


def check_font_serving():
    """CSS-путь к шрифтам должен работать в обоих режимах раздачи."""
    css_path = os.path.join(SRC_ROOT, 'css', 'editor.css')
    css = read(css_path)
    check('шрифты: CSS использует относительный ../fonts',
          "url('../fonts/JetBrainsMono-Regular.woff2')" in css and
          "url('../fonts/JetBrainsMono-Bold.woff2')" in css,
          'ожидается url(\'../fonts/...\'), а не абсолютный /src/fonts')

    layouts = [
        ('src как корень', SRC_ROOT, ''),
        ('корень репозитория', ROOT, 'src/'),
    ]
    for label, directory, prefix in layouts:
        server = None
        thread = None
        try:
            server, thread = start_static_server(directory)
            port = server.server_address[1]

            status, body = http_get(port, '/' + prefix + 'index.html')
            check('шрифты (%s): index.html отдаётся' % label,
                  status == 200 and len(body) > 0)

            status, body = http_get(port, '/' + prefix + 'css/editor.css')
            check('шрифты (%s): editor.css отдаётся' % label,
                  status == 200 and b"url('../fonts/" in body)

            status, body = http_get(
                port, '/' + prefix + 'fonts/JetBrainsMono-Regular.woff2')
            check('шрифты (%s): woff2 отдаётся' % label,
                  status == 200 and body[:4] == b'wOF2')
        except Exception as error:  # noqa: BLE001 — тест должен показать причину
            check('шрифты (%s): проверка выполнилась' % label,
                  False, str(error))
        finally:
            if server is not None:
                stop_static_server(server, thread)


def check_test_catalog():
    """tests/run_all.py должен знать все наборы из tests/*/run_tests.py."""
    tests_dir = os.path.dirname(HERE)
    run_all = read(os.path.join(tests_dir, 'run_all.py'))
    block = run_all.split('SUITES = [', 1)[-1].split(']', 1)[0]
    suites = set(re.findall(r"\('([^']+)',\s*'([^']+)'\)", block))
    suite_names = {name for name, _ in suites}

    folders = {
        name for name in os.listdir(tests_dir)
        if os.path.isfile(os.path.join(tests_dir, name, 'run_tests.py'))
    }

    missing = sorted(folders - suite_names)
    extra = sorted(suite_names - folders)
    check('run_all: все наборы tests/ подключены', not missing,
          ', '.join(missing))
    check('run_all: нет несуществующих наборов', not extra,
          ', '.join(extra))
    check('run_all: имя набора совпадает с папкой',
          all(name == folder for name, folder in suites))


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

    check_font_serving()
    check_test_catalog()

    print('\n'.join(checks))
    print('')
    print('ВСЕ ЗЕЛЕНО (проверок: %d)' % len(checks) if not failed else
          'ЕСТЬ ПРОВАЛЕННЫЕ ПРОВЕРКИ (проверок: %d, провалов: %d)' %
          (len(checks), failed))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
