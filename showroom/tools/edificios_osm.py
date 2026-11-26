"""Baja de OpenStreetMap los edificios alrededor del lote y los guarda en showroom/buildings.geojson.

Por qué: los edificios del mapa base (OpenFreeMap) vienen agrupados (cientos de edificios en una sola
figura), así que no se puede quitar solo el que está sobre el lote y tapa la torre. Este archivo trae cada
edificio por separado y ya sin los que tocan el lote.

Uso, desde la carpeta showroom/ (volver a correrlo si cambian las coordenadas o el tamaño del lote en data.js):
    python3 tools/edificios_osm.py <lat> <lng> <ancho_m> <fondo_m> [radio_m]
    python3 tools/edificios_osm.py -31.5352 -68.5262 34 22 1000

Tarda alrededor de un minuto (el servidor público de Overpass es lento). Si responde que está saturado
(502), se puede bajar la respuesta aparte (navegador o curl) y pasarla como sexto argumento:
    python3 tools/edificios_osm.py -31.5352 -68.5262 34 22 1000 overpass.json
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
LEVEL_HEIGHT_M = 3.2
DEFAULT_HEIGHT_M = 6  # casa de una planta, lo más común en San Juan cuando OSM no tiene altura
LOT_MARGIN_M = 4  # igual que el lote dibujado en el mapa (footprint(-4))
OUTPUT = Path(__file__).resolve().parent.parent / "buildings.geojson"


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    lat, lng, width, depth = (float(a) for a in sys.argv[1:5])
    radius = float(sys.argv[5]) if len(sys.argv) > 5 else 1000
    saved = sys.argv[6] if len(sys.argv) > 6 else None

    lot = lot_rectangle(lat, lng, width / 2 + LOT_MARGIN_M, depth / 2 + LOT_MARGIN_M)
    ways = json.loads(Path(saved).read_text())["elements"] if saved else fetch_buildings(lat, lng, radius)

    features, removed = [], 0
    for way in ways:
        ring = [(round(p["lon"], 7), round(p["lat"], 7)) for p in way.get("geometry", [])]
        if len(ring) < 4:
            continue
        if polygon_touches_rect(ring, lot):
            removed += 1
            continue
        height, min_height = heights(way.get("tags", {}))
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"height": height, "min_height": min_height},
        })

    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    size_kb = OUTPUT.stat().st_size // 1024
    print(f"{len(features)} edificios en {radius:.0f} m ({removed} quitados por tocar el lote) → {OUTPUT} ({size_kb} KB)")


def fetch_buildings(lat, lng, radius):
    query = f'[out:json][timeout:90];way["building"](around:{radius:.0f},{lat},{lng});out tags geom;'
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


def heights(tags):
    height = parse_meters(tags.get("height"))
    if height is None:
        levels = parse_meters(tags.get("building:levels"))
        height = levels * LEVEL_HEIGHT_M if levels else DEFAULT_HEIGHT_M
    min_height = parse_meters(tags.get("min_height"))
    if min_height is None:
        min_level = parse_meters(tags.get("building:min_level"))
        min_height = min_level * LEVEL_HEIGHT_M if min_level else 0
    return round(height, 1), round(min(min_height, height), 1)


def parse_meters(value):
    try:
        return float(str(value).replace("m", "").replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


def lot_rectangle(lat, lng, half_width_m, half_depth_m):
    dlng = half_width_m / (111_320 * math.cos(math.radians(lat)))
    dlat = half_depth_m / 110_950
    return (lng - dlng, lat - dlat, lng + dlng, lat + dlat)


def polygon_touches_rect(ring, rect):
    west, south, east, north = rect
    if any(west <= x <= east and south <= y <= north for x, y in ring):
        return True
    corners = [(west, south), (east, south), (east, north), (west, north)]
    if any(point_in_polygon(c, ring) for c in corners):
        return True
    rect_edges = list(zip(corners, corners[1:] + corners[:1]))
    return any(segments_cross(a, b, c, d) for a, b in zip(ring, ring[1:]) for c, d in rect_edges)


def point_in_polygon(point, ring):
    x, y = point
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def segments_cross(a, b, c, d):
    def side(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    return side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0


if __name__ == "__main__":
    main()
