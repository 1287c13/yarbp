# -*- coding: utf-8 -*-
"""Smoke-тесты конвертеров: разметка → AST → артефакт.

Проверки лежат в converters.html и выполняются настоящими модулями редактора в
headless Chrome/Edge — как tests/lexer, tests/security и tests/files. Node не
нужен.

Покрывается по одному smoke-тесту на конвертер: JSON, XML, Protobuf,
UI-макет, BPMN, форма-ТСД. Проверяется контракт, а не побайтовое совпадение:
конвертер не падает, отдаёт непустой результат ожидаемого вида, сохраняет
значения из разметки; XML и BPMN дополнительно разбираются XML-парсером.

Отдельно — golden-снимки BPMN XML по документам из `cases/`: они фиксируют
текущее поведение конвертера и раскладки. Пересъёмка после осознанного
изменения вывода:

    python yarbp/tests/converters/run_tests.py --update

Запуск (из корня репозитория):
    python yarbp/tests/converters/run_tests.py
"""

from __future__ import print_function

import io
import glob
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from html import unescape as html_unescape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))      # .../yarbp
REPO = os.path.dirname(ROOT)                      # корень репозитория
PROJECT_NAME = os.path.basename(ROOT)
PAGE_PATH = '%s/tests/converters/converters.html' % PROJECT_NAME
GOLDEN_DIR = os.path.join(HERE, 'golden')

DI_NS = '{http://www.omg.org/spec/BPMN/20100524/DI}'
DC_NS = '{http://www.omg.org/spec/DD/20100524/DC}'
MODEL_NS = '{http://www.omg.org/spec/BPMN/20100524/MODEL}'

# Не проверяем на наложения: граничное событие по стандарту стоит на рамке
# задачи, дорожки лежат поверх узлов по своему смыслу.
LAYOUT_SKIP_TAGS = ('boundaryEvent', 'textAnnotation',
                    'lane', 'laneSet', 'participant',
                    'association', 'group')

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
    for path in BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def find_port(start=8939):
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


def run_page(port, browser, update=False):
    profile = tempfile.mkdtemp(prefix='yarbp-converters-')
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


def result_lines(output):
    match = re.search(r'<pre id="result"[^>]*>(.*?)</pre>', output, re.S)
    if match is None:
        return None
    text = html_unescape(match.group(1))
    return [line for line in text.splitlines() if line.strip()]


def extract_pre(output, pre_id):
    pattern = re.compile(r'<pre id="%s"[^>]*>(.*?)</pre>' % re.escape(pre_id), re.S)
    match = pattern.search(output)
    return html_unescape(match.group(1)) if match else None


def write_snapshots(output):
    """Пересъёмка golden-снимков BPMN (запуск с --update)."""
    text = extract_pre(output, 'golden')
    if text is None:
        print('  FAIL браузер не отдал <pre id="golden">')
        print(output[-800:])
        return 1

    try:
        snapshots = json.loads(text)
    except Exception as error:
        print('  FAIL не удалось разобрать снимки: %s' % error)
        return 1

    if not isinstance(snapshots, dict) or not snapshots:
        print('  FAIL снимков нет: пустой список кейсов?')
        return 1

    if not os.path.isdir(GOLDEN_DIR):
        os.makedirs(GOLDEN_DIR)

    for name in sorted(snapshots):
        payload = snapshots[name]
        path = os.path.join(GOLDEN_DIR, name + '.json')
        data = json.dumps(payload, ensure_ascii=False, indent=2) + '\n'
        with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(data)
        print('  записан golden/%s.json (%d символов XML)' % (name, len(payload.get('xml', ''))))

    print('')
    print('СНИМКИ ОБНОВЛЕНЫ: %d' % len(snapshots))
    return 0


def model_elements(root):
    """{id: (тег, имя)} по элементам модели BPMN."""
    elements = {}
    for elem in root.iter():
        if not elem.tag.startswith(MODEL_NS):
            continue
        element_id = elem.get('id')
        if not element_id:
            continue
        elements[element_id] = (elem.tag[len(MODEL_NS):], elem.get('name') or '')
    return elements


def di_rects(root):
    """{bpmnElement: (x, y, w, h)} по bpmndi:BPMNShape."""
    rects = {}
    for shape in root.iter(DI_NS + 'BPMNShape'):
        element_id = shape.get('bpmnElement')
        bounds = shape.find(DC_NS + 'Bounds')
        if not element_id or bounds is None:
            continue
        rects[element_id] = (float(bounds.get('x', 0) or 0),
                             float(bounds.get('y', 0) or 0),
                             float(bounds.get('width', 0) or 0),
                             float(bounds.get('height', 0) or 0))
    return rects


def container_of(element_id, rect, rects, elements):
    """Ближайший подпроцесс, внутри которого лежит узел ('' — уровень процесса)."""
    x, y, width, height = rect
    cx, cy = x + width / 2.0, y + height / 2.0

    best = None
    for other_id, other in rects.items():
        if other_id == element_id:
            continue
        if (elements.get(other_id) or ('', ''))[0] != 'subProcess':
            continue
        ox, oy, ow, oh = other
        if ox < cx < ox + ow and oy < cy < oy + oh:
            if best is None or ow * oh < best[1]:
                best = (other_id, ow * oh)
    return best[0] if best else ''


def overlap_area(first, second):
    """Площадь пересечения двух прямоугольников (0 — только касание)."""
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    dx = min(ax + aw, bx + bw) - max(ax, bx)
    dy = min(ay + ah, by + bh) - max(ay, by)
    if dx <= 0.5 or dy <= 0.5:
        return 0.0
    return dx * dy


def describe(element_id, elements):
    tag, name = elements.get(element_id) or ('?', '')
    return '%s %s%s' % (tag, element_id, ' «%s»' % name if name else '')


def layout_problems(xml):
    """Наложения узлов одного контейнера: [(описание, описание)]."""
    root = ET.fromstring(xml.encode('utf-8'))
    elements = model_elements(root)
    rects = di_rects(root)

    groups = {}
    for element_id, rect in rects.items():
        tag = (elements.get(element_id) or ('', ''))[0]
        if not tag or tag in LAYOUT_SKIP_TAGS:
            continue
        container = container_of(element_id, rect, rects, elements)
        groups.setdefault(container, []).append((element_id, rect))

    problems = []
    for items in groups.values():
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if overlap_area(items[i][1], items[j][1]) > 0:
                    problems.append((describe(items[i][0], elements),
                                     describe(items[j][0], elements)))
    return problems, sum(len(items) for items in groups.values())


def check_layout():
    """Раскладка golden-снимков: узлы одного контейнера не должны накладываться.

    bpmn-io такие схемы открывает молча (наложения не его забота), поэтому
    проверка живёт здесь: именно так выглядел баг с содержимым подпроцесса —
    обе задачи стояли в одной точке, и на картинке была видна только одна.
    """
    print('')
    print('2. раскладка BPMN: узлы в DI не наложены')

    paths = sorted(glob.glob(os.path.join(GOLDEN_DIR, '*.json')))
    if not paths:
        print('  FAIL нет golden-снимков: сначала запустите с --update')
        return 1

    failed = 0
    for path in paths:
        name = os.path.splitext(os.path.basename(path))[0]
        with io.open(path, encoding='utf-8') as handle:
            xml = (json.load(handle) or {}).get('xml') or ''

        try:
            problems, nodes = layout_problems(xml)
        except ET.ParseError as error:
            failed += 1
            print('  FAIL %s: XML не разбирается (%s)' % (name, error))
            continue

        if problems:
            failed += 1
            print('  FAIL %s: наложены узлы (%d):' % (name, len(problems)))
            for first, second in problems[:5]:
                print('        %s ↔ %s' % (first, second))
            if len(problems) > 5:
                print('        … и ещё %d' % (len(problems) - 5))
        else:
            print('  ok   %s: узлов %d, наложений нет' % (name, nodes))

    if failed:
        print('  FAIL есть схемы с наложениями')
        return 1
    return 0


def main(argv):
    prepare_stdout()

    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    unknown = [arg for arg in argv if arg != '--update']
    if unknown:
        print('Неизвестные аргументы: %s' % ' '.join(unknown))
        print(__doc__)
        return 2

    update = '--update' in argv

    browser = find_browser()
    if not browser:
        print('FAIL не найден Chrome/Edge: укажите браузер вручную')
        return 1

    print('1. конвертеры: json, xml, proto, ui, bpmn, flexforms'
          + (', golden BPMN (пересъёмка)' if update else ', golden BPMN'))

    server, port = start_server()
    try:
        output = run_page(port, browser, update)
    finally:
        stop_server(server)

    if update:
        lines = result_lines(output) or []
        for line in lines:
            print('  ' + line)
        if '<title>CONVERTERS UPDATE</title>' not in output:
            print('  FAIL страница не сняла снимки (нет итогового title)')
            print(output[-800:])
            return 1
        if write_snapshots(output):
            return 1
        return check_layout()

    lines = result_lines(output)
    if lines is None:
        print('  FAIL браузер не отдал <pre id="result">')
        print(output[-800:])
        return 1

    for line in lines:
        print('  ' + line)

    if '<title>CONVERTERS PASS</title>' not in output:
        if '<title>CONVERTERS FAIL</title>' not in output:
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

    if check_layout():
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
