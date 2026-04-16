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

DEFAULT_LAT = 45.5051   # Portland, OR
DEFAULT_LON = -122.6750

class WeatherHandler(BaseHTTPRequestHandler):
    def do_GET(self):
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
