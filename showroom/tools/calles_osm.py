"""Baja de OpenStreetMap las calles que se marcan en la intro del showroom y las guarda en showroom/streets.geojson.

Por qué: la intro resalta las calles del lote (SITE_PLAN.streets en data.js). Se guardan recortadas a un radio
alrededor del lote para que la marca no siga kilómetros por la avenida.

Uso, desde la carpeta showroom/ (volver a correrlo si cambia el lote o las calles en data.js):
    python3 tools/calles_osm.py <lat> <lng> "<calle>" ["<calle>" ...] [--radio 450]
    python3 tools/calles_osm.py -31.527967 -68.592140 "Santo Domingo" "Avenida Libertador General San Martín"

Los nombres tienen que ser los de OpenStreetMap (se ven en openstreetmap.org tocando la calle).
"""

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_RADIUS_M = 450
OUTPUT = Path(__file__).resolve().parent.parent / "streets.geojson"


def main():
    args = sys.argv[1:]
    radius = DEFAULT_RADIUS_M
    if "--radio" in args:
        i = args.index("--radio")
        radius = float(args[i + 1])
        del args[i : i + 2]
    if len(args) < 3:
        sys.exit(__doc__)
    lat, lng = float(args[0]), float(args[1])
    names = args[2:]

    ways = fetch_streets(lat, lng, names, radius * 1.5)
    features = []
    for way in ways:
        for line in clip(way["geometry"], lat, lng, radius):
            features.append({
                "type": "Feature",
                "properties": {"name": way["tags"]["name"]},
                "geometry": {"type": "LineString", "coordinates": line},
            })
    found = sorted({f["properties"]["name"] for f in features})
    missing = [n for n in names if n not in found]
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False))
    print(f"{len(features)} tramos de {', '.join(found) or 'ninguna calle'} → {OUTPUT}")
    if missing:
        print(f"No se encontró en {radius:.0f} m: {', '.join(missing)} (revisar el nombre en OpenStreetMap)")


def fetch_streets(lat, lng, names, radius):
    selectors = "".join(
        f'way["highway"]["name"="{n.replace(chr(34), "")}"](around:{radius:.0f},{lat},{lng});' for n in names
    )
    query = f"[out:json][timeout:90];({selectors});out tags geom;"
    request = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "parrot-showroom/1.0"},  # sin User-Agent Overpass responde 406
    )
    for attempt in range(1, 4):  # el servidor público a veces responde 502/504 cuando está cargado
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.load(response)["elements"]
        except urllib.error.HTTPError as error:
            if attempt == 3 or error.code not in (429, 502, 503, 504):
                raise
            print(f"Overpass respondió {error.code}, reintento {attempt}/2…")
            time.sleep(10 * attempt)


def clip(geometry, lat, lng, radius):
    """Parte la calle en tramos que quedan dentro del radio (por puntos, densificando cada ~5 m)."""
    m_lat = 110_950
    m_lng = 111_320 * math.cos(math.radians(lat))
    inside = lambda p: math.hypot((p[0] - lng) * m_lng, (p[1] - lat) * m_lat) <= radius
    points = []
    for a, b in zip(geometry, geometry[1:]):
        pa, pb = (a["lon"], a["lat"]), (b["lon"], b["lat"])
        length = math.hypot((pb[0] - pa[0]) * m_lng, (pb[1] - pa[1]) * m_lat)
        steps = max(1, int(length // 5))
        for s in range(steps):
            t = s / steps
            points.append((pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t))
    if geometry:
        points.append((geometry[-1]["lon"], geometry[-1]["lat"]))

    lines, current = [], []
    for p in points:
        if inside(p):
            current.append([round(p[0], 7), round(p[1], 7)])
        elif current:
            lines.append(current)
            current = []
    if current:
        lines.append(current)
    return [line for line in lines if len(line) >= 2]


if __name__ == "__main__":
    main()
