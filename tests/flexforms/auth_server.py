# -*- coding: utf-8 -*-
"""Кэш-сервис «на один тест» для проверки контракта формы ТСД.

Заглушка повторяет `kpp/docs/02-contract-tsd.md` в той части, которая нужна
движку формы:

  * `GET /form` — выданная страница (её «публикует» сам тест через `/publish`);
  * `POST /link` — хук штрихкода, отвечает `message.requested_fields`;
  * `POST /processing` — приём сообщения, `200 {ok:true,...}`;
  * `POST /processing401` — тот же приём, но ключ «не принят» (`401`);
  * `GET /v1/clients/auth` — общая страница входа (после `401` форма уходит сюда);
  * `GET /log` — что сервис получил: путь, заголовки, тело.

Остальные GET отдаются как статика из корня репозитория, поэтому страница
теста и модули редактора грузятся с того же origin, что и «сервис» (как в
проде: страницу отдаёт кэш-сервис).

Модуль самостоятельный (только стандартная библиотека) и запускается из
`run_tests.py`; отдельный процесс не нужен — сервер живёт в потоке.
"""

from __future__ import print_function

import json
import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))              # .../yarbp
REPO = os.path.dirname(ROOT)                              # корень репозитория

AUTH_PAGE = ('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
             '<title>Вход в ТСД</title></head><body>Вход в ТСД</body></html>')

LINK_REPLY = {
    'message': {
        'requested_fields': [
            {'id': 'a1_f2', 'value': 'Товар по штрихкоду', 'uid': ''},
            {'id': 'a1_f3', 'value': 'Характеристика', 'uid': ''},
        ],
    }
}

SEND_REPLY = {'ok': True, 'id': 'test-message', 'status': 'new', 'duplicate': False}


class _Handler(SimpleHTTPRequestHandler):
    """Статика репозитория + контракт кэш-сервиса для теста формы."""

    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.js': 'text/javascript',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json',
        '.css': 'text/css',
    })

    def __init__(self, *args, **kwargs):
        kwargs['directory'] = REPO
        SimpleHTTPRequestHandler.__init__(self, *args, **kwargs)

    # --- служебное ---------------------------------------------------------
    def log_message(self, format, *args):
        pass

    @property
    def state(self):
        return self.server.state

    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _html(self, text, status=200):
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _record(self, path, body):
        self.state['requests'].append({
            'path': path,
            'method': self.command,
            'headers': {key: value for key, value in self.headers.items()},
            'body': body,
        })

    # --- маршруты ----------------------------------------------------------
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/form':
            html = self.state.get('form') or ''
            if not html:
                self._json({'ok': False, 'error': 'Клиент не опубликован'}, status=404)
                return
            self._html(html)
            return
        if path == '/v1/clients/auth':
            self._html(AUTH_PAGE)
            return
        if path == '/log':
            self._json({'requests': self.state['requests']})
            return
        if path in ('/ping', '/v1/health'):
            self._json({'ok': True, 'status': 'healthy', 'queue': {}})
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length).decode('utf-8', 'replace') if length else ''

        if path == '/publish':
            self.state['form'] = raw
            self._json({'ok': True, 'length': len(raw)})
            return

        self._record(path, raw)

        if path == '/link':
            self._json(LINK_REPLY)
            return
        if path == '/processing':
            self._json(SEND_REPLY)
            return
        if path == '/processing401':
            self._json({'ok': False, 'error': 'Ключ не принят'}, status=401)
            return

        self._json({'ok': False, 'error': 'Неизвестный путь: ' + path}, status=404)


class _Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def start(port=0):
    """Поднимает сервер в отдельном потоке. Возвращает (server, base_url, state)."""
    state = {'form': '', 'requests': []}
    server = _Server(('127.0.0.1', port), _Handler)
    server.state = state
    thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.1})
    thread.daemon = True
    thread.start()
    return server, 'http://127.0.0.1:%d' % server.server_address[1], state
