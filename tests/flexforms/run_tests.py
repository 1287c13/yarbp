# -*- coding: utf-8 -*-
"""Тесты флейвора «форма-ТСД» (редизайн ТСД → редактор ЯРБП).

Что проверяется:
  1. Дословность ассетов: CSS/движок/каркас/рамка в модулях совпадают с
     первоисточниками (перегенерация build-flexforms-assets.py ничего не меняет).
  2. Золотой тест конвертера: ast.json → target.json (побайтово, с отступами).
  3. Паритет страницы: buildFormPage(IR образца) == редизайн/kb8-inventory-redesign.html
     (побайтово) — значит движок и вёрстка не «поплыли» при переносе.
  4. Предпросмотр отличается от страницы редизайна только двумя скриптами —
     сбросом снимка localStorage и заглушкой автофокуса; в странице без
     предпросмотра их нет.
  5. Геометрия рамки/экрана, имя файла, конфиг для 1С и HTML-выгрузка:
     текст конфига = текст в `<data>` страницы, имена `<заголовок>.json` и
     `<заголовок>.html`, отказ на неполном IR.
  6. Подсказки флейвора: набор узлов, видов полей, values.
  7. Предопределённый пример «Форма ТСД» в редакторе: текст в FileManager.js
     дословно совпадает с образцом разметки, с которого сделан редизайн.
  8. Дымовой тест в браузере: регистрация флейвора, монтирование предпросмотра
     примером из «Примеров» и IR этого примера (== IR образца) настоящими
     модулями редактора (Chrome/Edge headless).

Запуск (из корня репозитория):
    python yarbp/tests/flexforms/run_tests.py              # всё
    python yarbp/tests/flexforms/run_tests.py --no-browser # без браузера

Зависимости: Python 3.8+, модуль quickjs (pip install quickjs), Chrome/Edge (п.8).
"""

from __future__ import print_function

import io
import json
import os
import re
import socket
import subprocess
import sys
import time
from html import unescape as html_unescape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))            # .../yarbp
REPO = os.path.dirname(ROOT)                            # корень репозитория
CLASSES = os.path.join(ROOT, 'src', 'js', 'classes')
FLEXFORMS = os.path.join(CLASSES, 'renderers', 'flexforms')
TASK = os.path.join(REPO, 'редизайн', 'задача-замена-целевого-формата')
REDESIGN = os.path.join(REPO, 'редизайн', 'kb8-inventory-redesign.html')

ASSETS_SCRIPT = os.path.join(ROOT, 'tools', 'build-flexforms-assets.py')
CONVERTER = os.path.join(CLASSES, 'ast-converters', 'FlexFormsConvertor.js')
PAGE = os.path.join(FLEXFORMS, 'FlexFormsPage.js')
SUGGESTIONS = os.path.join(CLASSES, 'suggestions', 'flexFormsSuggestions.js')

GOLDEN_AST = os.path.join(TASK, 'ast.json')
GOLDEN_IR = os.path.join(TASK, 'target.json')
SAMPLE_IR = os.path.join(TASK, 'target-sample.json')
SAMPLE_MARKUP = os.path.join(TASK, 'образцы разметки.md')

FILE_MANAGER = os.path.join(ROOT, 'src', 'js', 'modules', 'FileManager.js')
BUILTIN_ID = 'builtin-9'                                 # пример «Форма ТСД»

BROWSERS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]

FAILURES = []
SKIPPED = []


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
# Мини-сборка ES-модулей для quickjs (у quickjs нет import/export)
# --------------------------------------------------------------------------

IMPORT_LINE = re.compile(r'^\s*import\s+[^;]*;\s*$', re.M)
LOCAL_IMPORT = re.compile(r"from\s+'(\.[^']+)'")


def strip_module_syntax(source, path):
    out = IMPORT_LINE.sub('', source)
    out = re.sub(r'^export\s+default\s+[^;]+;\s*$', '', out, flags=re.M)
    out = re.sub(r'^export\s+\{[^}]*\};?\s*$', '', out, flags=re.M)
    out = re.sub(r'^export\s+(?=(?:const|let|var|function|class|async)\b)', '', out, flags=re.M)

    leftovers = [line for line in out.splitlines()
                 if re.match(r'^\s*(import|export)\s', line)]
    if leftovers:
        raise RuntimeError('модульный синтаксис не снят в %s: %r' % (path, leftovers[:3]))
    return out


def local_imports(source):
    """Относительные импорты из настоящих строк import (в т.ч. многострочных).

    Строки-образцы в комментариях не учитываются: разбор идёт по statements,
    которые снимает IMPORT_LINE (он же их и вырезает при сборке).
    """
    result = []
    for statement in IMPORT_LINE.findall(source):
        match = re.search(r"from\s+'(\.[^']+)'", statement)
        if match:
            result.append(match.group(1))
    return result


def bundle(entry):
    """Модуль + его локальные зависимости одним скриптом (зависимости первыми)."""
    chunks = []
    seen = set()

    def visit(path):
        path = os.path.normpath(path)
        if path in seen:
            return
        seen.add(path)
        source = read_text(path)
        for dependency in local_imports(source):
            visit(os.path.join(os.path.dirname(path), dependency))
        chunks.append(strip_module_syntax(source, path))

    visit(entry)
    return '\n;\n'.join(chunks)


def js_eval(code):
    import quickjs
    return quickjs.Context().eval(code)


def js_json(code):
    """Код должен заканчиваться выражением JSON.stringify(...) — его и разбираем."""
    return json.loads(js_eval(code))


# --------------------------------------------------------------------------
# 1. Дословность ассетов
# --------------------------------------------------------------------------

def test_assets():
    print('1. ассеты (CSS/движок/каркас/рамка)')
    process = subprocess.Popen(
        [sys.executable, ASSETS_SCRIPT, '--check'],
        cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = process.communicate()[0].decode('utf-8', 'replace')
    check('первоисточники и модули совпадают', process.returncode == 0, output.strip())


# --------------------------------------------------------------------------
# 2. Конвертер: ast.json → target.json
# --------------------------------------------------------------------------

def test_converter():
    print('2. конвертер AST → IR')
    expected = read_text(GOLDEN_IR).strip('\n')

    code = bundle(CONVERTER) + '''
var __ast = JSON.parse(%s);
var __converter = new YarbpFlexFormsConverter(__ast);
var __ir = __converter.convert();
var __json = __converter.toJSON(2);
JSON.stringify({
  json: __json,
  type: __ir && __ir.type,
  children: __ir && __ir.children
    ? __ir.children.map(function (child) { return child.type; }) : null
});
''' % json.dumps(read_text(GOLDEN_AST))

    result = js_json(code)
    actual = result['json'].strip('\n')

    check('ast.json → target.json (текст с отступами)', actual == expected,
          first_difference(actual, expected))
    check('корень IR — форма', result['type'] == 'форма', str(result['type']))
    check('дети формы: операции без синтезированных стилей',
          result['children'] == ['операция', 'операция'], str(result['children']))


# --------------------------------------------------------------------------
# 3. Паритет страницы с первоисточником
# --------------------------------------------------------------------------

def build_page(preview):
    code = bundle(PAGE) + '''
var __ir = JSON.parse(%s);
buildFormPage(__ir, %s);
''' % (json.dumps(read_text(SAMPLE_IR)), '{ preview: true }' if preview else '{}')
    return js_eval(code)


def test_page_parity():
    print('3. страница формы == редизайн (побайтово)')
    expected = read_text(REDESIGN)
    actual = build_page(preview=False)

    check('buildFormPage(IR образца) == kb8-inventory-redesign.html',
          actual == expected, first_difference(actual, expected))
    check('в странице ровно один тег <data id="form-params">',
          len(re.findall(r'^<data id="form-params"', actual, re.M)) == 1,
          str(len(re.findall(r'^<data id="form-params"', actual, re.M))))
    return actual


# --------------------------------------------------------------------------
# 4. Предпросмотр и страница редизайна
# --------------------------------------------------------------------------

def test_preview(plain_page):
    print('4. предпросмотр / страница редизайна')
    preview = build_page(preview=True)

    check('в предпросмотре есть сброс снимка localStorage',
          "localStorage.getItem('tsd-form-state')" in preview)
    check('в странице без предпросмотра скрипта сброса снимка нет',
          "localStorage.getItem('tsd-form-state')" not in plain_page)

    parts = preview.split('\n<script>\n')
    ok_structure = len(parts) == 4
    check('в предпросмотре три <script> (сброс + движок + заглушка автофокуса)',
          ok_structure, str(len(parts) - 1))

    if not ok_structure:
        return

    check('блок сброса закрыт', parts[1].rstrip().endswith('</script>'))
    check('движок в предпросмотре закрыт', parts[2].rstrip().endswith('</script>'))

    # Автофокус — правка рендера, не редизайна: на ТСД движок после каждой
    # отрисовки ставит курсор в поле «автофокус» (сканера ради), а в редакторе
    # это выдёргивает фокус из окна кода. Заглушка должна стоять ПОСЛЕ движка —
    # boot() подписан на DOMContentLoaded, к отрисовке setFocus уже подменён.
    check('предпросмотр гасит автофокус (заглушка setFocus)', 'setFocus = function' in parts[3],
          parts[3][:160])
    check('заглушка автофокуса стоит после движка',
          preview.index('setFocus = function') > preview.index('function setFocus()'),
          '%d / %d' % (preview.index('setFocus = function'),
                       preview.index('function setFocus()')))
    check('в странице без предпросмотра заглушки автофокуса нет (фокус нужен сканеру)',
          'setFocus = function' not in plain_page)

    # Остальное совпадает с редизайном: снимаем два блока предпросмотра.
    rebuilt = parts[0] + '\n<script>\n' + parts[2] + preview[preview.index('</body>'):]
    check('отличие от страницы редизайна — ровно блоки предпросмотра (снимок + автофокус)',
          rebuilt == plain_page, first_difference(rebuilt, plain_page))


# --------------------------------------------------------------------------
# 5. Геометрия, имя файла и конфиг для 1С
# --------------------------------------------------------------------------

def test_geometry(plain_page):
    print('5. геометрия рамки, имя файла и конфиг для 1С')
    code = bundle(PAGE) + '''
var __ir = JSON.parse(%s);
var __config = buildFormConfig(__ir);
JSON.stringify({
  screen: FLEX_FORMS_SCREEN_STYLE,
  phone: FLEX_FORMS_PHONE,
  markup: buildPreviewMarkup(),
  previewCss: FLEX_FORMS_PREVIEW_CSS,
  fileName: formFileName({ 'заголовокФормы': 'Отправка данных в 1С' }),
  fallback: formFileName({}),
  serialized: serializeFormIR({ 'b': 1, 'a': [1] }),
  config: __config,
  configParsed: JSON.parse(__config),
  configFirstChar: __config.charCodeAt(0),
  okError: formConfigError(__ir),
  emptyError: formConfigError({}),
  noTypeError: formConfigError({ children: [] }),
  noChildrenError: formConfigError({ type: 'форма' })
});
''' % json.dumps(read_text(SAMPLE_IR))
    result = js_json(code)
    sample = json.loads(read_text(SAMPLE_IR))

    check('рамка увеличена под страницу формы: 364x799 (рисунок 346x758 +5.3%)',
          result['phone']['width'] == 364 and result['phone']['height'] == 799,
          str(result['phone']))
    check('viewBox рамки', result['phone']['viewBox'] == '0 0 208 457',
          result['phone']['viewBox'])
    check('экран — точка в точку логический размер страницы (356x471)',
          result['screen'] == 'left:4px;top:84px;width:356px;height:471px',
          result['screen'])
    check('размер экрана в рамке (нарисованное место между шапкой и клавиатурой)',
          result['phone']['screen'] == {'left': 4, 'top': 84, 'width': 356, 'height': 471},
          str(result['phone']['screen']))
    check('логический размер страницы формы (iframe) — 356x471',
          result['phone']['form'] == {'width': 356, 'height': 471},
          str(result['phone'].get('form')))
    # iframe не масштабируется: экран равен странице, 1 CSS px формы = 1 px рамки.
    check('iframe без собственного масштаба (не мылит текст и рамки полей)',
          'width:100%;height:100%' in result['previewCss'] and
          'scale(' not in result['previewCss'],
          result['previewCss'])
    check('экран не меньше страницы (иначе форма обрезалась бы)',
          result['phone']['screen']['width'] >= result['phone']['form']['width'] and
          result['phone']['screen']['height'] >= result['phone']['form']['height'],
          '%dx%d при форме %dx%d' % (
              result['phone']['screen']['width'], result['phone']['screen']['height'],
              result['phone']['form']['width'], result['phone']['form']['height']))
    check('углы экрана не скруглены',
          'border-radius:0' in result['previewCss'] and
          'border-radius:10px' not in result['previewCss'],
          result['previewCss'])
    check('рамка имеет постоянный логический размер и обёртку для масштаба',
          'class="ff-phone-scale"' in result['markup'] and
          'class="ff-phone" style="width:364px;height:799px"' in result['markup'],
          result['markup'][:120])
    check('кнопки выгрузки — подписи JSON и Скачать, без иконок-растяжек',
          '.ff-export-btn--config{font:' in result['previewCss'] and
          '.ff-export-btn--html{font:' in result['previewCss'] and
          '.ff-export-btn img' not in result['previewCss'],
          result['previewCss'][-260:])
    check('имя файла из заголовка формы',
          result['fileName'] == 'Отправка-данных-в-1С.json', result['fileName'])
    check('имя файла по умолчанию', result['fallback'] == 'flex-forms.json',
          result['fallback'])
    check('IR печатается как в редизайне (2 пробела)',
          result['serialized'] == '{\n  "b": 1,\n  "a": [\n    1\n  ]\n}',
          result['serialized'])

    # Конфиг — то, что расширение 1С подставляет в оболочку вместо `<data>`:
    # значит текст обязан совпадать с тем, что получает страница предпросмотра.
    expected_config = json.dumps(sample, ensure_ascii=False, indent=2)
    check('конфиг — ровно IR образца с отступами в 2 пробела',
          result['config'] == expected_config,
          first_difference(result['config'], expected_config))
    check('конфиг разбирается обратно в IR образца',
          result['configParsed'] == sample)
    check('конфиг — тот же текст, что страница получает в <data>',
          result['config'] in plain_page, 'конфига нет в странице')
    check('конфиг без BOM и начинается с «{»',
          result['configFirstChar'] == 0x7B, str(result['configFirstChar']))
    check('валидный IR не даёт ошибки выгрузки', result['okError'] == '',
          result['okError'])
    check('неполный IR отвергается с понятным текстом',
          bool(result['emptyError']) and bool(result['noTypeError']) and
          bool(result['noChildrenError']),
          '; '.join([result['emptyError'], result['noTypeError'],
                     result['noChildrenError']]))


# --------------------------------------------------------------------------
# 6. Подсказки флейвора
# --------------------------------------------------------------------------

def test_suggestions():
    print('6. подсказки флейвора')
    code = bundle(SUGGESTIONS) + '''
var __bad = [];
var __empty = [];
Object.keys(flexFormsSuggestions.nodes).forEach(function (key) {
  var node = flexFormsSuggestions.nodes[key];
  (node.variants || []).forEach(function (variant) {
    if (!variant.label || variant.insert === undefined) __bad.push(key + ':' + variant.label);
  });
  Object.keys(node.values || {}).forEach(function (valueKey) {
    var value = node.values[valueKey];
    if (!value.variants || !value.variants.length) __empty.push(key + '.' + valueKey);
  });
});
JSON.stringify({
  nodes: Object.keys(flexFormsSuggestions.nodes),
  root: flexFormsSuggestions.root.variants.map(function (v) { return v.label; }),
  fieldKinds: flexFormsSuggestions.nodes['группа'].variants
    .map(function (v) { return v.label; })
    .filter(function (label) { return label.indexOf('поле') === 0; }),
  bad: __bad,
  empty: __empty
});
'''
    result = js_json(code)

    for key in ['форма', 'операция', 'группа', 'поле', 'таблица']:
        check('узел подсказок «%s»' % key, key in result['nodes'], str(result['nodes']))

    check('корень подсказок — форма', result['root'] == ['форма'], str(result['root']))
    check('виды полей в подсказках', result['fieldKinds'] == [
        'поле:штрихкод', 'поле:надпись', 'поле:число', 'поле:выбор', 'поле:флаг',
        'поле:дата', 'поле:время', 'поле:телефон', 'поле:color', 'поле'],
        str(result['fieldKinds']))
    check('у всех вариантов есть label/insert', not result['bad'], str(result['bad']))
    check('у всех values есть варианты', not result['empty'], str(result['empty']))


# --------------------------------------------------------------------------
# 7. Предопределённый пример в редакторе
# --------------------------------------------------------------------------

BUILTIN_ENTRY = re.compile(r"id:\s*'%s'[\s\S]*?content:\s*`([^`]*)`" % re.escape(BUILTIN_ID))
MARKDOWN_BLOCK = re.compile(r'```[^\n]*\n(.*?)```', re.S)


def test_builtin_example():
    """Пример «Форма ТСД» в «Примерах» — дословно образец разметки редизайна.

    Пользователь открывает пример и глазами сверяет рендер с редизайном;
    чтобы эта сверка что-то значила, текст примера не должен «отъезжать» от
    первоисточника. Единственное разрешённое отличие — директива: в образце
    `! как аст` (показывает AST), в редакторе `! как форма-тсд`.
    """
    print('7. пример «Форма ТСД» в редакторе == образец разметки')

    found = BUILTIN_ENTRY.search(read_text(FILE_MANAGER))
    if not check('FileManager: встроенный пример %s' % BUILTIN_ID, found is not None):
        return

    actual = found.group(1).strip('\n')
    blocks = MARKDOWN_BLOCK.findall(read_text(SAMPLE_MARKUP))
    if not check('образцы разметки.md: найден блок разметки', bool(blocks)):
        return

    expected = re.sub(r'^! как аст[ \t]*$', '! как форма-тсд', blocks[0].strip('\n'),
                      count=1, flags=re.M)

    check('пример: директива «! как форма-тсд»',
          actual.splitlines()[0].strip() == '! как форма-тсд',
          actual.splitlines()[0].strip())
    check('пример: текст дословно совпадает с первым блоком «образцы разметки.md»',
          actual == expected, first_difference(actual, expected))
    check('пример: «Кол\u2011во» с неразрывным дефисом (U+2011) не нормализован',
          'Кол\u2011во' in actual and 'Кол-во' not in actual,
          'U+2011 потерян — поля таблицы перестанут сопоставляться')


# --------------------------------------------------------------------------
# 8. Дымовой тест в браузере
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
    print('8. дымовой тест в браузере (smoke.html)')
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

    try:
        if not wait_for_port(port):
            check('smoke.html: сервер тестов поднялся', False, 'порт %d' % port)
            return

        url = 'http://127.0.0.1:%d/yarbp/tests/flexforms/smoke.html' % port
        profile = os.path.join(os.environ.get('TEMP', os.path.expanduser('~')),
                               'yarbp-flexforms-smoke')
        command = [
            browser,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--virtual-time-budget=9000',
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

    # IR, собранный в браузере ИЗ ТЕКСТА ПРИМЕРА, должен совпасть с IR образца:
    # значит пример в «Примерах» — тот же вход, что и у редизайна (а страница
    # из этого IR уже сверена с редизайном побайтово в п.3).
    ir = re.search(r'<pre id="ir"[^>]*>(.*?)</pre>', output, re.S)
    if check('smoke.html: страница отдала IR примера', ir is not None):
        # Chrome на Windows печатает --dump-dom с CRLF — приводим к LF, как read_text.
        actual_ir = html_unescape(ir.group(1)).replace('\r\n', '\n').replace('\r', '\n').strip('\n')
        expected_ir = read_text(SAMPLE_IR).strip('\n')
        check('smoke.html: пример из «Примеров» → IR образца (побайтово)',
              actual_ir == expected_ir, first_difference(actual_ir, expected_ir))


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main(argv):
    if '--help' in argv or '-h' in argv:
        print(__doc__)
        return 0

    test_assets()

    try:
        import quickjs  # noqa: F401
    except ImportError:
        skip('JS-тесты', 'нет модуля quickjs (pip install quickjs)')
        test_builtin_example()      # примеру редактора quickjs не нужен
        return 1 if FAILURES else 0

    test_converter()
    plain_page = test_page_parity()
    test_preview(plain_page)
    test_geometry(plain_page)
    test_suggestions()
    test_builtin_example()

    if '--no-browser' not in argv:
        test_browser()
    else:
        skip('smoke.html', 'нужен браузер: пример → IR проверяется настоящими '
                           'модулями (quickjs не умеет TDZ статических полей лексера)')

    print('')
    if FAILURES:
        print('ПРОВАЛЕНО: %d' % len(FAILURES))
        for name in FAILURES:
            print('  - %s' % name)
        return 1

    print('ВСЁ ЗЕЛЁНОЕ%s' % (' (пропущено: %d)' % len(SKIPPED) if SKIPPED else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
