# -*- coding: utf-8 -*-
"""Визуальный просмотр автораскладки BPMN: кейс ЯРБП → наш BPMN → bpmn-io.

Это dev-инструмент, а не тест: он ничего не сравнивает, а рисует схему глазами
bpmn-io и складывает скриншоты в `tests/bpmn-io/out/`. Раннер печатает
предупреждения нашего конвертера и самого bpmn-io (элементы без DI, битые
ссылки и т.п.) — по ним видно, что раскладка сломала.

bpmn-io НЕ собирается и НЕ коммитится: нужен готовый dist в
`tests/bpmn-io/vendor/` (см. README.md). `vendor/` и `out/` — в `.gitignore`.

Запуск (из корня репозитория):
    python yarbp/tests/bpmn-io/render.py                     # все кейсы
    python yarbp/tests/bpmn-io/render.py --case bpmn_features
    python yarbp/tests/bpmn-io/render.py --strict            # предупреждения → код 1
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
ROOT = os.path.dirname(os.path.dirname(HERE))      # .../yarbp
REPO = os.path.dirname(ROOT)                      # корень репозитория
PROJECT_NAME = os.path.basename(ROOT)
PAGE_PATH = '%s/tests/bpmn-io/render.html' % PROJECT_NAME
CASES_JSON = os.path.join(ROOT, 'tests', 'converters', 'cases.json')
VENDOR = os.path.join(HERE, 'vendor')
OUT_DIR = os.path.join(HERE, 'out')
VENDOR_FILES = ('bpmn-viewer.js', 'bpmn-js.css')

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''),
                 r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]


def prepare_stdout():
    stream = getattr(sys, 'stdout', None)
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass


def find_browser():
    for path in BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def find_port(start=8891):
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


def run_browser(port, browser, case, screenshot=None, timeout=120):
    profile = tempfile.mkdtemp(prefix='yarbp-bpmnio-')
    url = 'http://127.0.0.1:%d/%s?case=%s&t=%d' % (
        port, PAGE_PATH, case, int(time.time() * 1000))

    command = [
        browser,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--virtual-time-budget=8000',
        '--user-data-dir=' + profile,
    ]
    if screenshot:
        command.append('--window-size=1400,900')
        command.append('--screenshot=' + screenshot)
    else:
        command.append('--dump-dom')
    command.append(url)

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL)
        try:
            return process.communicate(timeout=timeout)[0].decode('utf-8', 'replace')
        except subprocess.TimeoutExpired:
            process.kill()
            raise RuntimeError('браузер не ответил за %d секунд' % timeout)
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def result_lines(output):
    match = re.search(r'<pre id="result"[^>]*>(.*?)</pre>', output, re.S)
    if match is None:
        return None
    return [line for line in html_unescape(match.group(1)).splitlines() if line.strip()]


def load_cases(only=None):
    if only:
        return [only]
    with io.open(CASES_JSON, 'r', encoding='utf-8-sig') as handle:
        return [str(name) for name in (json.load(handle).get('files') or [])]


def check_vendor():
    missing = [name for name in VENDOR_FILES
               if not os.path.isfile(os.path.join(VENDOR, name))]
    if not missing:
        return True

    print('FAIL нет сборки bpmn-io в tests/bpmn-io/vendor/: %s' % ', '.join(missing))
    print('')
    print('Скачать готовый dist (в репозиторий он не попадёт, см. .gitignore):')
    print('  tests/bpmn-io/fetch-vendor.ps1')
    return False


def main(argv):
    prepare_stdout()

    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    strict = '--strict' in argv
    only = None
    if '--case' in argv:
        index = argv.index('--case')
        if index + 1 < len(argv):
            only = argv[index + 1]

    unknown = [arg for arg in argv
               if arg not in ('--strict', '--case', only)]
    if unknown:
        print('Неизвестные аргументы: %s' % ' '.join(unknown))
        return 2

    if not check_vendor():
        return 1

    browser = find_browser()
    if not browser:
        print('FAIL не найден Chrome/Edge: укажите браузер вручную')
        return 1

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    cases = load_cases(only)
    print('bpmn-io: визуальный просмотр %d кейс(ов), скриншоты → tests/bpmn-io/out/' % len(cases))

    server, port = start_server()
    failed = 0
    warned = 0

    try:
        for case in cases:
            png = os.path.join(OUT_DIR, case + '.png')
            dom = run_browser(port, browser, case)
            lines = result_lines(dom) or []

            if '<title>BPMNIO PASS</title>' not in dom and '<title>BPMNIO WARN</title>' not in dom:
                failed += 1
                print('  FAIL %s: страница не отрисовалась' % case)
                for line in lines[:3]:
                    print('        ' + line)
                continue

            run_browser(port, browser, case, screenshot=png)

            warnings = [line for line in lines if line.strip().startswith(('conv:', 'bpmn-io:'))]
            if warnings:
                warned += 1

            print('  ' + ('WARN ' if warnings else 'ok   ') + case +
                  ' → ' + os.path.relpath(png, ROOT).replace('\\', '/'))
            for line in warnings:
                print('        ' + line.strip())
    finally:
        stop_server(server)

    print('')
    print('ВСЁ: кейсов %d, с предупреждениями %d, ошибок %d' % (len(cases), warned, failed))
    print('Скриншоты: tests/bpmn-io/out/ (папка в .gitignore)')

    if failed:
        return 1
    if strict and warned:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
