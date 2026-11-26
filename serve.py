"""Servidor local para ver la página sin que el navegador muestre una versión vieja.

Igual que `python3 -m http.server`, pero le pide al navegador que no guarde los
archivos, así cada recarga muestra los últimos cambios. También responde pedidos
por partes (Range), que el navegador necesita para adelantar un video (la intro
salta a la parte en que la cámara sube).

Uso, desde esta carpeta:
    python3 serve.py          # http://localhost:8080
    python3 serve.py 9000     # otro puerto
"""

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start_s, end_s = match.groups()
        if start_s:
            start, end = int(start_s), int(end_s) if end_s else size - 1
        else:  # "bytes=-N": los últimos N bytes
            start, end = max(0, size - int(end_s or 0)), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416, "Rango inválido")
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"Sirviendo en http://localhost:{port}  (Ctrl+C para cortar)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
