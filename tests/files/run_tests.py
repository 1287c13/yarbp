# -*- coding: utf-8 -*-
"""Файлы и хранилище: обёртка над localStorage и «экспорт→импорт».

Проверки лежат в files.html и выполняются настоящими модулями редактора в
headless Chrome/Edge — как tests/lexer, tests/security и tests/flexforms.
Node не нужен: страница поднимается локальным http.server, браузер отдаёт
готовый DOM (`--dump-dom`), раннер разбирает `<pre id="result">`.

Покрывается:
  D-15  localStorage: запрет хранилища не роняет инициализацию редактора;
  D-12  видимая метка «не сохранено», если запись не прошла (квота/запрет);
  D-16  экспорт сохраняет id/slug/активный файл, импорт не теряет
        идентичность, разводит дубли id, пропускает мусор и не задваивает
        встроенные примеры; старый формат (v1) читается.

Запуск (из корня репозитория):
    python yarbp/tests/files/run_tests.py
"""

from __future__ import print_function

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _harness import PROJECT_NAME, run_browser_suite


def main(argv):
    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    return run_browser_suite(
        PROJECT_NAME + '/tests/files/files.html',
        'FILES PASS',
        'FILES FAIL',
        '1. файлы и хранилище (D-15, D-16)',
        port_start=8959,
        prefix='yarbp-files',
    )


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
