# -*- coding: utf-8 -*-
"""Тесты новых возможностей ЯРБП: подстановка, код-блоки, значение с новой строки, подсветка.

Проверки лежат в features.html и выполняются настоящими ES-модулями редактора
в headless Chrome/Edge — как tests/lexer и tests/security. Node не нужен:
страница поднимается локальным http.server, браузер отдаёт готовый DOM
(`--dump-dom`), раннер разбирает `<pre id="result">`.

Покрывается:
  - (( имя )) вне макроса: один ключ, несколько использований, отсутствие ключа,
    объект-источник, ортогональность макросам;
  - фрагмент кода: одинарный и тройной fence, язык/без языка, сырой текст,
    AST, макрос-параметр, незакрытый блок;
  - значение примитивного ключа с новой строки: строка, число, булево, null,
    код-блок, отсутствие значения;
  - кейс 44_bsl_code: исходная и ожидаемая разметка дают эквивалентный AST;
  - конвертеры JSON/XML/proto на фрагменте кода;
  - отложенная подсветка встроенных языков (BSL/JS/SQL), кулдаун,
    отсутствие подсветки без языка, сохранение курсора/выделения;
  - BSL — традиционная схема 1С: красные ключевые/операторы, синие
    идентификаторы, зелёные комментарии, чёрные строки/числа, коричневый
    препроцессор;
  - подсказки внутри CODE_BLOCK не вызываются (включая Alt), вне блока — работают.

Запуск (из корня репозитория):
    python yarbp/tests/features/run_tests.py
"""

from __future__ import print_function

import io
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
ROOT = os.path.dirname(os.path.dirname(HERE))      # .../yarbp
REPO = os.path.dirname(ROOT)                      # корень репозитория
PROJECT_NAME = os.path.basename(ROOT)
PAGE_PATH = '%s/tests/features/features.html' % PROJECT_NAME

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''),
                 r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]


def prepare_stdout():
    """Windows-консоль в cp1251 иначе падает на кириллице и тире."""
    stream = getattr(sys, 'stdout', None)
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass


def find_browser():
    env_browser = os.environ.get('YARBP_BROWSER')
    if env_browser and os.path.isfile(env_browser):
        return env_browser

    for name in ('google-chrome', 'google-chrome-stable', 'chromium',
                 'chromium-browser', 'chrome', 'msedge'):
        path = shutil.which(name)
        if path:
            return path

    for path in BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def find_port(start=9011):
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


def start_server():
    port = find_port()
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not wait_for_port(port):
        stop_server(server)
        raise RuntimeError('http.server не поднялся на порту %d' % port)

    return server, port


def stop_server(server):
    try:
        server.terminate()
    except OSError:
        return

    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()


def run_page(port, browser):
    profile = tempfile.mkdtemp(prefix='yarbp-features-')
    url = 'http://127.0.0.1:%d/%s?t=%d' % (port, PAGE_PATH, int(time.time() * 1000))

    command = [
        browser,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--virtual-time-budget=30000',
        '--user-data-dir=' + profile,
        '--dump-dom',
        url,
    ]

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL)
        try:
            return process.communicate(timeout=240)[0].decode('utf-8', 'replace')
        except subprocess.TimeoutExpired:
            process.kill()
            raise RuntimeError('браузер не ответил за 240 секунд')
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def result_lines(output):
    match = re.search(r'<pre id="result"[^>]*>(.*?)</pre>', output, re.S)
    if match is None:
        return None
    text = html_unescape(match.group(1))
    return [line for line in text.splitlines() if line.strip()]


def main(argv):
    prepare_stdout()

    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    browser = find_browser()
    if not browser:
        print('FAIL не найден Chrome/Edge: укажите браузер вручную')
        return 1

    print('1. новые возможности: подстановка, код-блоки, значение с новой строки, подсветка')

    server, port = start_server()
    try:
        output = run_page(port, browser)
    finally:
        stop_server(server)

    lines = result_lines(output)
    if lines is None:
        print('  FAIL браузер не отдал <pre id="result">')
        print(output[-800:])
        return 1

    for line in lines:
        print('  ' + line)

    if '<title>FEATURES PASS</title>' not in output:
        if '<title>FEATURES FAIL</title>' not in output:
            print('  FAIL страница не выполнилась (нет итогового title)')
            print(output[-800:])
        else:
            print('  FAIL есть проваленные проверки')
        return 1

    if any(line.startswith('FAIL') for line in lines):
        print('  FAIL есть проваленные проверки')
        return 1

    print('')
    print('ВСЁ ЗЕЛЁНОЕ (проверок: %d)' % len(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
