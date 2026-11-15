# -*- coding: utf-8 -*-
"""Регрессии безопасности ЯРБП: «на входе тег — на выходе нет живого тега».

Проверки лежат в security.html и выполняются настоящими ES-модулями редактора
в headless Chrome/Edge — как tests/lexer и tests/flexforms. Node не нужен:
страница поднимается локальным http.server, браузер отдаёт готовый DOM
(`--dump-dom`), раннер разбирает `<pre id="result">`.

Покрывается:
  D-01  IR формы в `<data>` и чтение IR движком (значения не искажаются);
  D-02  id и имя поля в шаблонах движка формы;
  D-03  data-id в списке файлов (id приходит из импортируемого JSON);
  D-04  слой подсветки редактора;
  D-14  панель результата для плоских флейворов (lexer/ast/json/proto).

Запуск (из корня репозитория):
    python yarbp/tests/security/run_tests.py
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
        PROJECT_NAME + '/tests/security/security.html',
        'SECURITY PASS',
        'SECURITY FAIL',
        '1. регрессии безопасности (D-01, D-02, D-03, D-04, D-14)',
        port_start=8977,
        prefix='yarbp-security',
    )


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
