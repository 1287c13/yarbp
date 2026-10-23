# -*- coding: utf-8 -*-
"""Сборка строковых ассетов флейвора «форма-ТСД» из первоисточников.

Зачем: движок и CSS редизайна должны попасть в редактор ЯРБП и в
самодостаточный HTML-экспорт ДОСЛОВНО. Браузер не умеет «прочитать файл и
вставить его в `<script>`» без сети (редактор открывается по file://), поэтому
исходники хранятся в ES-модулях как массивы строк. Этот скрипт генерирует такие
модули из первоисточников, а тесты (`tests/flexforms/run_tests.py`) проверяют,
что сгенерированное не разъехалось с оригиналом.

Источники:
  редизайн/kb8-inventory-redesign.html  — CSS, оболочка страницы, движок
  flex-forms-legacy/constructor.html    — SVG-рамка корпуса ТСД (getSVG)
                                          и геометрия экрана (renderMockup)

Выход (перезаписывается целиком, руками не править):
  src/js/classes/renderers/flexforms/FlexFormsStyles.js
  src/js/classes/renderers/flexforms/FlexFormsRuntime.js
  src/js/classes/renderers/flexforms/FlexFormsMarkup.js

Запуск:  python tools/build-flexforms-assets.py [--check]
  --check  ничего не пишет, только сверяет модули с первоисточниками.

Первоисточники лежат в рабочем каталоге проекта, а не в git-репозитории yarbp/:
без них скрипт (и тест сверки) работать не может и говорит об этом прямо.
"""

from __future__ import print_function

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                              # .../yarbp
REPO = os.path.dirname(ROOT)                              # корень репозитория
SRC = os.path.join(ROOT, 'src', 'js', 'classes', 'renderers', 'flexforms')

REDESIGN = os.path.join(REPO, 'редизайн', 'kb8-inventory-redesign.html')
LEGACY = os.path.join(REPO, 'flex-forms-legacy', 'constructor.html')

STYLES_MODULE = os.path.join(SRC, 'FlexFormsStyles.js')
RUNTIME_MODULE = os.path.join(SRC, 'FlexFormsRuntime.js')
MARKUP_MODULE = os.path.join(SRC, 'FlexFormsMarkup.js')

IR_MARKER = '__FF_IR__'
STYLES_MARKER = '__FF_STYLES__'
RUNTIME_MARKER = '__FF_RUNTIME__'

GENERATED_BANNER = (
    '/* ВНИМАНИЕ: файл сгенерирован. Правки затрутся.\n'
    '   Источник: %s\n'
    '   Генератор: yarbp/tools/build-flexforms-assets.py\n'
    '   Строки склеиваются через "\\n" — содержимое дословно равно источнику. */\n'
)


def read_text(path):
    with io.open(path, 'r', encoding='utf-8-sig', newline='') as handle:
        return handle.read().replace('\r\n', '\n').replace('\r', '\n')


def write_text(path, text):
    directory = os.path.dirname(path)
    if not os.path.isdir(directory):
        os.makedirs(directory)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def slice_between(text, open_tag, close_tag):
    """Содержимое между ПЕРВЫМ open_tag и СЛЕДУЮЩИМ за ним close_tag."""
    start = text.find(open_tag)
    if start == -1:
        raise SystemExit('не найден %s в первоисточнике' % open_tag)
    start += len(open_tag)
    end = text.find(close_tag, start)
    if end == -1:
        raise SystemExit('не найден %s после %s' % (close_tag, open_tag))
    return text[start:end]


def js_lines_array(line_list):
    """Список строк → исходник JS-массива (по элементу на строку)."""
    out = []
    for line in line_list:
        out.append('  ' + json.dumps(line, ensure_ascii=False) + ',')
    return '\n'.join(out)


def js_module(header, body):
    """Заголовок «файл сгенерирован» + тело модуля."""
    return header + body


def styles_module(styles):
    header = GENERATED_BANNER % 'редизайн/kb8-inventory-redesign.html, блок <style>'
    body = ('\nexport const FLEX_FORMS_STYLES = [\n'
            + js_lines_array(styles.split('\n')) +
            "\n].join('\\n');\n")
    return js_module(header, body)


def runtime_module(runtime):
    header = GENERATED_BANNER % 'редизайн/kb8-inventory-redesign.html, блок <script>'
    body = ('\n/*\n'
            '  Движок формы (ЧАСТЬ 1-3 редизайна): хук ШК, приёмники, таблицы,\n'
            '  отправка, флаги, проверка заполнения, тема, клавиатура, сеть.\n'
            '  Подключается в собранную страницу как обычный <script> — поэтому\n'
            '  здесь классический код (var/function), без import/export.\n'
            '*/\n'
            'export const FLEX_FORMS_RUNTIME = [\n'
            + js_lines_array(runtime.split('\n')) +
            "\n].join('\\n');\n")
    return js_module(header, body)


def markup_module(skeleton, phone):
    header = GENERATED_BANNER % ('редизайн/kb8-inventory-redesign.html (оболочка) '
                                 'и flex-forms-legacy/constructor.html (getSVG)')
    phone_geometry = dict((key, value) for key, value in phone.items() if key != 'svg')
    phone_json = json.dumps(phone_geometry, ensure_ascii=False, indent=2, sort_keys=True)
    body = ('\n/*\n'
            '  Каркас страницы формы: тот же файл редизайна, в котором вместо CSS,\n'
            '  движка и IR стоят маркеры. Сборка (FlexFormsPage.js) подставляет\n'
            '  в маркеры настоящие значения — получается страница, равная\n'
            '  первоисточнику.\n'
            '*/\n'
            'export const FLEX_FORMS_IR_MARKER = %s;\n'
            'export const FLEX_FORMS_STYLES_MARKER = %s;\n'
            'export const FLEX_FORMS_RUNTIME_MARKER = %s;\n\n'
            'export const FLEX_FORMS_PAGE_SKELETON = [\n' % (
                json.dumps(IR_MARKER), json.dumps(STYLES_MARKER),
                json.dumps(RUNTIME_MARKER)) +
            js_lines_array(skeleton.split('\n')) +
            "\n].join('\\n');\n\n"
            '/*\n'
            '  Рамка корпуса ТСД — дословный результат getSVG() из легаси-конструктора\n'
            '  (flex-forms-legacy/constructor.html). Размеры рамки и положение экрана —\n'
            '  из renderMockup() того же файла: рамка 346x758 рисуется по viewBox\n'
            '  208x457, интерфейс лежит в 308x400 со сдвигом 3/80.\n'
            '*/\n'
            'export const FLEX_FORMS_PHONE = Object.freeze(%s);\n\n'
            'export const FLEX_FORMS_PHONE_SVG = %s;\n' % (
                phone_json, json.dumps(phone['svg'], ensure_ascii=False)))
    return js_module(header, body)

def main(argv):
    check_only = '--check' in argv

    for path, label in ((REDESIGN, 'редизайн/kb8-inventory-redesign.html'),
                        (LEGACY, 'flex-forms-legacy/constructor.html')):
        if not os.path.isfile(path):
            raise SystemExit(
                'не найден первоисточник: %s\n'
                '  ожидался файл %s\n'
                '  первоисточники лежат в рабочем каталоге проекта (вне git-репозитория\n'
                '  yarbp/), поэтому перегенерация и сверка ассетов возможны только там.' % (label, path))

    redesign = read_text(REDESIGN)
    styles, runtime, skeleton, ir_text = extract_redesign(redesign)
    phone = extract_phone(read_text(LEGACY))

    # IR в первоисточнике должен быть ровно результатом json.dumps(indent=2):
    # иначе сборка страницы с этим IR не совпадёт с файлом.
    ir_roundtrip = json.dumps(json.loads(ir_text), ensure_ascii=False, indent=2)
    if ir_roundtrip != ir_text.strip('\n'):
        raise SystemExit('IR в редизайне отформатирован не как JSON.stringify(ir, null, 2)')

    modules = [
        (STYLES_MODULE, styles_module(styles)),
        (RUNTIME_MODULE, runtime_module(runtime)),
        (MARKUP_MODULE, markup_module(skeleton, phone)),
    ]

    problems = []
    for path, content in modules:
        name = os.path.basename(path)
        if check_only:
            actual = read_text(path) if os.path.isfile(path) else None
            if actual != content:
                problems.append(name)
            continue
        write_text(path, content)
        print('written: %-24s %7d bytes' % (name, len(content.encode('utf-8'))))

    print('styles:  %5d lines, %6d chars' % (styles.count('\n') + 1, len(styles)))
    print('runtime: %5d lines, %6d chars' % (runtime.count('\n') + 1, len(runtime)))
    print('page:    %5d lines' % (skeleton.count('\n') + 1))
    print('phone:   svg %d chars, frame %dx%d, screen %dx%d at %d/%d' % (
        len(phone['svg']), phone['width'], phone['height'],
        phone['screen']['width'], phone['screen']['height'],
        phone['screen']['left'], phone['screen']['top']))

    if check_only:
        if problems:
            print('РАСХОЖДЕНИЕ с первоисточником: ' + ', '.join(problems))
            print('перегенерируйте: python yarbp/tools/build-flexforms-assets.py')
            return 1
        print('OK: ассеты совпадают с первоисточниками')
    return 0


# --------------------------------------------------------------------------
# Первоисточник: редизайн (CSS + оболочка + движок + IR-заглушка)
# --------------------------------------------------------------------------

def extract_redesign(text):
    styles = slice_between(text, '<style>\n', '\n</style>')
    runtime = slice_between(text, '<script>\n', '\n</script>')
    # Внимание: тег упоминается ещё и в комментарии в <head>, поэтому ищем его
    # как отдельную строку разметки, а не первое вхождение подстроки.
    data_open = text.find('\n<data id="form-params"')
    if data_open == -1:
        raise SystemExit('не найден <data id="form-params"> в редизайне')
    data_body_start = text.find('\n', text.find('>', data_open)) + 1
    data_body_end = text.find('\n</data>', data_body_start)
    if data_body_end == -1:
        raise SystemExit('не найден </data> в редизайне')
    ir_text = text[data_body_start:data_body_end]
    if not ir_text.lstrip().startswith('{'):
        raise SystemExit('в <data id="form-params"> не JSON-объект')

    skeleton = (text[:data_body_start] + IR_MARKER + text[data_body_end:])
    skeleton = skeleton.replace(styles, STYLES_MARKER, 1)
    skeleton = skeleton.replace(runtime, RUNTIME_MARKER, 1)

    # Обязательная проверка: сборка из частей возвращает исходный файл байт-в-байт.
    rebuilt = (skeleton.replace(STYLES_MARKER, styles, 1)
                       .replace(RUNTIME_MARKER, runtime, 1)
                       .replace(IR_MARKER, ir_text, 1))
    if rebuilt != text:
        raise SystemExit('сборка страницы из частей не совпала с первоисточником')

    return styles, runtime, skeleton, ir_text


# --------------------------------------------------------------------------
# Первоисточник: легаси-конструктор (SVG-рамка корпуса + геометрия экрана)
# --------------------------------------------------------------------------

def extract_phone(text):
    start = text.find('function getSVG()')
    if start == -1:
        raise SystemExit('не найден getSVG() в легаси-конструкторе')
    tick_open = text.find('`', start)
    tick_close = text.find('`', tick_open + 1)
    svg = text[tick_open + 1:tick_close]
    if not svg.lstrip().startswith('<svg'):
        raise SystemExit('getSVG() вернул не <svg>')
    if '`' in svg or '${' in svg:
        raise SystemExit('в SVG есть обратные кавычки/подстановки — нужен экранированный перенос')

    svg_open = svg[:svg.find('>') + 1]
    view = re.search(r'width="(\d+)"\s+height="(\d+)"\s+viewBox="([^"]+)"', svg_open)
    if not view:
        raise SystemExit('не разобраны размеры SVG-рамки')

    mockup = slice_between(text, 'function renderMockup()', 'function getSVG()')
    screen = re.search(
        r'id="ui-mock-container"\s+style="width:\s*(\d+)px;\s*height:\s*(\d+)px;.*?'
        r'margin:\s*(\d+)px 0 0 (\d+)px', mockup, re.S)
    if not screen:
        raise SystemExit('не разобрана геометрия #ui-mock-container')

    return {
        'svg': svg,
        'width': int(view.group(1)),
        'height': int(view.group(2)),
        'viewBox': view.group(3),
        'screen': {
            'top': int(screen.group(3)),
            'left': int(screen.group(4)),
            'width': int(screen.group(1)),
            'height': int(screen.group(2)),
        },
    }
if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
