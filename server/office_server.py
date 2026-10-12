#!/usr/bin/env python3
import hmac
import json
import os
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
}
LOCAL = re.compile(r'^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$')
BODY_MAX = 16384
ACTIONS = {'converse', 'stop', 'answer', 'say', 'session'}
ANSWER_ID = re.compile(r'^[A-Za-z0-9_-]{1,20}$')
ASK_ID = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
ANSWERS_MAX = 5
AGENT_ID = re.compile(r'^[A-Za-z0-9._:-]{1,64}$')
REQUEST_ID = re.compile(r'^[A-Za-z0-9-]{1,40}$')
TEXT_MAX = 300
MESSAGE_MAX = 2000
INBOX_KEPT = 50
INBOX_LOCK = threading.Lock()


def read_action(body):
    try:
        parsed = json.loads(body)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    request, action, agent, text = parsed.get('request'), parsed.get('action'), parsed.get('agent'), parsed.get('text', '')
    if not isinstance(request, str) or not REQUEST_ID.match(request):
        return None
    if action not in ACTIONS or not isinstance(agent, str) or not AGENT_ID.match(agent):
        return None
    if not isinstance(text, str) or len(text) > MESSAGE_MAX:
        return None
    answers = parsed.get('answers', [])
    if not isinstance(answers, list) or len(answers) > ANSWERS_MAX:
        return None
    for one in answers:
        if not isinstance(one, dict) or not isinstance(one.get('id'), str) or not ANSWER_ID.match(one['id']):
            return None
        if not isinstance(one.get('text'), str) or len(one['text']) > TEXT_MAX:
            return None
        if 'other' in one and not isinstance(one['other'], bool):
            return None
    ask = parsed.get('ask')
    if ask is not None and (not isinstance(ask, str) or not ASK_ID.match(ask)):
        return None
    entry = {'request': request, 'action': action, 'agent': agent, 'text': text, 'answers': [dict({'id': one['id'], 'text': one['text']}, **({'other': True} if one.get('other') is True else {})) for one in answers]}
    if ask is not None:
        entry['ask'] = ask
    return entry


def append_inbox(folder, entry):
    path = os.path.join(folder, 'inbox.json')
    with INBOX_LOCK:
        try:
            with open(path, encoding='utf-8') as handle:
                listed = json.load(handle)
            if not isinstance(listed, list):
                listed = []
        except (OSError, ValueError):
            listed = []
        listed = (listed + [entry])[-INBOX_KEPT:]
        with open(path + '.tmp', 'w', encoding='utf-8') as handle:
            json.dump(listed, handle)
        os.replace(path + '.tmp', path)


def parse_args(argv):
    return {argv[i].lstrip('-'): argv[i + 1] for i in range(0, len(argv) - 1, 2)}


class State:
    def __init__(self, path):
        self.path = path
        self.text = '{}'
        self.version = float('-inf')
        self.lock = threading.Condition()

    def refresh(self):
        try:
            with open(self.path, encoding='utf-8') as handle:
                text = handle.read()
            parsed = json.loads(text)
        except (OSError, ValueError):
            return
        version = parsed.get('version', 0) if isinstance(parsed, dict) else 0
        if version <= self.version:
            return
        with self.lock:
            self.version = version
            self.text = text
            self.lock.notify_all()


def make_handler(web, token, state, folder):
    web = os.path.realpath(web)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            return

        def deny(self, code, text):
            self.send_response(code)
            self.send_header('content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(text.encode())

        def answer(self, code, body):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('content-type', TYPES['.json'])
            self.send_header('cache-control', 'no-store')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            url = urlparse(self.path)
            given = parse_qs(url.query).get('token', [self.headers.get('x-office-token', '')])[0]
            if not LOCAL.match(self.headers.get('host', '')) or not hmac.compare_digest(given, token):
                return self.deny(403, 'forbidden')
            if url.path != '/action':
                return self.deny(405, 'method not allowed')
            if self.headers.get('origin') != f'http://127.0.0.1:{self.server.server_address[1]}':
                return self.answer(403, {'error': 'foreign origin'})
            if not self.headers.get('content-type', '').startswith('application/json'):
                return self.answer(415, {'error': 'JSON only'})
            try:
                length = int(self.headers.get('content-length', '0'))
            except ValueError:
                length = BODY_MAX + 1
            if length > BODY_MAX:
                return self.answer(413, {'error': 'too large'})
            action = read_action(self.rfile.read(length).decode('utf-8', 'replace'))
            if action is None:
                return self.answer(400, {'error': 'bad action'})
            try:
                append_inbox(folder, dict(action, at=int(time.time() * 1000)))
            except OSError:
                return self.answer(500, {'error': 'inbox not writable'})
            return self.answer(202, {'queued': True, 'request': action['request']})

        def do_GET(self):
            url = urlparse(self.path)
            given = parse_qs(url.query).get('token', [self.headers.get('x-office-token', '')])[0]
            if not LOCAL.match(self.headers.get('host', '')) or not hmac.compare_digest(given, token):
                return self.deny(403, 'forbidden')
            if url.path == '/action':
                return self.answer(405, {'error': 'POST only'})
            if url.path == '/events':
                self.send_response(200)
                self.send_header('content-type', 'text/event-stream')
                self.send_header('cache-control', 'no-store')
                self.end_headers()
                seen = None
                try:
                    while True:
                        with state.lock:
                            if seen == state.version:
                                state.lock.wait(15)
                            current, text = state.version, state.text
                        if current != seen:
                            seen = current
                            self.wfile.write(f'data: {text}\n\n'.encode())
                        else:
                            self.wfile.write(b': ping\n\n')
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    return
            if url.path == '/state':
                self.send_response(200)
                self.send_header('content-type', TYPES['.json'])
                self.send_header('cache-control', 'no-store')
                self.end_headers()
                self.wfile.write(state.text.encode())
                return
            name = 'index.html' if url.path == '/' else unquote(url.path).lstrip('/')
            full = os.path.realpath(os.path.join(web, name))
            kind = TYPES.get(os.path.splitext(full)[1])
            if '..' in name or not full.startswith(web + os.sep) or kind is None or not os.path.isfile(full):
                return self.deny(404, 'not found')
            self.send_response(200)
            self.send_header('content-type', kind)
            self.send_header('cache-control', 'no-store')
            self.end_headers()
            with open(full, 'rb') as handle:
                self.wfile.write(handle.read())

    return Handler


def watch_parent(parent):
    while True:
        time.sleep(2)
        if os.getppid() != parent:
            os._exit(0)


def main():
    args = parse_args(sys.argv[1:])
    if not all(key in args for key in ('dir', 'web', 'token')):
        sys.stderr.write('usage: office_server.py --dir <state dir> --web <web dir> --token <token>\n')
        sys.exit(2)
    state = State(os.path.join(args['dir'], 'state.json'))
    state.refresh()

    def poll():
        while True:
            state.refresh()
            time.sleep(0.25)

    threading.Thread(target=poll, daemon=True).start()
    server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(args['web'], args['token'], state, args['dir']))
    server.daemon_threads = True
    port = server.server_address[1]
    port_file = os.path.join(args['dir'], 'server.json')
    with open(port_file + '.tmp', 'w', encoding='utf-8') as handle:
        json.dump({'port': port, 'token': args['token'], 'pid': os.getpid()}, handle)
    os.replace(port_file + '.tmp', port_file)
    sys.stdout.write(f'ready {port}\n')
    sys.stdout.flush()
    signal.signal(signal.SIGTERM, lambda *_: os._exit(0))
    parent = os.getppid()
    threading.Thread(target=watch_parent, args=(parent,), daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
