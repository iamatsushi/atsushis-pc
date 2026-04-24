#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

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


_limiter = RateLimiter(max_calls=10, period_seconds=10)

# Daemon thread: evict stale IP buckets every 60s to prevent unbounded memory growth.
def _cleanup_loop():
    while True:
        time.sleep(60)
        _limiter.cleanup()

_t = threading.Thread(target=_cleanup_loop, daemon=True)
_t.start()

class RAMHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        ip = self.client_address[0]
        if not _limiter.is_allowed(ip):
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Retry-After', '10')
            self.end_headers()
            self.wfile.write(b'{"error":"rate limit exceeded"}')
            return
        if self.path == '/ram':
            with open('/proc/meminfo') as f:
                lines = f.readlines()
            meminfo = {}
            for line in lines:
                parts = line.split()
                meminfo[parts[0].rstrip(':')] = int(parts[1])
            data = {
                'total': meminfo['MemTotal'],
                'available': meminfo['MemAvailable'],
                'used': meminfo['MemTotal'] - meminfo['MemAvailable']
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
    def log_message(self, format, *args):
        pass

HTTPServer(('127.0.0.1', 8091), RAMHandler).serve_forever()
