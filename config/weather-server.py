#!/usr/bin/env python3
# weather-server.py — OpenWeatherMap proxy for Atsushi's PC
# Listens on 127.0.0.1:8092; Caddy reverse-proxies /weather here.
# Reads OPENWEATHERMAP_API_KEY from environment (never in source).
# Accepts optional ?lat=X&lon=Y query params from the client (set by
# browser Geolocation API in widgets.js). Falls back to Portland, OR
# coordinates if no params are supplied.
#
# Deploy: copy to ~/weather-server.py on Pi, then restart its service.
# Matches the structure of ram-server.py for consistency.

import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen
from urllib.error import URLError

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


_limiter = RateLimiter(max_calls=6, period_seconds=60)

# Daemon thread: evict stale IP buckets every 60s to prevent unbounded memory growth.
def _cleanup_loop():
    while True:
        time.sleep(60)
        _limiter.cleanup()

_t = threading.Thread(target=_cleanup_loop, daemon=True)
_t.start()

DEFAULT_LAT = 45.5051   # Portland, OR
DEFAULT_LON = -122.6750

class WeatherHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        ip = self.client_address[0]
        if not _limiter.is_allowed(ip):
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Retry-After', '60')
            self.end_headers()
            self.wfile.write(b'{"error":"rate limit exceeded"}')
            return
        if not self.path.startswith('/weather'):
            self.send_response(404)
            self.end_headers()
            return

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        try:
            lat = float(params['lat'][0]) if 'lat' in params else DEFAULT_LAT
            lon = float(params['lon'][0]) if 'lon' in params else DEFAULT_LON
        except (ValueError, IndexError):
            lat, lon = DEFAULT_LAT, DEFAULT_LON

        api_key = os.environ.get('OPENWEATHERMAP_API_KEY', '')
        url = (
            'https://api.openweathermap.org/data/2.5/weather'
            '?lat={}&lon={}&units=imperial&appid={}'.format(lat, lon, api_key)
        )

        try:
            with urlopen(url, timeout=10) as resp:
                body = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
        except URLError:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":"upstream failed"}')

    def log_message(self, format, *args):
        pass

HTTPServer(('127.0.0.1', 8092), WeatherHandler).serve_forever()
