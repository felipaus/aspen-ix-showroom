"""Servidor local para ver la página sin que el navegador muestre una versión vieja.

Igual que `python3 -m http.server`, pero le pide al navegador que no guarde los
archivos, así cada recarga muestra los últimos cambios.

Uso, desde esta carpeta:
    python3 serve.py          # http://localhost:8080
    python3 serve.py 9000     # otro puerto
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"Sirviendo en http://localhost:{port}  (Ctrl+C para cortar)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
