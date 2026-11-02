#!/usr/bin/env python3
"""Serve the Wemaps map style lab on localhost using only Python's standard library."""
from __future__ import annotations
import http.server
import socket
import threading
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
START_PORT = 8765
END_PORT = 8785
ROOT = Path(__file__).resolve().parent

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, fmt: str, *args) -> None:
        print("[Wemaps Lab] " + (fmt % args))

def find_available_port() -> int:
    for port in range(START_PORT, END_PORT + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port found between {START_PORT} and {END_PORT}.")

def main() -> None:
    port = find_available_port()
    server = http.server.ThreadingHTTPServer((HOST, port), QuietHandler)
    server.daemon_threads = True
    url = f"http://{HOST}:{port}/"
    print()
    print("Wemaps — Violet Night Map Style Lab")
    print("-----------------------------------")
    print(f"Local address: {url}")
    print("The preview is available only on this computer (127.0.0.1).")
    print("Map tiles and the MapLibre library are loaded from the internet.")
    print("Keep this window open while using the preview.")
    print("Press Ctrl+C to stop the local server.")
    print()
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Wemaps Style Lab...")
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
