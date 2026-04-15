#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class RAMHandler(BaseHTTPRequestHandler):
    def do_GET(self):
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
