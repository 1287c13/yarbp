# -*- coding: utf-8 -*-
"""Золотые тесты текущего поведения лексера и парсера на кейсах notes/cases.

Что фиксируется для каждого кейса:
  - поток токенов лексера (тип, значение, префикс, границы, ошибка);
  - AST после парсера (включая раскрытие макросов);
  - рендер флейвора из первой директивы: lexer / ast / json / xml / proto;
  - ошибки токенизации, парсинга и конвертации, если они есть.

Снимки лежат в tests/lexer/golden/<кейс>.json. Это именно текущее
поведение (пусть и не идеальное), а не рендеры из notes/cases: они
нужны как страховка перед переделкой лексера.

Запуск (из корня репозитория):
    python yarbp/tests/lexer/run_tests.py              # проверка
    python yarbp/tests/lexer/run_tests.py --update     # пересъёмка снимков

Зависимости: Python 3.8+, Chrome/Edge. Node не нужен: ES-модули
редактора выполняются в headless-браузере, как в тестах flexforms.
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
CASES_JSON = os.path.join(HERE, 'cases.json')
GOLDEN_DIR = os.path.join(HERE, 'golden')
PROJECT_NAME = os.path.basename(ROOT)
PAGE_PATH = '%s/tests/lexer/cases.html' % PROJECT_NAME

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''),
                 r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]


def read_text(path):
    with io.open(path, 'r', encoding='utf-8-sig', newline='') as handle:
        return handle.read().replace('\r\n', '\n').replace('\r', '\n')


def write_text(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def load_case_files():
    with io.open(CASES_JSON, 'r', encoding='utf-8-sig') as handle:
        manifest = json.load(handle)
    files = manifest.get('files') or []
    if not isinstance(files, list) or not files:
        raise RuntimeError('в %s пустой список files' % CASES_JSON)
    return [str(name) for name in files]


def find_browser():
    for path in BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def find_port(start=8989):
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


def extract_pre(output, pre_id):
    pattern = re.compile(r'<pre id="%s"[^>]*>(.*?)</pre>' % re.escape(pre_id), re.S)
    match = pattern.search(output)
    return html_unescape(match.group(1)) if match else None


def extract_title(output):
    match = re.search(r'<title>(.*?)</title>', output, re.S)
    return html_unescape(match.group(1)).strip() if match else None


def result_lines(output):
    text = extract_pre(output, 'result')
    if text is None:
        return None
    return [line for line in text.splitlines() if line.strip()]


def run_page(port, update):
    browser = find_browser()
    if not browser:
        raise RuntimeError('не найден Chrome/Edge: укажите браузер вручную')

    profile = tempfile.mkdtemp(prefix='yarbp-lexer-')
    params = ['t=%d' % int(time.time() * 1000)]
    if update:
        params.append('update=1')
    url = 'http://127.0.0.1:%d/%s?%s' % (port, PAGE_PATH, '&'.join(params))

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


def start_server():
    port = find_port()
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not wait_for_port(port):
        server.terminate()
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


def update_snapshots(output, files):
    print('1. генерация снимков (--update), кейсов: %d' % len(files))
    title = extract_title(output)
    lines = result_lines(output)

    if lines is None:
        print('  FAIL браузер не отдал <pre id="result">')
        print(output[-800:])
        return 1

    for line in lines:
        print('  ' + line)

    if title == 'LEXER UPDATE ERROR' or title not in ('LEXER UPDATE', 'LEXER UPDATE FAIL'):
        print('  FAIL страница не выполнилась (title=%r)' % title)
        return 1

    if any(line.startswith('FAIL') for line in lines):
        print('  FAIL снимки не записаны: есть ошибки выполнения')
        return 1

    if title != 'LEXER UPDATE':
        print('  FAIL страница не завершила генерацию (title=%r)' % title)
        return 1

    golden_text = extract_pre(output, 'golden')
    if golden_text is None:
        print('  FAIL браузер не отдал <pre id="golden">')
        return 1

    try:
        snapshots = json.loads(golden_text)
    except Exception as error:
        print('  FAIL не удалось разобрать golden: %s' % error)
        return 1

    if not isinstance(snapshots, dict):
        print('  FAIL golden должен быть объектом {кейс: снимок}')
        return 1

    expected_ids = [os.path.splitext(name)[0] for name in files]
    missing = [case_id for case_id in expected_ids if case_id not in snapshots]
    extra = [case_id for case_id in snapshots if case_id not in expected_ids]

    if missing or extra:
        print('  FAIL состав снимков не совпал с cases.json')
        if missing:
            print('    нет снимков: %s' % ', '.join(missing))
        if extra:
            print('    лишние снимки: %s' % ', '.join(extra))
        return 1

    if not os.path.isdir(GOLDEN_DIR):
        os.makedirs(GOLDEN_DIR)

    changed = 0
    for case_id in expected_ids:
        path = os.path.join(GOLDEN_DIR, case_id + '.json')
        text = json.dumps(snapshots[case_id], ensure_ascii=False, indent=2) + '\n'
        old = read_text(path) if os.path.isfile(path) else None

        if old == text:
            print('  без изменений %s' % case_id)
        else:
            write_text(path, text)
            changed += 1
            print('  обновлён %s' % case_id)

    stale = sorted(
        name for name in os.listdir(GOLDEN_DIR)
        if name.endswith('.json') and os.path.splitext(name)[0] not in expected_ids
    )
    if stale:
        print('  предупреждение: в golden есть файлы вне cases.json: %s' % ', '.join(stale))

    print('  обновлено файлов: %d из %d' % (changed, len(expected_ids)))
    print('ВСЁ ЗЕЛЁНОЕ')
    return 0


def check_snapshots(output, files):
    print('1. сверка снимков с golden, кейсов: %d' % len(files))
    title = extract_title(output)
    lines = result_lines(output)

    if lines is None:
        print('  FAIL браузер не отдал <pre id="result">')
        print(output[-800:])
        return 1

    for line in lines:
        print('  ' + line)

    if title == 'LEXER ERROR' or title not in ('LEXER PASS', 'LEXER FAIL'):
        print('  FAIL страница не выполнилась (title=%r)' % title)
        return 1

    passed = [line for line in lines if line.startswith('OK')]
    failed = [line for line in lines if line.startswith('FAIL')]

    if len(passed) != len(files):
        print('  FAIL проверено кейсов: %d, ожидалось %d'
              % (len(passed), len(files)))
        return 1

    if failed:
        print('  FAIL расхождений: %d' % len(failed))
        for line in failed:
            print('    ' + line)
        return 1

    if title != 'LEXER PASS':
        print('  FAIL страница не завершила проверку (title=%r)' % title)
        return 1

    print('ВСЁ ЗЕЛЁНОЕ (%d кейсов)' % len(passed))
    return 0


def main(argv):
    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    unknown = [arg for arg in argv if arg != '--update']
    if unknown:
        print('Неизвестные аргументы: %s' % ' '.join(unknown))
        print(__doc__)
        return 2

    update = '--update' in argv

    try:
        files = load_case_files()
    except Exception as error:
        print('НЕ УДАЛОСЬ ПРОЧИТАТЬ КЕЙСЫ: %s' % error)
        return 1

    try:
        server, port = start_server()
    except Exception as error:
        print('НЕ УДАЛОСЬ ЗАПУСТИТЬ СЕРВЕР: %s' % error)
        return 1

    try:
        output = run_page(port, update)
    except Exception as error:
        print('НЕ УДАЛОСЬ ЗАПУСТИТЬ БРАУЗЕР: %s' % error)
        return 1
    finally:
        stop_server(server)

    if update:
        return update_snapshots(output, files)
    return check_snapshots(output, files)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

