# -*- coding: utf-8 -*-
"""Тесты флейвора «форма-ТСД»: встроенный пример и браузерный дым.

Что проверяется:
  1. Встроенный пример «Форма ТСД» в FileManager: компактная актуальная
     разметка, отсутствие старых пореквизитных блоков и автопараметров,
     адрес сервера в шапке, колоночное описание таблицы.
  2. Дымовой тест в браузере: настоящие модули редактора, регистрация
     флейвора, монтирование предпросмотра примером из «Примеров» и
     совпадение IR примера с builtin-ir.json.

Запуск (из корня репозитория):
    python yarbp/tests/flexforms/run_tests.py
    python yarbp/tests/flexforms/run_tests.py --no-browser  # только пример
    python yarbp/tests/flexforms/run_tests.py --help

Зависимости: Python 3.8+ (только стандартная библиотека) и Chrome/Edge для
браузерного дыма. Внешних JS-пакетов и каталогов вне репозитория нет.
"""

from __future__ import print_function

import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from html import unescape as html_unescape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))            # .../yarbp
REPO = os.path.dirname(ROOT)                            # корень репозитория
FLEXFORMS = os.path.join(ROOT, 'src', 'js', 'classes', 'renderers', 'flexforms')

FILE_MANAGER = os.path.join(ROOT, 'src', 'js', 'modules', 'FileManager.js')
BUILTIN_ID = 'builtin-9'                                # пример «Форма ТСД»
BUILTIN_IR = os.path.join(HERE, 'builtin-ir.json')      # компактный пример → IR
MOCK_PY = os.path.join(ROOT, 'tools', 'flexforms_mock_server.py')
MOCK_JS = os.path.join(FLEXFORMS, 'FlexFormsMockServer.js')

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]

FAILURES = []
SKIPPED = []


def prepare_stdout():
    """Windows-консоль в cp1251 падает на кириллице и тире — переводим в utf-8."""
    stream = getattr(sys, 'stdout', None)
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass


def read_text(path):
    with io.open(path, 'r', encoding='utf-8-sig', newline='') as handle:
        return handle.read().replace('\r\n', '\n').replace('\r', '\n')


def check(name, ok, detail=''):
    if ok:
        print('  ok   %s' % name)
        return True
    FAILURES.append(name)
    print('  FAIL %s%s' % (name, (' — ' + detail) if detail else ''))
    return False


def skip(name, reason):
    SKIPPED.append(name)
    print('  skip %s — %s' % (name, reason))


def first_difference(actual, expected):
    limit = min(len(actual), len(expected))
    for index in range(limit):
        if actual[index] != expected[index]:
            start = max(0, index - 80)
            return 'различие на позиции %d:\n    получено: %r\n    ожидалось: %r' % (
                index, actual[start:index + 80], expected[start:index + 80])
    if len(actual) != len(expected):
        return 'длина %d вместо %d' % (len(actual), len(expected))
    return ''


# --------------------------------------------------------------------------
# 1. Предопределённый пример в редакторе
# --------------------------------------------------------------------------

BUILTIN_ENTRY = re.compile(r"id:\s*'%s'[\s\S]*?content:\s*`([^`]*)`" % re.escape(BUILTIN_ID))


def test_builtin_example():
    """Пример «Форма ТСД» в «Примерах» — компактный актуальный синтаксис."""
    print('1. пример «Форма ТСД» в редакторе — компактный актуальный синтаксис')

    found = BUILTIN_ENTRY.search(read_text(FILE_MANAGER))
    if not check('FileManager: встроенный пример %s' % BUILTIN_ID, found is not None):
        return

    actual = found.group(1).strip('\n')

    check('пример: директива «! как форма-тсд»',
          actual.splitlines()[0].strip() == '! как форма-тсд',
          actual.splitlines()[0].strip())

    old_table = [key for key in ('..измерения', '..ресурсы', '..шапка',
                                 '..именаВПриемнике', '..типы')
                 if key in actual]
    check('пример: нет старого пореквизитного описания таблицы', not old_table,
          ', '.join(old_table))

    old_defaults = [key for key in ('.имяКнопки', '.очиститьФорму', '.перезагрузить',
                                    '.значенияПриемниковПоУмолчанию', '.кнопкаОчистки',
                                    '.автофокус', '.режимСканирования')
                    if key in actual]
    check('пример: автопараметры не дублируются', not old_defaults,
          ', '.join(old_defaults))

    check('пример: адрес сервера задан в шапке',
          '.сервис http://127.0.0.1:8765/rt_m_bot/hs/dp' in actual,
          'нет .сервис в шапке формы')
    check('пример: хук и урл относительные',
          '\n        .хук /link' in actual and '\n    .урл /processing' in actual,
          'хук/урл должны быть относительными (/link, /processing)')
    check('пример: таблица описана поколоночно',
          '\n        :\n          .имя ' in actual and
          '.приемник:Справочник.Номенклатура = Номенклатура' in actual,
          'нет блока колонки таблицы')
    check('пример: «Кол\u2011во» с неразрывным дефисом (U+2011) не нормализован',
          'Кол\u2011во' in actual and 'Кол-во' not in actual,
          'U+2011 потерян — поля таблицы перестанут сопоставляться')

# --------------------------------------------------------------------------
# 2. Мок-сервер: Python-источник и строка для выгрузки
# --------------------------------------------------------------------------

def test_mock_server_source():
    """`FlexFormsMockServer.js` — дословная строка из tools/flexforms_mock_server.py."""
    print('2. мок-сервер: Python-источник == строка для выгрузки')

    js = read_text(MOCK_JS)
    start = js.index('export const FLEX_FORMS_MOCK_SERVER = [')
    end = js.index("].join('\\n');", start)
    body = js[start:end]

    lines = []
    for raw in body.splitlines():
        line = raw.strip().rstrip(',')
        if line.startswith('"') and line.endswith('"'):
            lines.append(json.loads(line))

    actual = '\n'.join(lines)
    expected = read_text(MOCK_PY)
    check('мок-сервер: строка в JS совпадает с Python-файлом',
          actual == expected, first_difference(actual, expected))


# --------------------------------------------------------------------------
# 3. Дымовой тест в браузере
# --------------------------------------------------------------------------

def find_browser():
    for path in BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def find_port(start=8899):
    """Свободный порт для локального сервера тестов."""
    for port in range(start, start + 30):
        sock = socket.socket()
        try:
            sock.bind(('127.0.0.1', port))
            return port
        except OSError:
            continue
        finally:
            sock.close()
    return start


def wait_for_port(port, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        sock = socket.socket()
        sock.settimeout(0.5)
        try:
            sock.connect(('127.0.0.1', port))
            return True
        except OSError:
            time.sleep(0.2)
        finally:
            sock.close()
    return False


def test_browser():
    print('3. дымовой тест в браузере (smoke.html)')
    browser = find_browser()
    if not browser:
        skip('smoke.html', 'не найден Chrome/Edge')
        return

    # ES-модули не грузятся с file:// (opaque origin), поэтому поднимаем
    # локальный http-сервер на корень репозитория — как у настоящего редактора.
    port = find_port()
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Свежий профиль на каждый запуск: иначе Chrome может отдать из кеша
    # старую версию модулей, и дым проверит не тот код, который лежит в репо.
    profile = tempfile.mkdtemp(prefix='yarbp-flexforms-smoke-')

    try:
        if not wait_for_port(port):
            check('smoke.html: сервер тестов поднялся', False, 'порт %d' % port)
            return

        url = 'http://127.0.0.1:%d/yarbp/tests/flexforms/smoke.html' % port
        command = [
            browser,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--virtual-time-budget=15000',
            '--user-data-dir=' + profile,
            '--dump-dom',
            url,
        ]

        process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL)
        try:
            output = process.communicate(timeout=180)[0].decode('utf-8', 'replace')
        except subprocess.TimeoutExpired:
            process.kill()
            check('smoke.html: браузер ответил', False, 'таймаут')
            return
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(profile, ignore_errors=True)

    match = re.search(r'<pre id="result">(.*?)</pre>', output, re.S)
    if not match:
        check('smoke.html: браузер отдал результат', False, output[-600:])
        return

    lines = [line for line in html_unescape(match.group(1)).splitlines() if line.strip()]
    for line in lines:
        print('    ' + line)

    # <title> меняет только сам тест — по нему и видно, что модули выполнились.
    check('smoke.html: модули выполнились', '<title>SMOKE PASS</title>' in output
          or '<title>SMOKE FAIL</title>' in output)

    passed = [line for line in lines if line.startswith('OK')]
    failed = [line for line in lines if line.startswith('FAIL')]

    check('smoke.html: проверки отработали (%d)' % len(passed), len(passed) >= 12,
          ' ok-строк: %d' % len(passed))
    check('smoke.html: все проверки прошли', not failed, '; '.join(failed))

    # IR, собранный в браузере ИЗ ТЕКСТА ПРИМЕРА, должен совпасть с эталоном
    # компактного примера: так проверяется и разметка, и автопараметры,
    # которые подставляет конвертер.
    ir = re.search(r'<pre id="ir"[^>]*>(.*?)</pre>', output, re.S)
    if check('smoke.html: страница отдала IR примера', ir is not None):
        # Chrome на Windows печатает --dump-dom с CRLF — приводим к LF, как read_text.
        actual_ir = html_unescape(ir.group(1)).replace('\r\n', '\n').replace('\r', '\n').strip('\n')
        expected_ir = read_text(BUILTIN_IR).strip('\n')
        check('smoke.html: пример из «Примеров» → компактный IR (побайтово)',
              actual_ir == expected_ir, first_difference(actual_ir, expected_ir))


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def summarise():
    print('')
    if FAILURES:
        print('ПРОВАЛЕНО: %d' % len(FAILURES))
        for name in FAILURES:
            print('  - %s' % name)
        return 1

    print('ВСЁ ЗЕЛЁНОЕ%s' % (' (пропущено: %d)' % len(SKIPPED) if SKIPPED else ''))
    return 0


def main(argv):
    prepare_stdout()

    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    unknown = [arg for arg in argv if arg != '--no-browser']
    if unknown:
        print('Неизвестные аргументы: %s' % ' '.join(unknown))
        print(__doc__)
        return 2

    test_builtin_example()
    test_mock_server_source()

    if '--no-browser' not in argv:
        test_browser()
    else:
        skip('smoke.html', 'нужен браузер: пример → IR проверяется настоящими модулями редактора')

    return summarise()


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

