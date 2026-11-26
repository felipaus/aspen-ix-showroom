"""Baja de OpenStreetMap los lugares cercanos al lote (colegios, salud, compras...) y los guarda en showroom/nearby.geojson.

Por qué: la sección "Alrededores" del showroom muestra qué hay cerca con su distancia. Se baja una sola vez (Overpass es
lento) y queda en un archivo, igual que los edificios y las calles.

Uso, desde la carpeta showroom/ (volver a correrlo si cambia el lote):
    python3 tools/lugares_osm.py <lat> <lng> [radio_m] [por_categoría]
    python3 tools/lugares_osm.py -31.527967 -68.592140 1500 6

Se guardan los más cercanos de cada categoría que tengan nombre. Para agregar o sacar categorías, editar CATEGORIES.
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
OUTPUT = Path(__file__).resolve().parent.parent / "nearby.geojson"

# Categoría del showroom → etiquetas de OpenStreetMap que entran en ella.
CATEGORIES = {
    "educacion": [("amenity", "school"), ("amenity", "kindergarten"), ("amenity", "university"), ("amenity", "college")],
    "salud": [("amenity", "hospital"), ("amenity", "clinic"), ("amenity", "pharmacy"), ("amenity", "doctors")],
    "compras": [("shop", "supermarket"), ("shop", "mall"), ("shop", "convenience"), ("shop", "bakery")],
    "gastronomia": [("amenity", "restaurant"), ("amenity", "cafe"), ("amenity", "fast_food"), ("amenity", "ice_cream")],
    "verde": [("leisure", "park"), ("leisure", "playground"), ("leisure", "sports_centre"), ("leisure", "fitness_centre")],
    "servicios": [("amenity", "bank"), ("amenity", "atm"), ("amenity", "fuel"), ("amenity", "police")],
    "transporte": [("highway", "bus_stop")],
}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    lat, lng = float(sys.argv[1]), float(sys.argv[2])
    radius = float(sys.argv[3]) if len(sys.argv) > 3 else 1500
    per_category = int(sys.argv[4]) if len(sys.argv) > 4 else 6

    elements = fetch(lat, lng, radius)
    found = {c: {} for c in CATEGORIES}
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name")
        point = (el.get("lon"), el.get("lat")) if el["type"] == "node" else (el.get("center", {}).get("lon"), el.get("center", {}).get("lat"))
        if not name or point[0] is None:
            continue
        category, kind = classify(tags)
        if not category:
            continue
        dist = distance(lat, lng, point[1], point[0])
        key = name.strip().lower()
        best = found[category].get(key)
        if best is None or dist < best["distance"]:  # el mismo lugar puede venir como punto y como área
            found[category][key] = {"name": name.strip(), "kind": kind, "distance": dist, "point": point}

    features = []
    for category, places in found.items():
        for p in sorted(places.values(), key=lambda p: p["distance"])[:per_category]:
            features.append({
                "type": "Feature",
                "properties": {"category": category, "kind": p["kind"], "name": p["name"], "distance": round(p["distance"])},
                "geometry": {"type": "Point", "coordinates": [round(p["point"][0], 7), round(p["point"][1], 7)]},
            })
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False))
    counts = {c: sum(1 for f in features if f["properties"]["category"] == c) for c in CATEGORIES}
    print(f"{len(features)} lugares en {radius:.0f} m → {OUTPUT}")
    print("  " + ", ".join(f"{c}: {n}" for c, n in counts.items()))


def classify(tags):
    for category, pairs in CATEGORIES.items():
        for key, value in pairs:
            if tags.get(key) == value:
                return category, value
    return None, None


def fetch(lat, lng, radius):
    selectors = "".join(
        f'nwr["{k}"="{v}"]["name"](around:{radius:.0f},{lat},{lng});' for pairs in CATEGORIES.values() for k, v in pairs
    )
    query = f"[out:json][timeout:120];({selectors});out tags center;"
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


def distance(lat1, lng1, lat2, lng2):
    m_lat = 110_950
    m_lng = 111_320 * math.cos(math.radians(lat1))
    return math.hypot((lng2 - lng1) * m_lng, (lat2 - lat1) * m_lat)


if __name__ == "__main__":
    main()
