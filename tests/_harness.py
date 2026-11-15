# -*- coding: utf-8 -*-
"""Общая обвязка браузерных тестов ЯРБП.

Здесь живут поиск Chrome/Edge, локальный http.server, запуск страницы через
`--dump-dom` и разбор `<pre id="result">`. Наборы остаются самостоятельными:
`run_tests.py` каждого каталога по-прежнему запускается без Node и без
внешних пакетов.

Python 3.8+, только стандартная библиотека.
"""

from __future__ import print_function

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
ROOT = os.path.dirname(HERE)                       # .../yarbp
REPO = os.path.dirname(ROOT)                       # корень репозитория
PROJECT_NAME = os.path.basename(ROOT)

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


def find_port(start=8977):
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


def start_server(port=None):
    port = port or find_port()
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


def run_page(port, browser, page_path, prefix='yarbp-test',
             virtual_time_budget=30000, extra_query=None, timeout=240):
    """Открыть страницу в headless-браузере и вернуть --dump-dom."""
    profile = tempfile.mkdtemp(prefix=prefix + '-')
    params = ['t=%d' % int(time.time() * 1000)]
    if extra_query:
        params.extend(extra_query)
    url = 'http://127.0.0.1:%d/%s?%s' % (
        port, page_path.lstrip('/'), '&'.join(params))

    command = [
        browser,
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--virtual-time-budget=%d' % virtual_time_budget,
        '--user-data-dir=' + profile,
        '--dump-dom',
        url,
    ]

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



def extract_pre(output, pre_id='result'):
    match = re.search(r'<pre id="%s"[^>]*>(.*?)</pre>' % re.escape(pre_id),
                      output, re.S)
    return html_unescape(match.group(1)) if match else None


def extract_title(output):
    match = re.search(r'<title>(.*?)</title>', output, re.S)
    return html_unescape(match.group(1)).strip() if match else None


def result_lines(output):
    text = extract_pre(output, 'result')
    if text is None:
        return None
    return [line for line in text.splitlines() if line.strip()]


def run_browser_suite(page_path, pass_title, fail_title, intro,
                      port_start=8977, prefix='yarbp-test',
                      virtual_time_budget=30000, extra_query=None):
    """Типовой набор: заголовок, строки результата, PASS/FAIL."""
    prepare_stdout()
    browser = find_browser()
    if not browser:
        print('FAIL не найден Chrome/Edge: укажите браузер вручную')
        return 1

    print(intro)
    server, port = start_server(find_port(port_start))
    try:
        output = run_page(port, browser, page_path, prefix=prefix,
                          virtual_time_budget=virtual_time_budget,
                          extra_query=extra_query)
    finally:
        stop_server(server)

    lines = result_lines(output)
    if lines is None:
        print('  FAIL браузер не отдал <pre id="result">')
        print(output[-800:])
        return 1

    for line in lines:
        print('  ' + line)

    if pass_title not in output:
        if fail_title not in output:
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

