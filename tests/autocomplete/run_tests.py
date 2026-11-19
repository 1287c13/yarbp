# -*- coding: utf-8 -*-
"""Сценарный UI-тест автодополнения конвертера ТСД.

Проверяется не словарь сам по себе, а поведение редактора глазами
пользователя: пустой документ, Alt/Ctrl+Space/Escape, Tab в начале строки,
фильтрация по буквам и сборка полной формы ТСД только подсказками
(произвольные значения — ссылки, иды, код — набираются руками).

Запуск (из корня репозитория):
    python yarbp/tests/autocomplete/run_tests.py
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
        PROJECT_NAME + '/tests/autocomplete/autocomplete.html',
        'AUTOCOMPLETE PASS',
        'AUTOCOMPLETE FAIL',
        '1. автодополнение ТСД: Tab/Alt/Escape, фильтрация и полная разметка',
        port_start=9031,
        prefix='yarbp-autocomplete',
        virtual_time_budget=45000,
    )


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
