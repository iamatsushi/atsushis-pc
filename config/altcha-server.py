#!/usr/bin/env python3
# altcha-server.py — Altcha PoW challenge generator for Atsushi's PC
# Listens on 127.0.0.1:8093; Caddy reverse-proxies /altcha/challenge here.
# Reads ALTCHA_HMAC_SECRET from environment (never in source).
#
# Challenge protocol (matches altcha-lib spec):
#   1. Generate random salt (24 hex chars) and answer number in [0, MAX_NUMBER].
#   2. challenge = SHA-256(salt + str(number))  ← client brute-forces this
#   3. signature = HMAC-SHA256(ALTCHA_HMAC_SECRET, challenge)
#   4. Return JSON; client finds n where SHA-256(salt + n) == challenge,
#      then submits encoded payload for optional server-side verification later.
#
# Deploy: copy to ~/altcha-server.py on Pi, enable altcha-server systemd service.
# Matches the structure of ram-server.py and weather-server.py for consistency.

import os
import json
import hmac
import random
import hashlib
import secrets
from http.server import HTTPServer, BaseHTTPRequestHandler

import time
import threading

class RateLimiter:
    """Token bucket rate limiter — thread-safe, per-IP, in-memory."""
    def __init__(self, max_calls, period_seconds):
        self.max_calls = max_calls
        self.period = period_seconds
        self._buckets = {}
        self._lock = threading.Lock()

    def is_allowed(self, ip):
        self.cleanup()
        now = time.time()
        with self._lock:
            if ip not in self._buckets:
                self._buckets[ip] = {'tokens': self.max_calls, 'last': now}
            bucket = self._buckets[ip]
            elapsed = now - bucket['last']
            # Refill tokens proportionally to time elapsed
            bucket['tokens'] = min(
                self.max_calls,
                bucket['tokens'] + elapsed * (self.max_calls / self.period)
            )
            bucket['last'] = now
            if bucket['tokens'] >= 1:
                bucket['tokens'] -= 1
                return True
            return False

    def cleanup(self):
        """Remove stale buckets older than 2x the period (call periodically)."""
        now = time.time()
        with self._lock:
            stale = [ip for ip, b in self._buckets.items() if now - b['last'] > self.period * 2]
            for ip in stale:
                del self._buckets[ip]


_limiter = RateLimiter(max_calls=10, period_seconds=30)

# Daemon thread: evict stale IP buckets every 60s to prevent unbounded memory growth.
def _cleanup_loop():
    while True:
        time.sleep(60)
        _limiter.cleanup()

_t = threading.Thread(target=_cleanup_loop, daemon=True)
_t.start()

MAX_NUMBER = 10000  # client brute-forces up to this value; ~1-2s at typical hardware

class AltchaHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        ip = self.client_address[0]
        if not _limiter.is_allowed(ip):
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Retry-After', '30')
            self.end_headers()
            self.wfile.write(b'{"error":"rate limit exceeded"}')
            return
        if not self.path.startswith('/altcha/challenge'):
            self.send_response(404)
            self.end_headers()
            return

        hmac_key = os.environ.get('ALTCHA_HMAC_SECRET', '')

        # Fresh random salt and answer number per request — prevents replay attacks.
        salt = secrets.token_hex(12)       # 24 hex chars
        number = random.randint(0, MAX_NUMBER)

        # Challenge is the hash the client must reproduce by brute-forcing the number.
        challenge = hashlib.sha256('{}{}'.format(salt, number).encode()).hexdigest()

        # Signature lets the widget (and future server-side verification) confirm the
        # challenge was issued by this server, not crafted by an attacker.
        signature = hmac.new(
            hmac_key.encode('utf-8'),
            challenge.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        body = json.dumps({
            'algorithm': 'SHA-256',
            'challenge': challenge,
            'maxnumber': MAX_NUMBER,
            'salt':      salt,
            'signature': signature
        }).encode()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

HTTPServer(('127.0.0.1', 8093), AltchaHandler).serve_forever()
