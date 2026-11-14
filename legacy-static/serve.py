#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
本地预览服务器（仅用于开发）。

用法：
    python serve.py            # 默认 http://127.0.0.1:5173
    python serve.py 8080       # 指定端口

说明：这是一个纯静态站点，直接双击 index.html 也能打开，
      但用本地服务器访问更接近线上环境（相对路径、缓存行为一致）。
"""
import http.server
import os
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 开发时禁用缓存，改完刷新就能看到
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))


def main():
    os.chdir(ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = "http://127.0.0.1:%d/" % PORT
        print("NavPage 已启动：%s" % url)
        print("按 Ctrl+C 停止")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")


if __name__ == "__main__":
    main()
