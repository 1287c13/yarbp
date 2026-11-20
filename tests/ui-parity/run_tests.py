# -*- coding: utf-8 -*-
"""Сверка UI-генератора с эталоном notes/design/target.html.

Проверки лежат в parity.html и выполняются настоящими ES-модулями редактора
в headless Chrome/Edge: страница собирает пример «ui-order-form», строит по
нему HTML, нормализует деревья (пробелы, порядок классов, служебные атрибуты
не в счёт) и сравнивает с `.form-container` из эталона. Отдельно проверяются
вычисленные стили (сетка, карточки, медиазапрос 768px) и поведение рантайма.

Запуск (из корня репозитория):
    python yarbp/tests/ui-parity/run_tests.py
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
        PROJECT_NAME + '/tests/ui-parity/parity.html',
        'UI PARITY PASS',
        'UI PARITY FAIL',
        '10. UI-форма: сверка с notes/design/target.html буква-в-букву',
        port_start=9041,
        prefix='yarbp-ui-parity',
    )


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
